import * as fs from "fs";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";
import { SessionNode } from "../models";
import { extractText, isDisplayableUserPrompt, isRecord } from "./content";
import { isPathWithin, normalizeFsPath } from "./pathUtils";
import { buildTitle, chooseSessionTitleRaw, parseRenameCommandArgs, parseRenameStdoutTitle, toNonEmptySingleLine } from "./title";
import { CachedPromptList, DiscoveryResult, ParsedSession, SessionPrompt, TranscriptCandidate } from "./types";

export class ClaudeSessionDiscoveryService {
  private readonly projectsRoot: string;
  private readonly promptCacheByPath = new Map<string, CachedPromptList>();

  public constructor(private readonly outputChannel: vscode.OutputChannel) {
    this.projectsRoot = path.join(os.homedir(), ".claude", "projects");
  }

  public async discover(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<DiscoveryResult> {
    const sessionsByWorkspace = new Map<string, SessionNode[]>();
    for (const folder of workspaceFolders) {
      sessionsByWorkspace.set(folder.uri.toString(), []);
    }

    if (workspaceFolders.length === 0) {
      return { sessionsByWorkspace, globalInfoMessage: "Open a folder to view Claude sessions." };
    }

    const rootExists = await this.exists(this.projectsRoot);
    if (!rootExists) {
      return {
        sessionsByWorkspace,
        globalInfoMessage: `No Claude project history found at ${this.projectsRoot}.`
      };
    }

    const files = await this.collectTranscriptFiles(this.projectsRoot);
    const candidates: TranscriptCandidate[] = [];

    for (const file of files) {
      const parsed = await this.parseTranscriptFile(file);
      if (!parsed) {
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = await fsp.stat(file);
      } catch (error) {
        this.outputChannel.appendLine(`[discovery] stat failed for ${file}: ${String(error)}`);
        continue;
      }

      candidates.push({
        transcriptPath: file,
        updatedAt: stat.mtimeMs,
        parsed
      });
    }

    const byWorkspaceAndSession = new Map<string, Map<string, SessionNode>>();
    for (const workspace of workspaceFolders) {
      byWorkspaceAndSession.set(workspace.uri.toString(), new Map<string, SessionNode>());
    }

    for (const candidate of candidates) {
      const targetWorkspace = this.matchWorkspace(candidate.parsed.cwd, workspaceFolders);
      if (!targetWorkspace) {
        continue;
      }

      const workspaceKey = targetWorkspace.uri.toString();
      const sessionNode: SessionNode = {
        kind: "session",
        sessionId: candidate.parsed.sessionId,
        cwd: candidate.parsed.cwd,
        transcriptPath: candidate.transcriptPath,
        title: buildTitle(candidate.parsed.titleSourceRaw, candidate.parsed.sessionId),
        updatedAt: candidate.updatedAt
      };

      const sessions = byWorkspaceAndSession.get(workspaceKey);
      if (!sessions) {
        continue;
      }

      const existing = sessions.get(sessionNode.sessionId);
      if (!existing || existing.updatedAt < sessionNode.updatedAt) {
        sessions.set(sessionNode.sessionId, sessionNode);
      }
    }

    for (const workspace of workspaceFolders) {
      const workspaceKey = workspace.uri.toString();
      const sessionMap = byWorkspaceAndSession.get(workspaceKey);
      const list = Array.from(sessionMap?.values() ?? []);
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      sessionsByWorkspace.set(workspaceKey, list);
    }

    return { sessionsByWorkspace };
  }

  public async getUserPrompts(session: SessionNode): Promise<SessionPrompt[]> {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(session.transcriptPath);
    } catch (error) {
      this.outputChannel.appendLine(
        `[discovery] stat failed while reading prompts for ${session.transcriptPath}: ${String(error)}`
      );
      return [];
    }

    const cached = this.promptCacheByPath.get(session.transcriptPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.prompts;
    }

    const prompts = await this.parseAllUserPrompts(session.transcriptPath, session.sessionId);
    this.promptCacheByPath.set(session.transcriptPath, {
      mtimeMs: stat.mtimeMs,
      prompts
    });

    return prompts;
  }

