import * as assert from "assert";
import { SessionTreeStateManager } from "../../webview/SessionTreeStateManager";
import { ISessionDiscoveryService, SessionPrompt } from "../../discovery/types";
import { SessionNode } from "../../models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionNode(overrides: Partial<SessionNode> = {}): SessionNode {
  return {
    kind: "session",
    sessionId: "sess-001",
    cwd: "/workspace/project",
    transcriptPath: "/home/user/.claude/projects/-workspace-project/sess-001.jsonl",
    title: "Test Session",
    updatedAt: Date.now(),
    ...overrides
  };
}

function makePrompt(overrides: Partial<SessionPrompt> = {}): SessionPrompt {
  return {
    promptId: "prompt-001",
    sessionId: "sess-001",
    promptRaw: "How do I implement a binary search?",
    promptTitle: "How do I implement a binary search?",
    ...overrides
  };
}

function createMockDiscovery(promptsBySessionId: Map<string, SessionPrompt[]> = new Map()): ISessionDiscoveryService {
  return {
    discover: async () => ({ sessionsByWorkspace: new Map(), globalInfoMessage: undefined }),
    getUserPrompts: async (session: SessionNode) => promptsBySessionId.get(session.sessionId) ?? [],
    getSearchableEntries: async () => [],
    invalidateSessionCache: () => {}
  };
}

// ---------------------------------------------------------------------------
// Helper: populate the promptsCache for a session by calling
// buildWebviewState, which in turn calls getPromptsForSession (private) and
// fills promptsCache. We use a workspace with the session pre-loaded.
// ---------------------------------------------------------------------------

async function populatePromptsCache(
  manager: SessionTreeStateManager,
  session: SessionNode,
  _prompts: SessionPrompt[]
): Promise<void> {
  // Inject the session into sessionsByWorkspace by calling a refresh-like
  // operation, then force the cache to be populated via toggleSessionExpand.
  // We do this by directly triggering loadPromptsForSession through
  // toggleSessionExpand (which calls loadPromptsForSession for expanded sessions).

  // Step 1: Inject sessions into sessionsByWorkspace by patching discover
  // to return the session, then calling refresh.
  // Because refresh calls vscode.workspace.workspaceFolders (which returns []
  // in the test environment), we need a slightly different approach.
  //
  // Instead, we'll use the fact that buildWebviewState iterates
  // sessionsByWorkspace. We can reach the private field via a cast.
  //
  const mgr = manager as unknown as Record<string, unknown>;

  // Populate sessionsByWorkspace with our test session
  mgr.sessionsByWorkspace = new Map([["test-workspace", [session]]]);
  mgr.hasLoaded = true;
  mgr.expandedWorkspaces = new Set(["test-workspace"]);

  // Expand the session to trigger loadPromptsForSession
  manager.toggleSessionExpand(session.sessionId);

  // Wait a tick for the async loadPromptsForSession to complete
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
}

// ---------------------------------------------------------------------------
// SessionTreeStateManager: getPromptById tests
// ---------------------------------------------------------------------------

