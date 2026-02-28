import * as vscode from "vscode";
import { ISessionDiscoveryService } from "./discovery";
import { ClaudeTreeNode, InfoNode, SessionNode, SessionPromptNode, WorkspaceNode } from "./models";

export class ClaudeSessionsTreeDataProvider implements vscode.TreeDataProvider<ClaudeTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ClaudeTreeNode | undefined>();

  private sessionsByWorkspace = new Map<string, SessionNode[]>();
  private globalInfoMessage: string | undefined;
  private filterQuery: string | undefined;
  private filteredSessionIds: Set<string> | undefined;
  private hasLoaded = false;

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly discoveryService: ISessionDiscoveryService) {}

  public setFilter(query: string | undefined, matchingSessionIds: Set<string> | undefined): void {
    this.filterQuery = query;
    this.filteredSessionIds = matchingSessionIds;
    this.onDidChangeTreeDataEmitter.fire(undefined);
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
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: ClaudeTreeNode): vscode.TreeItem {
    if (element.kind === "workspace") {
      const item = new vscode.TreeItem(element.folder.name, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "claudeWorkspace";
      item.iconPath = new vscode.ThemeIcon("folder");
      item.tooltip = element.folder.uri.fsPath;
      return item;
    }

    if (element.kind === "session") {
      const lastUsedLabel = formatRelativeTime(element.updatedAt);
      const lastUsedCompact = formatAgeToken(element.updatedAt);
      const lastUsedAbsolute = new Date(element.updatedAt).toLocaleString();
      const listLabel = truncateForTreeLabel(element.title, 35);
      const item = new vscode.TreeItem(listLabel, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = lastUsedCompact;
      item.contextValue = "claudeSession";
      item.tooltip = [
        `Session: ${element.sessionId}`,
        `Title: ${element.title}`,
        `Last used: ${lastUsedAbsolute} (${lastUsedLabel})`,
        `CWD: ${element.cwd}`,
        `Transcript: ${element.transcriptPath}`
      ].join("\n");
      item.command = {
        command: "claudeSessions.openSession",
        title: "Open Claude Session",
        arguments: [element]
      };
      return item;
    }

    if (element.kind === "sessionPrompt") {
      const label = truncateForTreeLabel(element.promptTitle, 64);
      const labelHighlights = this.filterQuery ? findHighlightRanges(label, this.filterQuery) : [];
      const lowerQuery = this.filterQuery?.toLowerCase();
      const rawMatches = lowerQuery ? element.promptRaw.toLowerCase().includes(lowerQuery) : false;
      const responseMatches =
        lowerQuery && element.responseRaw ? element.responseRaw.toLowerCase().includes(lowerQuery) : false;
      const item = new vscode.TreeItem(
        labelHighlights.length > 0 ? { label, highlights: labelHighlights } : label,
        vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = "claudeSessionPrompt";
      item.tooltip = [
        `Session: ${element.sessionTitle}`,
        `Prompt #${String(element.promptIndex + 1)}`,
        element.timestampIso ? `Timestamp: ${element.timestampIso}` : "Timestamp: unavailable",
        "",
        element.promptRaw
      ].join("\n");
      item.command = {
        command: "claudeSessions.openPromptPreview",
        title: "Open Prompt Preview",
        arguments: [element]
      };
      if (labelHighlights.length > 0 || rawMatches || responseMatches) {
        item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("list.highlightForeground"));
      }
      if (labelHighlights.length === 0 && rawMatches) {
        item.description = "match in prompt";
      } else if (labelHighlights.length === 0 && responseMatches) {
        item.description = "match in response";
      }
      return item;
    }

    const infoItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    infoItem.contextValue = "claudeInfo";
    infoItem.iconPath = new vscode.ThemeIcon("info");
    infoItem.description = element.description;
    return infoItem;
  }

  public async getChildren(element?: ClaudeTreeNode): Promise<ClaudeTreeNode[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

    if (!element) {
      if (workspaceFolders.length === 0) {
        return [this.createInfoNode("Open a folder to view Claude sessions.")];
      }

      return workspaceFolders.map<WorkspaceNode>((folder) => ({
        kind: "workspace",
        folder
      }));
    }

    if (element.kind === "session") {
      return this.createSessionPromptNodes(element);
    }

    if (element.kind === "sessionPrompt") {
      return [];
    }

    if (element.kind !== "workspace") {
      return [];
    }

    const sessions = this.sessionsByWorkspace.get(element.folder.uri.toString()) ?? [];

    if (this.filteredSessionIds !== undefined) {
      const filtered = sessions.filter((s) => this.filteredSessionIds!.has(s.sessionId));
      if (filtered.length === 0) {
        return [this.createInfoNode("No matches in this folder.", element.folder.uri.toString())];
      }
      return filtered;
    }

    if (sessions.length > 0) {
      return sessions;
    }

    if (!this.hasLoaded) {
      return [this.createInfoNode("Loading sessions...", element.folder.uri.toString())];
    }

    if (this.globalInfoMessage) {
      return [this.createInfoNode(this.globalInfoMessage, element.folder.uri.toString())];
    }

    return [this.createInfoNode("No Claude sessions found for this folder.", element.folder.uri.toString())];
  }

  private createInfoNode(label: string, workspaceFolderUri?: string): InfoNode {
    return {
      kind: "info",
      label,
      workspaceFolderUri
    };
  }

  private async createSessionPromptNodes(session: SessionNode): Promise<ClaudeTreeNode[]> {
    const prompts = await this.discoveryService.getUserPrompts(session);
    if (prompts.length === 0) {
      return [
        {
          kind: "info",
          label: "No user prompts found for this session."
        }
      ];
    }

    return prompts.map<SessionPromptNode>((prompt, index) => ({
      kind: "sessionPrompt",
      sessionId: session.sessionId,
      sessionTitle: session.title,
      promptId: prompt.promptId,
      promptIndex: index,
      promptTitle: prompt.promptTitle,
      promptRaw: prompt.promptRaw,
      responseRaw: prompt.responseRaw,
      timestampIso: prompt.timestampIso,
      timestampMs: prompt.timestampMs
    }));
  }
}

export function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffMs = timestampMs - now;
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "just now";
  }
  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (absMs < week) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  if (absMs < month) {
    return rtf.format(Math.round(diffMs / week), "week");
  }
  if (absMs < year) {
    return rtf.format(Math.round(diffMs / month), "month");
  }
  return rtf.format(Math.round(diffMs / year), "year");
}

