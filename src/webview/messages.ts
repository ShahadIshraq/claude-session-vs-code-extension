export interface WebviewPromptItem {
  readonly promptId: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly promptIndex: number;
  readonly promptTitle: string;
  readonly promptRaw: string;
  readonly responseRaw?: string;
  readonly timestampIso?: string;
  readonly timestampMs?: number;
  readonly highlightRanges?: [number, number][];
  readonly matchType?: "title" | "prompt" | "response";
}

export interface WebviewSessionItem {
  readonly sessionId: string;
  readonly title: string;
  readonly description: string;
  readonly tooltip: string;
  readonly transcriptPath: string;
  readonly cwd: string;
  readonly updatedAt: number;
  readonly prompts?: WebviewPromptItem[];
}

export interface WebviewWorkspaceGroup {
  readonly workspaceUri: string;
  readonly workspaceName: string;
  readonly sessions: WebviewSessionItem[];
  readonly infoMessage?: string;
}

export interface WebviewTreeState {
  readonly workspaces: WebviewWorkspaceGroup[];
  readonly filterQuery: string | undefined;
  readonly selectionMode: boolean;
  readonly checkedSessionIds: string[];
  readonly expandedWorkspaces: string[];
  readonly expandedSessions: string[];
}

// Extension → Webview
export type ExtensionToWebviewMessage =
  | { type: "updateState"; state: WebviewTreeState }
  | { type: "startRename"; sessionId: string }
  | { type: "cancelRename" }
  | { type: "focusSearch" };

// Webview → Extension
export type WebviewToExtensionMessage =
  | { type: "openSession"; sessionId: string }
  | { type: "openSessionDangerously"; sessionId: string }
  | { type: "renameSession"; sessionId: string; newTitle: string }
  | { type: "renameCancelled" }
  | { type: "deleteSession"; sessionId: string }
  | { type: "toggleCheck"; sessionId: string }
  | { type: "toggleWorkspaceExpand"; workspaceUri: string }
  | { type: "toggleSessionExpand"; sessionId: string }
  | {
      type: "openPromptPreview";
      promptId: string;
      sessionId: string;
      sessionTitle: string;
      promptIndex: number;
      promptTitle: string;
      promptRaw: string;
      responseRaw?: string;
      timestampIso?: string;
    }
  | { type: "clearFilter" }
  | { type: "deleteChecked" }
  | { type: "search"; query: string };
