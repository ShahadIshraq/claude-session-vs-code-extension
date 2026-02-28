import * as assert from "assert";
import * as vscode from "vscode";
import {
  ClaudeSessionsTreeDataProvider,
  formatAgeToken,
  formatRelativeTime,
  truncateForTreeLabel
} from "../../treeProvider";
import { InfoNode, SessionNode, SessionPromptNode, WorkspaceNode } from "../../models";
import { DiscoveryResult, ISessionDiscoveryService, SessionPrompt } from "../../discovery/types";

// ---------------------------------------------------------------------------
// Minimal mock for ISessionDiscoveryService
// ---------------------------------------------------------------------------

function makeMockDiscoveryService(overrides: Partial<ISessionDiscoveryService> = {}): ISessionDiscoveryService {
  return {
    discover: (): Promise<DiscoveryResult> => Promise.resolve({ sessionsByWorkspace: new Map() }),
    getUserPrompts: (): Promise<SessionPrompt[]> => Promise.resolve([]),
    getSearchableEntries: (): Promise<import("../../discovery/types").SearchableEntry[]> => Promise.resolve([]),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Node factory helpers
// ---------------------------------------------------------------------------

function makeWorkspaceNode(overrides: Partial<vscode.WorkspaceFolder> = {}): WorkspaceNode {
  const folder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file("/home/user/project"),
    name: "project",
    index: 0,
    ...overrides
  };
  return { kind: "workspace", folder };
}

function makeSessionNode(overrides: Partial<Omit<SessionNode, "kind">> = {}): SessionNode {
  return {
    kind: "session",
    sessionId: "sess-abc-123",
    title: "Fix the login bug",
    cwd: "/home/user/project",
    transcriptPath: "/home/user/.claude/projects/-home-user-project/sess-abc-123.jsonl",
    updatedAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    ...overrides
  };
}

function makeSessionPromptNode(overrides: Partial<Omit<SessionPromptNode, "kind">> = {}): SessionPromptNode {
  return {
    kind: "sessionPrompt",
    sessionId: "sess-abc-123",
    sessionTitle: "Fix the login bug",
    promptId: "uuid-prompt-1",
    promptIndex: 0,
    promptTitle: "Describe the bug and how to reproduce it",
    promptRaw: "Describe the bug and how to reproduce it in full detail.",
    timestampIso: "2024-06-01T10:00:00Z",
    timestampMs: Date.parse("2024-06-01T10:00:00Z"),
    ...overrides
  };
}

function makeInfoNode(overrides: Partial<Omit<InfoNode, "kind">> = {}): InfoNode {
  return {
    kind: "info",
    label: "No Claude sessions found.",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// getTreeItem tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionsTreeDataProvider.getTreeItem", () => {
  let provider: ClaudeSessionsTreeDataProvider;

  before(() => {
    provider = new ClaudeSessionsTreeDataProvider(makeMockDiscoveryService());
  });

  it("WorkspaceNode: label is folder name, Expanded, claudeWorkspace context, folder icon", () => {
    const node = makeWorkspaceNode({ name: "my-repo" });
    const item = provider.getTreeItem(node);

    assert.strictEqual(item.label, "my-repo");
    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.strictEqual(item.contextValue, "claudeWorkspace");
    assert.ok(item.iconPath instanceof vscode.ThemeIcon, "iconPath should be a ThemeIcon");
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
  });

  it("SessionNode: label is truncated at 35 chars, description is age token, Collapsed, claudeSession context, click command", () => {
    const longTitle = "A very long session title that exceeds the limit";
    const node = makeSessionNode({ title: longTitle });
    const item = provider.getTreeItem(node);

    assert.ok(typeof item.label === "string", "label should be a string");
    const label = item.label as string;
    // Label is truncated to 35 chars, no middle-dot
    const truncated = truncateForTreeLabel(longTitle, 35);
    assert.strictEqual(label, truncated);
    assert.ok(!label.includes("\u00b7"), "label should not contain the middle-dot separator");
    // Age token is in description
    assert.ok(typeof item.description === "string", "description should be a string");
    assert.strictEqual(item.description, formatAgeToken(node.updatedAt));

    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(item.contextValue, "claudeSession");

    assert.ok(item.command !== undefined, "item should have a command");
    assert.strictEqual(item.command!.command, "claudeSessions.openSession");
    assert.deepStrictEqual(item.command!.arguments, [node]);
  });

  it("SessionNode: tooltip contains sessionId, title, last used time, cwd, and transcriptPath", () => {
    const node = makeSessionNode({
      sessionId: "test-session-id",
      title: "Debug memory leak",
      cwd: "/workspace/myapp",
      transcriptPath: "/home/user/.claude/projects/sess.jsonl"
    });
    const item = provider.getTreeItem(node);

    assert.ok(typeof item.tooltip === "string", "tooltip should be a string");
    const tooltip = item.tooltip as string;

    assert.ok(tooltip.includes("test-session-id"), "tooltip should include sessionId");
    assert.ok(tooltip.includes("Debug memory leak"), "tooltip should include title");
    assert.ok(tooltip.includes("/workspace/myapp"), "tooltip should include cwd");
    assert.ok(tooltip.includes("/home/user/.claude/projects/sess.jsonl"), "tooltip should include transcriptPath");
    assert.ok(tooltip.includes("Last used:"), "tooltip should include last used label");
  });

  it("SessionPromptNode: label is truncated prompt title, None state, claudeSessionPrompt context, click command", () => {
    const longPrompt = "A".repeat(80);
    const node = makeSessionPromptNode({ promptTitle: longPrompt });
    const item = provider.getTreeItem(node);

    assert.ok(typeof item.label === "string", "label should be a string");
    const label = item.label as string;
    const truncated = truncateForTreeLabel(longPrompt, 64);
    assert.strictEqual(label, truncated);

    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.strictEqual(item.contextValue, "claudeSessionPrompt");

    assert.ok(item.command !== undefined, "item should have a command");
    assert.strictEqual(item.command!.command, "claudeSessions.openPromptPreview");
    assert.deepStrictEqual(item.command!.arguments, [node]);
  });

  it("SessionPromptNode: tooltip contains session title, prompt number, timestamp, and raw prompt", () => {
    const node = makeSessionPromptNode({
      sessionTitle: "Refactor database module",
      promptIndex: 2,
      timestampIso: "2024-06-01T12:30:00Z",
      promptRaw: "Please refactor the database module for better performance."
    });
    const item = provider.getTreeItem(node);

    assert.ok(typeof item.tooltip === "string", "tooltip should be a string");
    const tooltip = item.tooltip as string;

    assert.ok(tooltip.includes("Refactor database module"), "tooltip should include session title");
    assert.ok(tooltip.includes("Prompt #3"), "tooltip should include 1-based prompt number");
    assert.ok(tooltip.includes("2024-06-01T12:30:00Z"), "tooltip should include timestamp ISO string");
    assert.ok(
      tooltip.includes("Please refactor the database module for better performance."),
      "tooltip should include raw prompt text"
    );
  });

  it("SessionPromptNode: tooltip shows 'Timestamp: unavailable' when timestampIso is absent", () => {
    const node = makeSessionPromptNode({ timestampIso: undefined });
    const item = provider.getTreeItem(node);

    assert.ok(typeof item.tooltip === "string");
    assert.ok((item.tooltip as string).includes("Timestamp: unavailable"));
  });

  it("InfoNode: label, None state, claudeInfo context, info icon", () => {
    const node = makeInfoNode({ label: "Open a folder to view Claude sessions." });
    const item = provider.getTreeItem(node);

    assert.strictEqual(item.label, "Open a folder to view Claude sessions.");
    assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.strictEqual(item.contextValue, "claudeInfo");
    assert.ok(item.iconPath instanceof vscode.ThemeIcon, "iconPath should be a ThemeIcon");
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "info");
  });

  it("InfoNode: includes description when provided", () => {
    const node = makeInfoNode({ label: "Status", description: "Indexing..." });
    const item = provider.getTreeItem(node);

    assert.strictEqual(item.description, "Indexing...");
  });
});

