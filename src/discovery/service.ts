import * as fs from "fs";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { SessionNode } from "../models";
import { buildTitle } from "./title";
import {
  CachedPromptList,
  CachedSessionMeta,
  DiscoveryResult,
  ISessionDiscoveryService,
  SessionPrompt,
  TranscriptCandidate
} from "./types";
import { collectTranscriptFiles, exists } from "./scan";
import { parseTranscriptFile, matchWorkspacePrecomputed, precomputeWorkspacePaths } from "./parseSession";
import { parseAllUserPrompts } from "./parsePrompts";

const BATCH_CONCURRENCY = 8;

export class ClaudeSessionDiscoveryService implements ISessionDiscoveryService {
  private readonly projectsRoot: string;
  private readonly promptCacheByPath = new Map<string, CachedPromptList>();
  private readonly sessionCacheByPath = new Map<string, CachedSessionMeta>();

  public constructor(
    private readonly outputChannel: vscode.OutputChannel,
    projectsRoot?: string
  ) {
    this.projectsRoot = projectsRoot ?? path.join(os.homedir(), ".claude", "projects");
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
    const candidates = await this.processFilesBatched(files, log);

    // Prune session cache entries for deleted files
    const fileSet = new Set(files);
    for (const cachedPath of this.sessionCacheByPath.keys()) {
      if (!fileSet.has(cachedPath)) {
        this.sessionCacheByPath.delete(cachedPath);
      }
    }

    const precomputed = precomputeWorkspacePaths(workspaceFolders);
    const byWorkspaceAndSession = new Map<string, Map<string, SessionNode>>();
    for (const workspace of workspaceFolders) {
      byWorkspaceAndSession.set(workspace.uri.toString(), new Map<string, SessionNode>());
    }

    for (const candidate of candidates) {
      const targetWorkspace = matchWorkspacePrecomputed(candidate.parsed.cwd, precomputed);
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

  private async processFilesBatched(files: string[], log: (msg: string) => void): Promise<TranscriptCandidate[]> {
    const candidates: TranscriptCandidate[] = [];

    for (let i = 0; i < files.length; i += BATCH_CONCURRENCY) {
      const batch = files.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((file) => this.processOneFile(file, log)));

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          candidates.push(result.value);
        } else if (result.status === "rejected") {
          log(`[discovery] unexpected batch error: ${String(result.reason)}`);
        }
      }
    }

    return candidates;
  }

  private async processOneFile(file: string, log: (msg: string) => void): Promise<TranscriptCandidate | null> {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(file);
    } catch (error) {
      log(`[discovery] stat failed for ${file}: ${String(error)}`);
      return null;
    }

    const cached = this.sessionCacheByPath.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return {
        transcriptPath: file,
        updatedAt: stat.mtimeMs,
        parsed: cached.parsed
      };
    }

    const parsed = await parseTranscriptFile(file, log);
    if (!parsed) {
      return null;
    }

    this.sessionCacheByPath.set(file, { mtimeMs: stat.mtimeMs, parsed });

    return {
      transcriptPath: file,
      updatedAt: stat.mtimeMs,
      parsed
    };
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
