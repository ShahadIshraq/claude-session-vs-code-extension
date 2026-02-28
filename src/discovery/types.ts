export interface ParsedSession {
  readonly sessionId: string;
  readonly cwd: string;
  readonly titleSourceRaw: string;
}

export interface SessionPrompt {
  readonly promptId: string;
  readonly sessionId: string;
  readonly promptRaw: string;
  readonly promptTitle: string;
  readonly responseRaw?: string;
  readonly timestampIso?: string;
  readonly timestampMs?: number;
}

export interface DiscoveryResult {
  readonly sessionsByWorkspace: Map<string, import("../models").SessionNode[]>;
  readonly globalInfoMessage?: string;
}

export interface TranscriptCandidate {
  readonly transcriptPath: string;
  readonly updatedAt: number;
  readonly parsed: ParsedSession;
}

export interface CachedPromptList {
  readonly mtimeMs: number;
  readonly prompts: SessionPrompt[];
}

export interface CachedSessionMeta {
  readonly mtimeMs: number;
  readonly parsed: ParsedSession;
}

export interface TranscriptRecord {
  readonly type?: string;
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly timestamp?: string;
  readonly uuid?: string;
  readonly customTitle?: string;
  readonly agentName?: string;
  readonly message?: {
    readonly role?: string;
    readonly content?: unknown;
  };
}

export interface SessionTitleSourceOptions {
  readonly latestExplicitTitle?: string;
  readonly firstPromptRaw?: string;
  readonly firstUserRaw?: string;
}

export interface CachedContentText {
  readonly mtimeMs: number;
  readonly contentText: string;
}

export interface SearchableEntry {
  readonly sessionId: string;
  readonly transcriptPath: string;
  readonly title: string;
  readonly cwd: string;
  readonly updatedAt: number;
  readonly contentText: string;
}

export interface ISessionDiscoveryService {
  discover(workspaceFolders: readonly import("vscode").WorkspaceFolder[]): Promise<DiscoveryResult>;
  getUserPrompts(session: import("../models").SessionNode): Promise<SessionPrompt[]>;
  getSearchableEntries(workspaceFolders: readonly import("vscode").WorkspaceFolder[]): Promise<SearchableEntry[]>;
}