// ---------------------------------------------------------------------------
// getChildren tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionsTreeDataProvider.getChildren", () => {
  it("getChildren(sessionPromptNode) returns an empty array", async () => {
    const provider = new ClaudeSessionsTreeDataProvider(makeMockDiscoveryService());
    const node = makeSessionPromptNode();
    const children = await provider.getChildren(node);

    assert.deepStrictEqual(children, []);
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime tests
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  it("returns 'just now' for a timestamp less than 1 minute ago", () => {
    const ts = Date.now() - 30_000; // 30 seconds ago
    assert.strictEqual(formatRelativeTime(ts), "just now");
  });
});

// ---------------------------------------------------------------------------
// formatAgeToken tests
// ---------------------------------------------------------------------------

describe("formatAgeToken", () => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  it("returns 'now' for a timestamp less than 1 minute ago", () => {
    const ts = Date.now() - 30_000;
    assert.strictEqual(formatAgeToken(ts), "now");
  });

  it("returns 'Xm ago' for a timestamp several minutes old", () => {
    const ts = Date.now() - 5 * minute;
    assert.strictEqual(formatAgeToken(ts), "5m ago");
  });

  it("returns 'Xh ago' for a timestamp several hours old", () => {
    const ts = Date.now() - 3 * hour;
    assert.strictEqual(formatAgeToken(ts), "3h ago");
  });

  it("returns 'Xd ago' for a timestamp several days old", () => {
    const ts = Date.now() - 4 * day;
    assert.strictEqual(formatAgeToken(ts), "4d ago");
  });

  it("returns 'Xw ago' for a timestamp several weeks old", () => {
    const ts = Date.now() - 2 * week;
    assert.strictEqual(formatAgeToken(ts), "2w ago");
  });

  it("returns 'Xmo ago' for a timestamp several months old", () => {
    const ts = Date.now() - 3 * month;
    assert.strictEqual(formatAgeToken(ts), "3mo ago");
  });

  it("returns 'Xy ago' for a timestamp about one year old", () => {
    const ts = Date.now() - year;
    assert.strictEqual(formatAgeToken(ts), "1y ago");
  });
});

// ---------------------------------------------------------------------------
// truncateForTreeLabel tests
// ---------------------------------------------------------------------------

describe("truncateForTreeLabel", () => {
  it("preserves short strings unchanged", () => {
    assert.strictEqual(truncateForTreeLabel("short text", 20), "short text");
  });

  it("truncates with '...' for strings over maxLength", () => {
    const result = truncateForTreeLabel("This is a long string that should be truncated", 20);
    assert.strictEqual(result.length, 20);
    assert.ok(result.endsWith("..."));
  });

  it("collapses internal whitespace into single spaces", () => {
    const result = truncateForTreeLabel("hello   world\t\nnext", 50);
    assert.strictEqual(result, "hello world next");
  });

  it("handles an empty string without throwing", () => {
    assert.strictEqual(truncateForTreeLabel("", 10), "");
  });

  it("does not truncate a string that is exactly at maxLength", () => {
    const value = "exactly20characters!"; // 20 chars
    assert.strictEqual(value.length, 20);
    assert.strictEqual(truncateForTreeLabel(value, 20), value);
  });
});
