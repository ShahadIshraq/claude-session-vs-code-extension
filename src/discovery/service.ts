import * as fs from "fs";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { SessionNode } from "../models";
import { buildTitle } from "./title";
import { CachedPromptList, DiscoveryResult, ISessionDiscoveryService, SessionPrompt, TranscriptCandidate } from "./types";
import { collectTranscriptFiles, exists } from "./scan";
import { parseTranscriptFile, matchWorkspace } from "./parseSession";
import { parseAllUserPrompts } from "./parsePrompts";

export class ClaudeSessionDiscoveryService implements ISessionDiscoveryService {
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

    const rootExists = await exists(this.projectsRoot);
    if (!rootExists) {
      return {
        sessionsByWorkspace,
        globalInfoMessage: `No Claude project history found at ${this.projectsRoot}.`
      };
    }

    const log = (msg: string) => this.outputChannel.appendLine(msg);
    const files = await collectTranscriptFiles(this.projectsRoot, log);
    const candidates: TranscriptCandidate[] = [];

    for (const file of files) {
      const parsed = await parseTranscriptFile(file, log);
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
      const targetWorkspace = matchWorkspace(candidate.parsed.cwd, workspaceFolders);
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

    const log = (msg: string) => this.outputChannel.appendLine(msg);
    const prompts = await parseAllUserPrompts(session.transcriptPath, session.sessionId, log);
    this.promptCacheByPath.set(session.transcriptPath, {
      mtimeMs: stat.mtimeMs,
      prompts
    });

    return prompts;
  }
}
