import * as assert from "assert";
import * as vscode from "vscode";
import { ClaudeSessionsTreeDataProvider } from "../../treeProvider";
import { InfoNode, SessionNode, WorkspaceNode } from "../../models";
import { DiscoveryResult, ISessionDiscoveryService, SearchableEntry, SessionPrompt } from "../../discovery/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWorkspaceFolder(fsPath: string, index = 0): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(fsPath),
    name: fsPath.split("/").pop() ?? "workspace",
    index
  };
}

function makeSessionNode(overrides: Partial<Omit<SessionNode, "kind">> = {}): SessionNode {
  return {
    kind: "session",
    sessionId: "sess-default-id",
    title: "Default Session",
    cwd: "/home/user/project",
    transcriptPath: "/home/user/.claude/projects/sess.jsonl",
    updatedAt: Date.now() - 60_000,
    ...overrides
  };
}

/**
 * Creates a mock discovery service that returns the provided sessions under a given workspace URI.
 */
function makeMockDiscoveryService(
  sessionsByWorkspace: Map<string, SessionNode[]> = new Map(),
  overrides: Partial<ISessionDiscoveryService> = {}
): ISessionDiscoveryService {
  return {
    discover: (): Promise<DiscoveryResult> => Promise.resolve({ sessionsByWorkspace }),
    getUserPrompts: (): Promise<SessionPrompt[]> => Promise.resolve([]),
    getSearchableEntries: (): Promise<SearchableEntry[]> => Promise.resolve([]),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Helper: manually load sessions into the tree provider by calling refresh()
// ---------------------------------------------------------------------------
async function refreshProviderWithSessions(provider: ClaudeSessionsTreeDataProvider): Promise<void> {
  // refresh() calls discover() internally and updates sessionsByWorkspace
  await provider.refresh();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionsTreeDataProvider — filter functionality", () => {
  // -------------------------------------------------------------------------
  // Test 1: setFilter applies filter — getChildren only returns matching sessions
  // -------------------------------------------------------------------------
  it("setFilter applies a filter: getChildren returns only sessions in the matching set", async () => {
    const workspaceUri = "/home/user/project-a";
    const folder = makeWorkspaceFolder(workspaceUri);
    const folderKey = folder.uri.toString();

    const sessionA = makeSessionNode({ sessionId: "sess-alpha", title: "Alpha Session", cwd: workspaceUri });
    const sessionB = makeSessionNode({ sessionId: "sess-beta", title: "Beta Session", cwd: workspaceUri });
    const sessionC = makeSessionNode({ sessionId: "sess-gamma", title: "Gamma Session", cwd: workspaceUri });

    const byWorkspace = new Map([[folderKey, [sessionA, sessionB, sessionC]]]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    // Apply a filter that only includes alpha and gamma
    const matchingIds = new Set(["sess-alpha", "sess-gamma"]);
    provider.setFilter("alpha gamma", matchingIds);

    const workspaceNode: WorkspaceNode = { kind: "workspace", folder };
    const children = await provider.getChildren(workspaceNode);

    const sessionChildren = children.filter((c): c is SessionNode => c.kind === "session");
    assert.strictEqual(sessionChildren.length, 2, "only 2 sessions should be returned when filter is active");
    assert.ok(
      sessionChildren.some((s) => s.sessionId === "sess-alpha"),
      "sess-alpha should be in the filtered results"
    );
    assert.ok(
      sessionChildren.some((s) => s.sessionId === "sess-gamma"),
      "sess-gamma should be in the filtered results"
    );
    assert.ok(
      !sessionChildren.some((s) => s.sessionId === "sess-beta"),
      "sess-beta should NOT be in the filtered results"
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: setFilter with no matches — returns an "No matches" info node
  // -------------------------------------------------------------------------
  it("setFilter with no matching IDs: getChildren returns a 'No matches' info node for the workspace", async () => {
    const workspaceUri = "/home/user/project-b";
    const folder = makeWorkspaceFolder(workspaceUri);
    const folderKey = folder.uri.toString();

    const sessionA = makeSessionNode({ sessionId: "sess-one", title: "Session One", cwd: workspaceUri });
    const sessionB = makeSessionNode({ sessionId: "sess-two", title: "Session Two", cwd: workspaceUri });

    const byWorkspace = new Map([[folderKey, [sessionA, sessionB]]]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    // Filter with an empty set — no sessions match
    provider.setFilter("nonexistent keyword", new Set<string>());

    const workspaceNode: WorkspaceNode = { kind: "workspace", folder };
    const children = await provider.getChildren(workspaceNode);

    assert.strictEqual(children.length, 1, "should return exactly one node when no sessions match");
    const infoNode = children[0] as InfoNode;
    assert.strictEqual(infoNode.kind, "info", "the returned node should be an info node");
    assert.ok(
      infoNode.label.toLowerCase().includes("no matches"),
      `info node label should indicate no matches, got: "${infoNode.label}"`
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: clearFilter restores all sessions
  // -------------------------------------------------------------------------
  it("clearing the filter (setFilter with undefined) restores all sessions in getChildren", async () => {
    const workspaceUri = "/home/user/project-c";
    const folder = makeWorkspaceFolder(workspaceUri);
    const folderKey = folder.uri.toString();

    const sessionA = makeSessionNode({ sessionId: "sess-clear-a", title: "Clear A", cwd: workspaceUri });
    const sessionB = makeSessionNode({ sessionId: "sess-clear-b", title: "Clear B", cwd: workspaceUri });
    const sessionC = makeSessionNode({ sessionId: "sess-clear-c", title: "Clear C", cwd: workspaceUri });

    const byWorkspace = new Map([[folderKey, [sessionA, sessionB, sessionC]]]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    // Apply a filter
    provider.setFilter("clear-a", new Set(["sess-clear-a"]));

    const workspaceNode: WorkspaceNode = { kind: "workspace", folder };
    const filteredChildren = await provider.getChildren(workspaceNode);
    const filteredSessions = filteredChildren.filter((c): c is SessionNode => c.kind === "session");
    assert.strictEqual(filteredSessions.length, 1, "filter should reduce to 1 session");

    // Clear the filter
    provider.setFilter(undefined, undefined);

    const allChildren = await provider.getChildren(workspaceNode);
    const allSessions = allChildren.filter((c): c is SessionNode => c.kind === "session");
    assert.strictEqual(allSessions.length, 3, "clearing filter should restore all 3 sessions");
    assert.ok(
      allSessions.some((s) => s.sessionId === "sess-clear-a"),
      "sess-clear-a should be back"
    );
    assert.ok(
      allSessions.some((s) => s.sessionId === "sess-clear-b"),
      "sess-clear-b should be back"
    );
    assert.ok(
      allSessions.some((s) => s.sessionId === "sess-clear-c"),
      "sess-clear-c should be back"
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: getFilterQuery returns current query and undefined after clear
  // -------------------------------------------------------------------------
  it("getFilterQuery returns the active query string and undefined after filter is cleared", () => {
    const discovery = makeMockDiscoveryService();
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    // Initially no filter
    assert.strictEqual(
      provider.getFilterQuery(),
      undefined,
      "getFilterQuery should return undefined when no filter is set"
    );

    // Set a filter
    provider.setFilter("jwt token authentication", new Set(["sess-xyz"]));
    assert.strictEqual(
      provider.getFilterQuery(),
      "jwt token authentication",
      "getFilterQuery should return the query string set by setFilter"
    );

    // Clear the filter
    provider.setFilter(undefined, undefined);
    assert.strictEqual(
      provider.getFilterQuery(),
      undefined,
      "getFilterQuery should return undefined after filter is cleared"
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: setFilter fires the onDidChangeTreeData event
  // -------------------------------------------------------------------------
  it("setFilter fires the onDidChangeTreeData event each time it is called", async () => {
    const discovery = makeMockDiscoveryService();
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    let eventFiredCount = 0;
    const disposable = provider.onDidChangeTreeData(() => {
      eventFiredCount++;
    });

    try {
      // Set a filter — should fire event
      provider.setFilter("query one", new Set(["sess-a"]));
      assert.strictEqual(eventFiredCount, 1, "onDidChangeTreeData should fire once after first setFilter");

      // Set another filter — should fire again
      provider.setFilter("query two", new Set(["sess-b"]));
      assert.strictEqual(eventFiredCount, 2, "onDidChangeTreeData should fire again after second setFilter");

      // Clear the filter — should fire again
      provider.setFilter(undefined, undefined);
      assert.strictEqual(eventFiredCount, 3, "onDidChangeTreeData should fire again after clearing the filter");
    } finally {
      disposable.dispose();
    }
  });

  // -------------------------------------------------------------------------
  // Test 6: Filter is scoped per workspace — unrelated workspace returns its own result
  // -------------------------------------------------------------------------
  it("filter only restricts sessions for workspaces; a workspace with matching sessions still shows them", async () => {
    const workspaceUri1 = "/home/user/project-x";
    const workspaceUri2 = "/home/user/project-y";
    const folder1 = makeWorkspaceFolder(workspaceUri1, 0);
    const folder2 = makeWorkspaceFolder(workspaceUri2, 1);
    const folderKey1 = folder1.uri.toString();
    const folderKey2 = folder2.uri.toString();

    const sessX1 = makeSessionNode({ sessionId: "sess-x1", title: "X Session 1", cwd: workspaceUri1 });
    const sessX2 = makeSessionNode({ sessionId: "sess-x2", title: "X Session 2", cwd: workspaceUri1 });
    const sessY1 = makeSessionNode({ sessionId: "sess-y1", title: "Y Session 1", cwd: workspaceUri2 });

    const byWorkspace = new Map([
      [folderKey1, [sessX1, sessX2]],
      [folderKey2, [sessY1]]
    ]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    // Filter includes only sess-x1 from workspace1 and sess-y1 from workspace2
    provider.setFilter("some keyword", new Set(["sess-x1", "sess-y1"]));

    const node1: WorkspaceNode = { kind: "workspace", folder: folder1 };
    const node2: WorkspaceNode = { kind: "workspace", folder: folder2 };

    const children1 = await provider.getChildren(node1);
    const children2 = await provider.getChildren(node2);

    const sessions1 = children1.filter((c): c is SessionNode => c.kind === "session");
    const sessions2 = children2.filter((c): c is SessionNode => c.kind === "session");

    assert.strictEqual(sessions1.length, 1, "workspace1 should only show sess-x1");
    assert.strictEqual(sessions1[0].sessionId, "sess-x1");

    assert.strictEqual(sessions2.length, 1, "workspace2 should show sess-y1");
    assert.strictEqual(sessions2[0].sessionId, "sess-y1");
  });

  // -------------------------------------------------------------------------
  // Test 7: getChildren without a workspace element returns workspace nodes unchanged by filter
  // -------------------------------------------------------------------------
  it("getChildren with no element returns workspace nodes regardless of active filter", async () => {
    const discovery = makeMockDiscoveryService();
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    // Apply a filter
    provider.setFilter("some filter", new Set(["sess-1"]));

    // getChildren(undefined) should still return workspace nodes
    // (In the test environment, vscode.workspace.workspaceFolders is typically undefined or [])
    const topLevel = await provider.getChildren(undefined);

    // Either an info node ("Open a folder...") or workspace nodes — filter should not affect this level
    assert.ok(Array.isArray(topLevel), "getChildren with no element should return an array");
    // If there are workspace nodes, they should all be kind === "workspace"
    const workspaceNodes = topLevel.filter((n): n is WorkspaceNode => n.kind === "workspace");
    const infoNodes = topLevel.filter((n): n is InfoNode => n.kind === "info");
    // Either all workspace nodes or all info nodes (the "Open a folder" message)
    assert.ok(
      workspaceNodes.length > 0 || infoNodes.length > 0,
      "top-level getChildren should return workspace or info nodes"
    );
  });

  // -------------------------------------------------------------------------
  // Test 8: setFilter with empty string query still sets filter state
  // -------------------------------------------------------------------------
  it("setFilter with empty query string and a set of IDs still applies the filter", async () => {
    const workspaceUri = "/home/user/project-d";
    const folder = makeWorkspaceFolder(workspaceUri);
    const folderKey = folder.uri.toString();

    const sessA = makeSessionNode({ sessionId: "sess-da", title: "DA", cwd: workspaceUri });
    const sessB = makeSessionNode({ sessionId: "sess-db", title: "DB", cwd: workspaceUri });

    const byWorkspace = new Map([[folderKey, [sessA, sessB]]]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    // Set filter with empty query but a non-empty matching set
    provider.setFilter("", new Set(["sess-da"]));

    // getFilterQuery returns the query — should be empty string
    assert.strictEqual(provider.getFilterQuery(), "", "getFilterQuery should return the empty string query");

    const workspaceNode: WorkspaceNode = { kind: "workspace", folder };
    const children = await provider.getChildren(workspaceNode);
    const sessions = children.filter((c): c is SessionNode => c.kind === "session");

    assert.strictEqual(sessions.length, 1, "filter with empty string query should still filter by ID set");
    assert.strictEqual(sessions[0].sessionId, "sess-da");
  });

  // -------------------------------------------------------------------------
  // Test 9: getChildren for a session kind still returns prompt nodes (filter doesn't affect prompts)
  // -------------------------------------------------------------------------
  it("getChildren for a session node calls getUserPrompts regardless of active filter", async () => {
    const promptData = [
      {
        promptId: "p-1",
        sessionId: "sess-filter-prompt",
        promptRaw: "What is the meaning of life?",
        promptTitle: "What is the meaning of life?",
        timestampIso: "2025-08-01T10:00:00Z",
        timestampMs: Date.parse("2025-08-01T10:00:00Z")
      }
    ];

    const discovery = makeMockDiscoveryService(new Map(), {
      getUserPrompts: (): Promise<SessionPrompt[]> => Promise.resolve(promptData)
    });
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    // Apply a filter
    provider.setFilter("life", new Set(["sess-filter-prompt"]));

    const sessionNode = makeSessionNode({ sessionId: "sess-filter-prompt" });
    const children = await provider.getChildren(sessionNode);

    assert.ok(children.length > 0, "getChildren for a session should return prompt nodes");
    const promptNode = children[0];
    assert.strictEqual(promptNode.kind, "sessionPrompt", "children of a session should be sessionPrompt nodes");
  });

  // -------------------------------------------------------------------------
  // Test 10: Multiple setFilter calls replace the previous filter state
  // -------------------------------------------------------------------------
  it("calling setFilter multiple times replaces the previous filter each time", async () => {
    const workspaceUri = "/home/user/project-e";
    const folder = makeWorkspaceFolder(workspaceUri);
    const folderKey = folder.uri.toString();

    const sessA = makeSessionNode({ sessionId: "sess-ea", title: "EA", cwd: workspaceUri });
    const sessB = makeSessionNode({ sessionId: "sess-eb", title: "EB", cwd: workspaceUri });
    const sessC = makeSessionNode({ sessionId: "sess-ec", title: "EC", cwd: workspaceUri });

    const byWorkspace = new Map([[folderKey, [sessA, sessB, sessC]]]);
    const discovery = makeMockDiscoveryService(byWorkspace);
    const provider = new ClaudeSessionsTreeDataProvider(discovery);

    await refreshProviderWithSessions(provider);

    const workspaceNode: WorkspaceNode = { kind: "workspace", folder };

    // First filter — only ea
    provider.setFilter("ea", new Set(["sess-ea"]));
    const children1 = await provider.getChildren(workspaceNode);
    const sessions1 = children1.filter((c): c is SessionNode => c.kind === "session");
    assert.strictEqual(sessions1.length, 1);
    assert.strictEqual(sessions1[0].sessionId, "sess-ea");

    // Second filter — only eb and ec (replaces first)
    provider.setFilter("eb ec", new Set(["sess-eb", "sess-ec"]));
    const children2 = await provider.getChildren(workspaceNode);
    const sessions2 = children2.filter((c): c is SessionNode => c.kind === "session");
    assert.strictEqual(sessions2.length, 2);
    assert.ok(sessions2.some((s) => s.sessionId === "sess-eb"));
    assert.ok(sessions2.some((s) => s.sessionId === "sess-ec"));
    assert.ok(!sessions2.some((s) => s.sessionId === "sess-ea"), "first filter should have been replaced");

    assert.strictEqual(provider.getFilterQuery(), "eb ec", "getFilterQuery should reflect the latest filter query");
  });
});
