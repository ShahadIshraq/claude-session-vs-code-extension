import * as vscode from "vscode";

export interface SessionNode {
  readonly kind: "session";
  readonly sessionId: string;
  readonly cwd: string;
  readonly transcriptPath: string;
  readonly title: string;
  readonly updatedAt: number;
}

export interface WorkspaceNode {
  readonly kind: "workspace";
  readonly folder: vscode.WorkspaceFolder;
}

export interface InfoNode {
  readonly kind: "info";
  readonly workspaceFolderUri?: string;
  readonly label: string;
  readonly description?: string;
}

export interface SessionPromptNode {
  readonly kind: "sessionPrompt";
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly promptId: string;
  readonly promptIndex: number;
  readonly promptTitle: string;
  readonly promptRaw: string;
  readonly responseRaw?: string;
  readonly timestampIso?: string;
  readonly timestampMs?: number;
}

export type ClaudeTreeNode = WorkspaceNode | SessionNode | InfoNode | SessionPromptNode;