export function formatAgeToken(timestampMs: number): string {
  const now = Date.now();
  const diffMs = timestampMs - now;
  const absMs = Math.abs(diffMs);
  const isPast = diffMs <= 0;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "now";
  }

  let value: number;
  let unit: string;
  if (absMs < hour) {
    value = Math.round(absMs / minute);
    unit = "m";
  } else if (absMs < day) {
    value = Math.round(absMs / hour);
    unit = "h";
  } else if (absMs < week) {
    value = Math.round(absMs / day);
    unit = "d";
  } else if (absMs < month) {
    value = Math.round(absMs / week);
    unit = "w";
  } else if (absMs < year) {
    value = Math.round(absMs / month);
    unit = "mo";
  } else {
    value = Math.round(absMs / year);
    unit = "y";
  }

  return isPast ? `${value}${unit} ago` : `in ${value}${unit}`;
}

export function truncateForTreeLabel(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function findHighlightRanges(label: string, query: string): [number, number][] {
  if (query.length === 0) {
    return [];
  }
  const ranges: [number, number][] = [];
  const lowerLabel = label.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let startIndex = 0;
  while (startIndex < lowerLabel.length) {
    const idx = lowerLabel.indexOf(lowerQuery, startIndex);
    if (idx === -1) {
      break;
    }
    ranges.push([idx, idx + lowerQuery.length]);
    startIndex = idx + lowerQuery.length;
  }
  return ranges;
}