  private async collectTranscriptFiles(rootDir: string): Promise<string[]> {
    const collected: string[] = [];
    const stack = [rootDir];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) {
        continue;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(currentDir, { withFileTypes: true });
      } catch (error) {
        this.outputChannel.appendLine(`[discovery] readdir failed for ${currentDir}: ${String(error)}`);
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === "subagents") {
            continue;
          }
          stack.push(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        if (!entry.name.endsWith(".jsonl")) {
          continue;
        }

        if (entry.name.startsWith("agent-")) {
          continue;
        }

        collected.push(fullPath);
      }
    }

    return collected;
  }

  private async parseTranscriptFile(transcriptPath: string): Promise<ParsedSession | null> {
    const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let sessionId: string | undefined;
    let cwd: string | undefined;
    let firstPromptRaw: string | undefined;
    let firstUserRaw: string | undefined;
    let latestExplicitTitle: string | undefined;

    try {
      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          this.outputChannel.appendLine(`[discovery] malformed JSON in ${transcriptPath}: ${String(error)}`);
          continue;
        }

        if (!isRecord(parsed)) {
          continue;
        }

        if (!sessionId && typeof parsed.sessionId === "string" && parsed.sessionId.trim() !== "") {
          sessionId = parsed.sessionId;
        }

        if (!cwd && typeof parsed.cwd === "string" && parsed.cwd.trim() !== "") {
          cwd = parsed.cwd;
        }

        if (parsed.type === "custom-title") {
          const customTitle = toNonEmptySingleLine(parsed.customTitle);
          if (customTitle) {
            latestExplicitTitle = customTitle;
          }
        }

        if (parsed.type === "agent-name") {
          const agentName = toNonEmptySingleLine(parsed.agentName);
          if (agentName) {
            latestExplicitTitle = agentName;
          }
        }

        if (parsed.type === "user" && parsed.message?.role === "user") {
          const text = extractText(parsed.message.content);
          if (text.trim()) {
            if (!firstUserRaw) {
              firstUserRaw = text;
            }
            if (!firstPromptRaw && isDisplayableUserPrompt(text)) {
              firstPromptRaw = text;
            }

            const renameArgsTitle = parseRenameCommandArgs(text);
            if (renameArgsTitle) {
              latestExplicitTitle = renameArgsTitle;
            }

            const renameStdoutTitle = parseRenameStdoutTitle(text);
            if (renameStdoutTitle) {
              latestExplicitTitle = renameStdoutTitle;
            }
          }
        }
      }
    } finally {
      rl.close();
      stream.close();
    }

    if (!sessionId || !cwd) {
      return null;
    }

    return {
      sessionId,
      cwd,
      titleSourceRaw: chooseSessionTitleRaw({
        latestExplicitTitle,
        firstPromptRaw,
        firstUserRaw
      }) ?? ""
    };
  }

  private async parseAllUserPrompts(transcriptPath: string, fallbackSessionId: string): Promise<SessionPrompt[]> {
    const stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const prompts: SessionPrompt[] = [];
    let promptIndex = 0;

    try {
      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          this.outputChannel.appendLine(`[discovery] malformed JSON in ${transcriptPath}: ${String(error)}`);
          continue;
        }

        if (!isRecord(parsed)) {
          continue;
        }

        if (!(parsed.type === "user" && parsed.message?.role === "user")) {
          continue;
        }

        const promptRaw = extractText(parsed.message.content);
        if (!promptRaw.trim()) {
          continue;
        }

        if (!isDisplayableUserPrompt(promptRaw)) {
          continue;
        }

        const timestampIso = typeof parsed.timestamp === "string" ? parsed.timestamp : undefined;
        const parsedTimestamp = timestampIso ? Date.parse(timestampIso) : Number.NaN;
        const timestampMs = Number.isFinite(parsedTimestamp) ? parsedTimestamp : undefined;
        const sessionId =
          typeof parsed.sessionId === "string" && parsed.sessionId.trim() !== ""
            ? parsed.sessionId
            : fallbackSessionId;

        prompts.push({
          promptId:
            typeof parsed.uuid === "string" && parsed.uuid.trim() !== ""
              ? parsed.uuid
              : `${fallbackSessionId}:${promptIndex}`,
          sessionId,
          promptRaw,
          promptTitle: buildTitle(promptRaw, fallbackSessionId),
          timestampIso,
          timestampMs
        });
        promptIndex += 1;
      }
    } finally {
      rl.close();
      stream.close();
    }

    return prompts;
  }

  private matchWorkspace(
    sessionCwd: string,
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): vscode.WorkspaceFolder | undefined {
    const normalizedCwd = normalizeFsPath(sessionCwd);
    const matching = workspaceFolders
      .filter((folder) => isPathWithin(normalizedCwd, normalizeFsPath(folder.uri.fsPath)))
      .sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);

    return matching[0];
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fsp.access(targetPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