describe("SessionTreeStateManager.getPromptById", () => {
  it("returns the correct prompt when session and promptId are cached", async () => {
    const prompts = [
      makePrompt({ promptId: "p-001", sessionId: "sess-abc", promptRaw: "First question" }),
      makePrompt({ promptId: "p-002", sessionId: "sess-abc", promptRaw: "Second question" }),
      makePrompt({ promptId: "p-003", sessionId: "sess-abc", promptRaw: "Third question" })
    ];
    const session = makeSessionNode({ sessionId: "sess-abc" });
    const discovery = createMockDiscovery(new Map([["sess-abc", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptById("sess-abc", "p-002");

    assert.ok(result !== undefined, "should return a prompt when found");
    assert.strictEqual(result.promptId, "p-002");
    assert.strictEqual(result.promptRaw, "Second question");
  });

  it("returns undefined when session is not in the cache", () => {
    const discovery = createMockDiscovery();
    const manager = new SessionTreeStateManager(discovery);

    // No cache population — querying a session that was never loaded
    const result = manager.getPromptById("sess-not-cached", "p-001");

    assert.strictEqual(result, undefined, "should return undefined when session not cached");
  });

  it("returns undefined when session is cached but promptId is not found", async () => {
    const prompts = [
      makePrompt({ promptId: "p-001", sessionId: "sess-xyz" }),
      makePrompt({ promptId: "p-002", sessionId: "sess-xyz" })
    ];
    const session = makeSessionNode({ sessionId: "sess-xyz" });
    const discovery = createMockDiscovery(new Map([["sess-xyz", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptById("sess-xyz", "p-999");

    assert.strictEqual(result, undefined, "should return undefined when promptId is not found");
  });

  it("returns the first prompt when id p-001 is requested and multiple prompts exist", async () => {
    const prompts = [
      makePrompt({ promptId: "p-001", sessionId: "sess-multi", promptTitle: "Alpha" }),
      makePrompt({ promptId: "p-002", sessionId: "sess-multi", promptTitle: "Beta" }),
      makePrompt({ promptId: "p-003", sessionId: "sess-multi", promptTitle: "Gamma" })
    ];
    const session = makeSessionNode({ sessionId: "sess-multi" });
    const discovery = createMockDiscovery(new Map([["sess-multi", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptById("sess-multi", "p-001");

    assert.ok(result !== undefined);
    assert.strictEqual(result.promptId, "p-001");
    assert.strictEqual(result.promptTitle, "Alpha");
  });
});

// ---------------------------------------------------------------------------
// SessionTreeStateManager: getPromptIndex tests
// ---------------------------------------------------------------------------

describe("SessionTreeStateManager.getPromptIndex", () => {
  it("returns the correct 0-based index when prompt is found", async () => {
    const prompts = [
      makePrompt({ promptId: "p-001", sessionId: "sess-idx" }),
      makePrompt({ promptId: "p-002", sessionId: "sess-idx" }),
      makePrompt({ promptId: "p-003", sessionId: "sess-idx" })
    ];
    const session = makeSessionNode({ sessionId: "sess-idx" });
    const discovery = createMockDiscovery(new Map([["sess-idx", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    assert.strictEqual(manager.getPromptIndex("sess-idx", "p-001"), 0, "first prompt should be at index 0");
    assert.strictEqual(manager.getPromptIndex("sess-idx", "p-002"), 1, "second prompt should be at index 1");
    assert.strictEqual(manager.getPromptIndex("sess-idx", "p-003"), 2, "third prompt should be at index 2");
  });

  it("returns 0 when session is not in the cache", () => {
    const discovery = createMockDiscovery();
    const manager = new SessionTreeStateManager(discovery);

    const result = manager.getPromptIndex("sess-not-cached", "p-001");

    assert.strictEqual(result, 0, "should return 0 when session not cached");
  });

  it("returns 0 when session is cached but promptId is not found", async () => {
    const prompts = [
      makePrompt({ promptId: "p-001", sessionId: "sess-missing-id" }),
      makePrompt({ promptId: "p-002", sessionId: "sess-missing-id" })
    ];
    const session = makeSessionNode({ sessionId: "sess-missing-id" });
    const discovery = createMockDiscovery(new Map([["sess-missing-id", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptIndex("sess-missing-id", "p-999");

    assert.strictEqual(result, 0, "should return 0 when promptId is not found");
  });

  it("returns 0 for the first prompt in a single-prompt session", async () => {
    const prompts = [makePrompt({ promptId: "only-prompt", sessionId: "sess-single" })];
    const session = makeSessionNode({ sessionId: "sess-single" });
    const discovery = createMockDiscovery(new Map([["sess-single", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptIndex("sess-single", "only-prompt");

    assert.strictEqual(result, 0, "single prompt should be at index 0");
  });

  it("returns correct index for the last prompt in a large list", async () => {
    const prompts = Array.from({ length: 10 }, (_, i) =>
      makePrompt({ promptId: `p-${String(i).padStart(3, "0")}`, sessionId: "sess-large" })
    );
    const session = makeSessionNode({ sessionId: "sess-large" });
    const discovery = createMockDiscovery(new Map([["sess-large", prompts]]));
    const manager = new SessionTreeStateManager(discovery);

    await populatePromptsCache(manager, session, prompts);

    const result = manager.getPromptIndex("sess-large", "p-009");

    assert.strictEqual(result, 9, "last prompt should be at index 9");
  });
});

// ---------------------------------------------------------------------------
// SessionTreeStateManager.selectSessions tests
// ---------------------------------------------------------------------------

describe("SessionTreeStateManager.selectSessions", () => {
  it("marks all provided session IDs as checked", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.selectSessions(["sess-a", "sess-b", "sess-c"]);
    assert.ok(manager.hasCheckedSessions(), "should have checked sessions after selectSessions");
  });

  it("does not uncheck sessions that were already checked", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.toggleCheck("sess-a");
    manager.selectSessions(["sess-b", "sess-c"]);
    // sess-a was toggled on before selectSessions — it must still be checked
    const mgr = manager as unknown as Record<string, unknown>;
    const checked = mgr.checkedSessionIds as Set<string>;
    assert.ok(checked.has("sess-a"), "sess-a should remain checked");
    assert.ok(checked.has("sess-b"), "sess-b should be checked");
    assert.ok(checked.has("sess-c"), "sess-c should be checked");
  });

  it("is idempotent — selecting the same IDs twice does not duplicate them", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.selectSessions(["sess-x", "sess-y"]);
    manager.selectSessions(["sess-x", "sess-y"]);
    const mgr = manager as unknown as Record<string, unknown>;
    const checked = mgr.checkedSessionIds as Set<string>;
    assert.strictEqual(checked.size, 2, "Set should contain exactly 2 unique IDs");
  });

  it("does nothing when called with an empty array", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.selectSessions([]);
    assert.strictEqual(manager.hasCheckedSessions(), false, "should have no checked sessions");
  });

  it("fires an onDidChangeState event after selecting", (done) => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    const disposable = manager.onDidChangeState(() => {
      disposable.dispose();
      done();
    });
    manager.selectSessions(["sess-event"]);
  });
});

// ---------------------------------------------------------------------------
// SessionTreeStateManager.clearChecked / hasCheckedSessions tests
// ---------------------------------------------------------------------------

describe("SessionTreeStateManager.clearChecked", () => {
  it("removes all checked sessions", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.selectSessions(["sess-1", "sess-2", "sess-3"]);
    assert.ok(manager.hasCheckedSessions(), "precondition: should have checked sessions");
    manager.clearChecked();
    assert.strictEqual(manager.hasCheckedSessions(), false, "should have no checked sessions after clearChecked");
  });

  it("hasCheckedSessions returns false on a fresh manager", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    assert.strictEqual(manager.hasCheckedSessions(), false);
  });

  it("hasCheckedSessions returns true after toggleCheck adds a session", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.toggleCheck("sess-x");
    assert.strictEqual(manager.hasCheckedSessions(), true);
  });

  it("hasCheckedSessions returns false after toggling the same session twice", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.toggleCheck("sess-x");
    manager.toggleCheck("sess-x");
    assert.strictEqual(manager.hasCheckedSessions(), false);
  });

  it("clearChecked is safe to call when nothing is checked", () => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    assert.doesNotThrow(() => manager.clearChecked());
    assert.strictEqual(manager.hasCheckedSessions(), false);
  });

  it("fires an onDidChangeState event after clearing", (done) => {
    const manager = new SessionTreeStateManager(createMockDiscovery());
    manager.selectSessions(["sess-a"]);
    const disposable = manager.onDidChangeState(() => {
      disposable.dispose();
      done();
    });
    manager.clearChecked();
  });
});
