import * as assert from "assert";
import * as vscode from "vscode";
import { SessionNode } from "../../models";
import { ISessionDiscoveryService, SessionPrompt } from "../../discovery/types";
import { SessionTreeStateManager } from "../../webview/SessionTreeStateManager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionNode(overrides: Partial<SessionNode> = {}): SessionNode {
  return {
    kind: "session",
    sessionId: "sess-001",
    cwd: "/workspace/project",
    transcriptPath: "/home/user/.claude/projects/-workspace-project/sess-001.jsonl",
    title: "My Test Session",
    updatedAt: Date.now(),
    ...overrides
  };
}

function createMockOutputChannel(): vscode.OutputChannel & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    name: "test",
    append: () => {},
    appendLine: (msg: string) => {
      messages.push(msg);
    },
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: () => {}
  } as unknown as vscode.OutputChannel & { messages: string[] };
}

interface MockDiscovery extends ISessionDiscoveryService {
  invalidatedPaths: string[];
}

function createMockDiscovery(prompts: SessionPrompt[] = []): MockDiscovery {
  const invalidatedPaths: string[] = [];
  return {
    invalidatedPaths,
    discover: async () => ({ sessionsByWorkspace: new Map(), globalInfoMessage: undefined }),
    getUserPrompts: async () => prompts,
    getSearchableEntries: async () => [],
    invalidateSessionCache: (path: string) => {
      invalidatedPaths.push(path);
    }
  };
}

function createMockStateManager(discovery: ISessionDiscoveryService): SessionTreeStateManager & {
  clearCheckedCalled: boolean;
  setSelectionModeArgs: boolean[];
  refreshCalled: boolean;
} {
  const manager = new SessionTreeStateManager(discovery) as SessionTreeStateManager & {
    clearCheckedCalled: boolean;
    setSelectionModeArgs: boolean[];
    refreshCalled: boolean;
  };

  manager.clearCheckedCalled = false;
  manager.setSelectionModeArgs = [];
  manager.refreshCalled = false;

  const origClearChecked = manager.clearChecked.bind(manager);
  const origSetSelectionMode = manager.setSelectionMode.bind(manager);

  manager.clearChecked = () => {
    manager.clearCheckedCalled = true;
    origClearChecked();
  };

  manager.setSelectionMode = (enabled: boolean) => {
    manager.setSelectionModeArgs.push(enabled);
    origSetSelectionMode(enabled);
  };

  manager.refresh = async () => {
    manager.refreshCalled = true;
    // Do not call the real refresh to avoid vscode.workspace.workspaceFolders access
  };

  return manager;
}

// ---------------------------------------------------------------------------
// Utilities for temporarily replacing vscode API methods
// ---------------------------------------------------------------------------

type ShowWarningStub = (
  message: string,
  options: { modal: boolean; detail: string },
  ...items: string[]
) => Thenable<string | undefined>;

type ShowInfoStub = (message: string) => Thenable<string | undefined>;
type ShowErrorStub = (message: string) => Thenable<string | undefined>;
type ExecuteCommandStub = (command: string, ...args: unknown[]) => Thenable<unknown>;
type GetConfigurationStub = (section?: string) => vscode.WorkspaceConfiguration;

// ---------------------------------------------------------------------------
// Patch helpers that save/restore original implementations
// ---------------------------------------------------------------------------

function withWarningMessage(stub: ShowWarningStub, fn: () => Promise<void>): Promise<void> {
  const original = vscode.window.showWarningMessage.bind(vscode.window);
  (vscode.window as unknown as Record<string, unknown>).showWarningMessage = stub;
  return fn().finally(() => {
    (vscode.window as unknown as Record<string, unknown>).showWarningMessage = original;
  });
}

function withInfoMessage(stub: ShowInfoStub, fn: () => Promise<void>): Promise<void> {
  const original = vscode.window.showInformationMessage.bind(vscode.window);
  (vscode.window as unknown as Record<string, unknown>).showInformationMessage = stub;
  return fn().finally(() => {
    (vscode.window as unknown as Record<string, unknown>).showInformationMessage = original;
  });
}

