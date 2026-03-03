import * as vscode from "vscode";
import { SessionNode } from "../models";
import { ISessionDiscoveryService, SessionPrompt } from "../discovery/types";
import { formatAgeToken, truncateForTreeLabel, findHighlightRanges } from "../utils/formatting";
import { WebviewTreeState, WebviewWorkspaceGroup, WebviewSessionItem, WebviewPromptItem } from "./messages";

export class SessionTreeStateManager {
  private readonly _onDidChangeState = new vscode.EventEmitter<void>();
  public readonly onDidChangeState = this._onDidChangeState.event;

  private sessionsByWorkspace = new Map<string, SessionNode[]>();
  private globalInfoMessage: string | undefined;
  private filterQuery: string | undefined;
  private filteredSessionIds: Set<string> | undefined;
  private _selectionMode = false;
  private checkedSessionIds = new Set<string>();
  private expandedWorkspaces = new Set<string>();
  private expandedSessions = new Set<string>();
  private promptsCache = new Map<string, SessionPrompt[]>();
  private hasLoaded = false;
  private fireTimeout: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly discoveryService: ISessionDiscoveryService) {}

  public get selectionMode(): boolean {
    return this._selectionMode;
  }

  public getFilterQuery(): string | undefined {
    return this.filterQuery;
  }

  public async refresh(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const result = await this.discoveryService.discover(workspaceFolders);
    this.sessionsByWorkspace = result.sessionsByWorkspace;
    this.globalInfoMessage = result.globalInfoMessage;
    this.hasLoaded = true;
    this.promptsCache.clear();

    // Auto-expand all workspaces on first load
    if (this.expandedWorkspaces.size === 0) {
      for (const folder of workspaceFolders) {
        this.expandedWorkspaces.add(folder.uri.toString());
      }
    }

    this._onDidChangeState.fire();
  }

  public setFilter(query: string | undefined, matchingSessionIds: Set<string> | undefined): void {
    this.filterQuery = query;
    this.filteredSessionIds = matchingSessionIds;
    this.scheduleStateChange();
  }

  public setSelectionMode(enabled: boolean): void {
    this._selectionMode = enabled;
    if (!enabled) {
      this.checkedSessionIds.clear();
    }
    this.scheduleStateChange();
  }

  public toggleCheck(sessionId: string): void {
    if (this.checkedSessionIds.has(sessionId)) {
      this.checkedSessionIds.delete(sessionId);
    } else {
      this.checkedSessionIds.add(sessionId);
    }
    this.scheduleStateChange();
  }

  public getCheckedSessions(): SessionNode[] {
    const result: SessionNode[] = [];
    for (const sessions of this.sessionsByWorkspace.values()) {
      for (const session of sessions) {
        if (this.checkedSessionIds.has(session.sessionId)) {
          result.push(session);
        }
      }
    }
    return result;
  }

  public clearChecked(): void {
    this.checkedSessionIds.clear();
    this.scheduleStateChange();
  }

  public toggleWorkspaceExpand(workspaceUri: string): void {
    if (this.expandedWorkspaces.has(workspaceUri)) {
      this.expandedWorkspaces.delete(workspaceUri);
    } else {
      this.expandedWorkspaces.add(workspaceUri);
    }
    this.scheduleStateChange();
  }

  public toggleSessionExpand(sessionId: string): void {
    if (this.expandedSessions.has(sessionId)) {
      this.expandedSessions.delete(sessionId);
    } else {
      this.expandedSessions.add(sessionId);
      // Eagerly load prompts
      this.loadPromptsForSession(sessionId);
    }
    this.scheduleStateChange();
  }

  public getSessionById(sessionId: string): SessionNode | undefined {
    for (const sessions of this.sessionsByWorkspace.values()) {
      const found = sessions.find((s) => s.sessionId === sessionId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  public hasCheckedSessions(): boolean {
    return this.checkedSessionIds.size > 0;
  }

  public getPromptById(sessionId: string, promptId: string): SessionPrompt | undefined {
    const prompts = this.promptsCache.get(sessionId);
    if (!prompts) {
      return undefined;
    }
    return prompts.find((p) => p.promptId === promptId);
  }

  public getPromptIndex(sessionId: string, promptId: string): number {
    const prompts = this.promptsCache.get(sessionId);
    if (!prompts) {
      return 0;
    }
    const idx = prompts.findIndex((p) => p.promptId === promptId);
    return idx >= 0 ? idx : 0;
  }

  public async buildWebviewState(): Promise<WebviewTreeState> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const workspaces: WebviewWorkspaceGroup[] = [];

    for (const folder of workspaceFolders) {
      const uri = folder.uri.toString();
      let sessions = this.sessionsByWorkspace.get(uri) ?? [];
      let infoMessage: string | undefined;

      if (this.filteredSessionIds !== undefined) {
        sessions = sessions.filter((s) => this.filteredSessionIds!.has(s.sessionId));
        if (sessions.length === 0) {
          infoMessage = "No matches in this folder.";
        }
      } else if (sessions.length === 0) {
        if (!this.hasLoaded) {
          infoMessage = "Loading sessions...";
        } else if (this.globalInfoMessage) {
          infoMessage = this.globalInfoMessage;
        } else {
          infoMessage = "No Claude sessions found for this folder.";
        }
      }

      const sessionItems: WebviewSessionItem[] = [];
      for (const session of sessions) {
        const prompts = await this.getPromptsForSession(session);
        const promptItems: WebviewPromptItem[] = prompts.map((prompt, index) => {
          const label = truncateForTreeLabel(prompt.promptTitle, 64);
          const highlightRanges = this.filterQuery ? findHighlightRanges(label, this.filterQuery) : [];
          const lowerQuery = this.filterQuery?.toLowerCase();
          const rawMatches = lowerQuery ? prompt.promptRaw.toLowerCase().includes(lowerQuery) : false;
          const responseMatches =
            lowerQuery && prompt.responseRaw ? prompt.responseRaw.toLowerCase().includes(lowerQuery) : false;

          let matchType: "title" | "prompt" | "response" | undefined;
          if (highlightRanges.length > 0) {
            matchType = "title";
          } else if (rawMatches) {
            matchType = "prompt";
          } else if (responseMatches) {
            matchType = "response";
          }

          return {
            promptId: prompt.promptId,
            sessionId: prompt.sessionId,
            sessionTitle: session.title,
            promptIndex: index,
            promptTitle: label,
            promptRaw: prompt.promptRaw,
            responseRaw: prompt.responseRaw,
            timestampIso: prompt.timestampIso,
            timestampMs: prompt.timestampMs,
            highlightRanges: highlightRanges.length > 0 ? highlightRanges : undefined,
            matchType
          };
        });

        sessionItems.push({
          sessionId: session.sessionId,
          title: session.title,
          description: formatAgeToken(session.updatedAt),
          tooltip: [
            `Session: ${session.sessionId}`,
            `Title: ${session.title}`,
            `Last used: ${new Date(session.updatedAt).toLocaleString()}`,
            `CWD: ${session.cwd}`,
            `Transcript: ${session.transcriptPath}`
          ].join("\n"),
          transcriptPath: session.transcriptPath,
          cwd: session.cwd,
          updatedAt: session.updatedAt,
          prompts: this.expandedSessions.has(session.sessionId) ? promptItems : undefined
        });
      }

      workspaces.push({
        workspaceUri: uri,
        workspaceName: folder.name,
        sessions: sessionItems,
        infoMessage: sessions.length === 0 ? infoMessage : undefined
      });
    }

    if (workspaceFolders.length === 0) {
      workspaces.push({
        workspaceUri: "",
        workspaceName: "",
        sessions: [],
        infoMessage: "Open a folder to view Claude sessions."
      });
    }

    return {
      workspaces,
      filterQuery: this.filterQuery,
      selectionMode: this._selectionMode,
      checkedSessionIds: Array.from(this.checkedSessionIds),
      expandedWorkspaces: Array.from(this.expandedWorkspaces),
      expandedSessions: Array.from(this.expandedSessions)
    };
  }

  private async getPromptsForSession(session: SessionNode): Promise<SessionPrompt[]> {
    const cached = this.promptsCache.get(session.sessionId);
    if (cached) {
      return cached;
    }
    const prompts = await this.discoveryService.getUserPrompts(session);
    this.promptsCache.set(session.sessionId, prompts);
    return prompts;
  }

  private async loadPromptsForSession(sessionId: string): Promise<void> {
    const session = this.getSessionById(sessionId);
    if (!session) {
      return;
    }
    if (this.promptsCache.has(sessionId)) {
      return;
    }
    const prompts = await this.discoveryService.getUserPrompts(session);
    this.promptsCache.set(sessionId, prompts);
    this._onDidChangeState.fire();
  }

  private scheduleStateChange(): void {
    if (this.fireTimeout !== undefined) {
      clearTimeout(this.fireTimeout);
    }
    this.fireTimeout = setTimeout(() => {
      this.fireTimeout = undefined;
      this._onDidChangeState.fire();
    }, 16);
  }

  public dispose(): void {
    if (this.fireTimeout !== undefined) {
      clearTimeout(this.fireTimeout);
    }
    this._onDidChangeState.dispose();
  }
}