function withErrorMessage(stub: ShowErrorStub, fn: () => Promise<void>): Promise<void> {
  const original = vscode.window.showErrorMessage.bind(vscode.window);
  (vscode.window as unknown as Record<string, unknown>).showErrorMessage = stub;
  return fn().finally(() => {
    (vscode.window as unknown as Record<string, unknown>).showErrorMessage = original;
  });
}

function withExecuteCommand(stub: ExecuteCommandStub, fn: () => Promise<void>): Promise<void> {
  const original = vscode.commands.executeCommand.bind(vscode.commands);
  (vscode.commands as unknown as Record<string, unknown>).executeCommand = stub;
  return fn().finally(() => {
    (vscode.commands as unknown as Record<string, unknown>).executeCommand = original;
  });
}

function withGetConfiguration(stub: GetConfigurationStub, fn: () => Promise<void>): Promise<void> {
  const original = vscode.workspace.getConfiguration.bind(vscode.workspace);
  (vscode.workspace as unknown as Record<string, unknown>).getConfiguration = stub;
  return fn().finally(() => {
    (vscode.workspace as unknown as Record<string, unknown>).getConfiguration = original;
  });
}

// Patch the compiled deleteSession export so we can control results per test
// eslint-disable-next-line @typescript-eslint/no-require-imports
const deleteModule = require("../../delete") as {
  deleteSession: (
    transcriptPath: string,
    sessionId: string
  ) => Promise<{ success: boolean; deletedPaths: string[]; error?: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionActionsModule = require("../../utils/sessionActions") as {
  confirmAndDeleteSessions: typeof import("../../utils/sessionActions").confirmAndDeleteSessions;
  confirmDangerousLaunch: typeof import("../../utils/sessionActions").confirmDangerousLaunch;
};

// ---------------------------------------------------------------------------
// confirmAndDeleteSessions tests
// ---------------------------------------------------------------------------

describe("confirmAndDeleteSessions", () => {
  const { confirmAndDeleteSessions } = sessionActionsModule;

  it("returns immediately without showing dialog when sessions array is empty", async () => {
    let warningShown = false;
    const stub: ShowWarningStub = async () => {
      warningShown = true;
      return undefined;
    };

    await withWarningMessage(stub, async () => {
      const discovery = createMockDiscovery();
      const stateManager = createMockStateManager(discovery);
      const outputChannel = createMockOutputChannel();

      await confirmAndDeleteSessions([], discovery, stateManager, outputChannel);

      assert.strictEqual(warningShown, false, "should not show warning for empty sessions");
      assert.strictEqual(stateManager.clearCheckedCalled, false, "should not clear checked state");
      assert.strictEqual(stateManager.refreshCalled, false, "should not refresh");
    });
  });

  it("returns without deleting when user cancels the confirmation dialog", async () => {
    // Stub: user dismisses the dialog (returns undefined)
    const warningStub: ShowWarningStub = async () => undefined;

    const originalDeleteSession = deleteModule.deleteSession;
    let deleteCallCount = 0;
    deleteModule.deleteSession = async () => {
      deleteCallCount++;
      return { success: true, deletedPaths: [] };
    };

    try {
      await withWarningMessage(warningStub, async () => {
        const discovery = createMockDiscovery();
        const stateManager = createMockStateManager(discovery);
        const outputChannel = createMockOutputChannel();
        const session = makeSessionNode();

        await confirmAndDeleteSessions([session], discovery, stateManager, outputChannel);

        assert.strictEqual(deleteCallCount, 0, "should not delete sessions when user cancels");
        assert.strictEqual(stateManager.clearCheckedCalled, false, "should not clear state on cancel");
        assert.strictEqual(stateManager.refreshCalled, false, "should not refresh on cancel");
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });

  it("deletes all sessions and shows success message when user confirms (single session)", async () => {
    const warningStub: ShowWarningStub = async () => "Delete";

    const originalDeleteSession = deleteModule.deleteSession;
    deleteModule.deleteSession = async (transcriptPath: string) => ({
      success: true,
      deletedPaths: [transcriptPath]
    });

    const infoMessages: string[] = [];
    const infoStub: ShowInfoStub = async (msg: string) => {
      infoMessages.push(msg);
      return undefined;
    };

    try {
      await withWarningMessage(warningStub, async () => {
        await withInfoMessage(infoStub, async () => {
          await withExecuteCommand(
            async () => undefined,
            async () => {
              const discovery = createMockDiscovery();
              const stateManager = createMockStateManager(discovery);
              const outputChannel = createMockOutputChannel();
              const session = makeSessionNode({ sessionId: "sess-001" });

              await confirmAndDeleteSessions([session], discovery, stateManager, outputChannel);

              assert.ok(
                infoMessages.some((m) => m === "Session deleted."),
                `expected 'Session deleted.' but got: ${JSON.stringify(infoMessages)}`
              );
              assert.strictEqual(stateManager.clearCheckedCalled, true, "should clear checked state after deletion");
              assert.strictEqual(stateManager.refreshCalled, true, "should refresh after deletion");
              assert.ok(discovery.invalidatedPaths.includes(session.transcriptPath), "should invalidate session cache");
            }
          );
        });
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });

  it("deletes all sessions and shows success message for multiple sessions", async () => {
    const warningStub: ShowWarningStub = async () => "Delete";

    const originalDeleteSession = deleteModule.deleteSession;
    deleteModule.deleteSession = async (transcriptPath: string) => ({
      success: true,
      deletedPaths: [transcriptPath]
    });

    const infoMessages: string[] = [];
    const infoStub: ShowInfoStub = async (msg: string) => {
      infoMessages.push(msg);
      return undefined;
    };

    try {
      await withWarningMessage(warningStub, async () => {
        await withInfoMessage(infoStub, async () => {
          await withExecuteCommand(
            async () => undefined,
            async () => {
              const discovery = createMockDiscovery();
              const stateManager = createMockStateManager(discovery);
              const outputChannel = createMockOutputChannel();
              const sessions = [
                makeSessionNode({ sessionId: "sess-001", transcriptPath: "/path/to/sess-001.jsonl" }),
                makeSessionNode({ sessionId: "sess-002", transcriptPath: "/path/to/sess-002.jsonl" }),
                makeSessionNode({ sessionId: "sess-003", transcriptPath: "/path/to/sess-003.jsonl" })
              ];

              await confirmAndDeleteSessions(sessions, discovery, stateManager, outputChannel);

              assert.ok(
                infoMessages.some((m) => m === "3 sessions deleted."),
                `expected '3 sessions deleted.' but got: ${JSON.stringify(infoMessages)}`
              );
            }
          );
        });
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });

  it("shows warning message when some deletions fail", async () => {
    const originalDeleteSession = deleteModule.deleteSession;
    let callCount = 0;
    deleteModule.deleteSession = async (transcriptPath: string) => {
      callCount++;
      // First succeeds, second fails
      if (callCount === 1) {
        return { success: true, deletedPaths: [transcriptPath] };
      }
      return { success: false, deletedPaths: [], error: "Permission denied" };
    };

    const warningMessages: string[] = [];

    try {
      // Use a two-phase approach: first call is for confirmation, subsequent calls for warnings
      let confirmationShown = false;
      const combinedWarningStub: ShowWarningStub = async (msg, _opts, ...items) => {
        if (!confirmationShown && items.length > 0 && items[0] === "Delete") {
          confirmationShown = true;
          return "Delete";
        }
        warningMessages.push(msg);
        return undefined;
      };

      await withWarningMessage(combinedWarningStub, async () => {
        await withExecuteCommand(
          async () => undefined,
          async () => {
            const discovery = createMockDiscovery();
            const stateManager = createMockStateManager(discovery);
            const outputChannel = createMockOutputChannel();
            const sessions = [
              makeSessionNode({ sessionId: "sess-001", transcriptPath: "/path/to/sess-001.jsonl" }),
              makeSessionNode({ sessionId: "sess-002", transcriptPath: "/path/to/sess-002.jsonl" })
            ];

            await confirmAndDeleteSessions(sessions, discovery, stateManager, outputChannel);

            assert.ok(
              warningMessages.some((m) => m.includes("1 of 2")),
              `expected partial-failure warning but got: ${JSON.stringify(warningMessages)}`
            );
          }
        );
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });

  it("shows error message when all deletions fail", async () => {
    const originalDeleteSession = deleteModule.deleteSession;
    deleteModule.deleteSession = async () => ({
      success: false,
      deletedPaths: [],
      error: "Permission denied"
    });

    const errorMessages: string[] = [];
    const errorStub: ShowErrorStub = async (msg: string) => {
      errorMessages.push(msg);
      return undefined;
    };

    try {
      let confirmationShown = false;
      const combinedWarningStub: ShowWarningStub = async (_msg, _opts, ...items) => {
        if (!confirmationShown && items.length > 0 && items[0] === "Delete") {
          confirmationShown = true;
          return "Delete";
        }
        return undefined;
      };

      await withWarningMessage(combinedWarningStub, async () => {
        await withErrorMessage(errorStub, async () => {
          await withExecuteCommand(
            async () => undefined,
            async () => {
              const discovery = createMockDiscovery();
              const stateManager = createMockStateManager(discovery);
              const outputChannel = createMockOutputChannel();
              const session = makeSessionNode();

              await confirmAndDeleteSessions([session], discovery, stateManager, outputChannel);

              assert.ok(
                errorMessages.some((m) => m.includes("Failed to delete")),
                `expected failure error message but got: ${JSON.stringify(errorMessages)}`
              );
            }
          );
        });
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });

  it("shows single-session confirmation dialog with session title", async () => {
    let capturedMessage = "";
    const warningStub: ShowWarningStub = async (msg) => {
      capturedMessage = msg;
      return undefined; // user cancels
    };

    await withWarningMessage(warningStub, async () => {
      const discovery = createMockDiscovery();
      const stateManager = createMockStateManager(discovery);
      const outputChannel = createMockOutputChannel();
      const session = makeSessionNode({ title: "My Unique Session Title" });

      await confirmAndDeleteSessions([session], discovery, stateManager, outputChannel);

      assert.ok(
        capturedMessage.includes("My Unique Session Title"),
        `expected session title in confirmation but got: "${capturedMessage}"`
      );
    });
  });

  it("shows multi-session confirmation dialog with session count", async () => {
    let capturedMessage = "";
    const warningStub: ShowWarningStub = async (msg) => {
      capturedMessage = msg;
      return undefined; // user cancels
    };

    await withWarningMessage(warningStub, async () => {
      const discovery = createMockDiscovery();
      const stateManager = createMockStateManager(discovery);
      const outputChannel = createMockOutputChannel();
      const sessions = [
        makeSessionNode({ sessionId: "sess-001" }),
        makeSessionNode({ sessionId: "sess-002" }),
        makeSessionNode({ sessionId: "sess-003" })
      ];

      await confirmAndDeleteSessions(sessions, discovery, stateManager, outputChannel);

      assert.ok(capturedMessage.includes("3"), `expected session count in confirmation but got: "${capturedMessage}"`);
    });
  });

  it("logs deletion results to output channel", async () => {
    const originalDeleteSession = deleteModule.deleteSession;
    deleteModule.deleteSession = async (transcriptPath: string) => ({
      success: true,
      deletedPaths: [transcriptPath]
    });

    try {
      let confirmationShown = false;
      const combinedWarningStub: ShowWarningStub = async (_msg, _opts, ...items) => {
        if (!confirmationShown && items.length > 0 && items[0] === "Delete") {
          confirmationShown = true;
          return "Delete";
        }
        return undefined;
      };

      await withWarningMessage(combinedWarningStub, async () => {
        await withInfoMessage(
          async () => undefined,
          async () => {
            await withExecuteCommand(
              async () => undefined,
              async () => {
                const discovery = createMockDiscovery();
                const stateManager = createMockStateManager(discovery);
                const outputChannel = createMockOutputChannel();
                const session = makeSessionNode({ sessionId: "sess-abc" });

                await confirmAndDeleteSessions([session], discovery, stateManager, outputChannel);

                assert.ok(
                  outputChannel.messages.some((m) => m.includes("sess-abc")),
                  "should log session deletion to output channel"
                );
              }
            );
          }
        );
      });
    } finally {
      deleteModule.deleteSession = originalDeleteSession;
    }
  });
});

// ---------------------------------------------------------------------------
// confirmDangerousLaunch tests
// ---------------------------------------------------------------------------

describe("confirmDangerousLaunch", () => {
  const { confirmDangerousLaunch } = sessionActionsModule;

  it("returns true without showing dialog when confirmDangerousSkipPermissions config is false", async () => {
    let warningShown = false;
    const warningStub: ShowWarningStub = async () => {
      warningShown = true;
      return undefined;
    };

    const configStub: GetConfigurationStub = (_section?: string) =>
      ({
        get: <T>(_key: string, _defaultVal: T): T => false as unknown as T,
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
      }) as unknown as vscode.WorkspaceConfiguration;

    await withWarningMessage(warningStub, async () => {
      await withGetConfiguration(configStub, async () => {
        const result = await confirmDangerousLaunch("My Session");

        assert.strictEqual(result, true, "should return true when config is disabled");
        assert.strictEqual(warningShown, false, "should not show dialog when config is disabled");
      });
    });
  });

  it("returns true when config is enabled and user confirms", async () => {
    const warningStub: ShowWarningStub = async (_msg, _opts, ...items) => items[0]; // returns first button label

    const configStub: GetConfigurationStub = (_section?: string) =>
      ({
        get: <T>(_key: string, _defaultVal: T): T => true as unknown as T,
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
      }) as unknown as vscode.WorkspaceConfiguration;

    await withWarningMessage(warningStub, async () => {
      await withGetConfiguration(configStub, async () => {
        const result = await confirmDangerousLaunch("My Session");

        assert.strictEqual(result, true, "should return true when user confirms");
      });
    });
  });

  it("returns false when config is enabled and user cancels", async () => {
    const warningStub: ShowWarningStub = async () => undefined; // user dismisses

    const configStub: GetConfigurationStub = (_section?: string) =>
      ({
        get: <T>(_key: string, _defaultVal: T): T => true as unknown as T,
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
      }) as unknown as vscode.WorkspaceConfiguration;

    await withWarningMessage(warningStub, async () => {
      await withGetConfiguration(configStub, async () => {
        const result = await confirmDangerousLaunch("My Session");

        assert.strictEqual(result, false, "should return false when user cancels");
      });
    });
  });

  it("passes session title in the warning dialog detail", async () => {
    let capturedDetail = "";
    const warningStub: ShowWarningStub = async (_msg, opts) => {
      capturedDetail = opts.detail ?? "";
      return undefined;
    };

    const configStub: GetConfigurationStub = (_section?: string) =>
      ({
        get: <T>(_key: string, _defaultVal: T): T => true as unknown as T,
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
      }) as unknown as vscode.WorkspaceConfiguration;

    await withWarningMessage(warningStub, async () => {
      await withGetConfiguration(configStub, async () => {
        await confirmDangerousLaunch("Specific Session Name");

        assert.ok(
          capturedDetail.includes("Specific Session Name"),
          `expected session title in detail but got: "${capturedDetail}"`
        );
      });
    });
  });
});
