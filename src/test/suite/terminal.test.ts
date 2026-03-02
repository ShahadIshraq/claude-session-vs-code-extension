import * as assert from "assert";
import type * as vscode from "vscode";
import {
  buildClaudeResumeCommand,
  shellQuote,
  executeInTerminal,
  SHELL_INTEGRATION_TIMEOUT_MS,
  type ExecuteInTerminalDeps
} from "../../terminal";

// ---------------------------------------------------------------------------
// Mock helpers for executeInTerminal tests
// ---------------------------------------------------------------------------

interface MockShellIntegration {
  executeCommand: (cmd: string) => void;
  cwd: undefined;
  _calls: string[];
}

function createMockShellIntegration(): MockShellIntegration {
  const calls: string[] = [];
  return {
    cwd: undefined,
    executeCommand: (cmd: string) => {
      calls.push(cmd);
    },
    _calls: calls
  };
}

interface MockTerminal {
  shellIntegration: MockShellIntegration | undefined;
  sendText: (text: string, shouldExecute?: boolean) => void;
  _sendTextCalls: Array<{ text: string; shouldExecute?: boolean }>;
}

function createMockTerminal(shellIntegration?: MockShellIntegration): MockTerminal {
  const sendTextCalls: Array<{ text: string; shouldExecute?: boolean }> = [];
  return {
    shellIntegration,
    sendText: (text: string, shouldExecute?: boolean) => {
      sendTextCalls.push({ text, shouldExecute });
    },
    _sendTextCalls: sendTextCalls
  };
}

type ShellIntegrationCallback = (event: { terminal: unknown; shellIntegration: MockShellIntegration }) => void;

interface MockSubscription {
  /** Simulate shell integration activating for a given terminal. */
  fire: (terminal: unknown, shellIntegration: MockShellIntegration) => void;
  /** The disposable returned to the caller, for verifying cleanup. */
  disposed: boolean;
}

function createMockSubscribe(): {
  subscribe: ExecuteInTerminalDeps["subscribe"];
  mock: MockSubscription;
} {
  let callback: ShellIntegrationCallback | undefined;
  let disposed = false;

  const mock: MockSubscription = {
    fire: (terminal, shellIntegration) => {
      if (callback && !disposed) {
        callback({ terminal, shellIntegration });
      }
    },
    get disposed() {
      return disposed;
    }
  };

  const subscribe = ((cb: ShellIntegrationCallback) => {
    callback = cb;
    return {
      dispose: () => {
        disposed = true;
      }
    };
  }) as unknown as ExecuteInTerminalDeps["subscribe"];

  return { subscribe, mock };
}

type StartExecutionCallback = (event: { terminal: unknown }) => void;

interface MockStartEvent {
  fire: (terminal: unknown) => void;
  disposed: boolean;
}

function createMockOnDidStartExecution(): {
  onDidStartExecution: ExecuteInTerminalDeps["onDidStartExecution"];
  mock: MockStartEvent;
} {
  let callback: StartExecutionCallback | undefined;
  let disposed = false;

  const mock: MockStartEvent = {
    fire: (terminal) => {
      if (callback && !disposed) {
        callback({ terminal });
      }
    },
    get disposed() {
      return disposed;
    }
  };

  const onDidStartExecution = ((cb: StartExecutionCallback) => {
    callback = cb;
    return {
      dispose: () => {
        disposed = true;
      }
    };
  }) as unknown as ExecuteInTerminalDeps["onDidStartExecution"];

  return { onDidStartExecution, mock };
}

function createMockLog(): { log: (msg: string) => void; messages: string[] } {
  const messages: string[] = [];
  return {
    log: (msg: string) => {
      messages.push(msg);
    },
    messages
  };
}

// ---------------------------------------------------------------------------
// executeInTerminal tests
// ---------------------------------------------------------------------------

describe("executeInTerminal", () => {
  it("uses shellIntegration.executeCommand when shell integration is already available", async () => {
    const si = createMockShellIntegration();
    const terminal = createMockTerminal(si);
    const { subscribe } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log, messages } = createMockLog();

    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "claude --resume 'abc'", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 100
    });

    // executeCommand should be called immediately
    assert.strictEqual(si._calls.length, 1);
    assert.strictEqual(si._calls[0], "claude --resume 'abc'");
    assert.strictEqual(terminal._sendTextCalls.length, 0, "should NOT call sendText");

    // But promise should NOT resolve until the command actually starts
    startMock.fire(terminal);
    await promise;

    assert.ok(messages.some((m) => m.includes("Shell integration available")));
    assert.ok(messages.some((m) => m.includes("Command execution started")));
  });

  it("does not resolve until onDidStartTerminalShellExecution fires (shell integration already present)", async () => {
    const si = createMockShellIntegration();
    const terminal = createMockTerminal(si);
    const { subscribe } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    let resolved = false;
    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "test", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 200
    }).then(() => {
      resolved = true;
    });

    // Give microtasks a chance to run
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(resolved, false, "should not resolve before start event fires");

    startMock.fire(terminal);
    await promise;
    assert.strictEqual(resolved, true);
  });

  it("resolves via safeguard timeout if onDidStartExecution never fires", async () => {
    const si = createMockShellIntegration();
    const terminal = createMockTerminal(si);
    const { subscribe } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    // Never fire startMock — should resolve via the safeguard timeout
    await executeInTerminal(terminal as unknown as vscode.Terminal, "safeguard-test", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 30
    });

    assert.strictEqual(si._calls.length, 1, "command should still be dispatched");
    assert.ok(startMock.disposed, "start listener should be disposed after safeguard timeout");
  });

  it("does not subscribe to onDidChangeTerminalShellIntegration when shell integration is already available", async () => {
    const si = createMockShellIntegration();
    const terminal = createMockTerminal(si);
    let subscribeCalled = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const subscribe = ((_cb: unknown) => {
      subscribeCalled = true;
      return { dispose: () => {} };
    }) as unknown as ExecuteInTerminalDeps["subscribe"];
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "test", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 50
    });
    startMock.fire(terminal);
    await promise;

    assert.strictEqual(subscribeCalled, false, "should not subscribe when integration is already present");
  });

  it("waits for shell integration then waits for command start before resolving", async () => {
    const terminal = createMockTerminal(undefined);
    const { subscribe, mock: siMock } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log, messages } = createMockLog();

    let resolved = false;
    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "claude --resume 'xyz'", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 500
    }).then(() => {
      resolved = true;
    });

    // Nothing should have executed yet
    assert.strictEqual(terminal._sendTextCalls.length, 0);

    // Simulate shell integration activating
    const si = createMockShellIntegration();
    siMock.fire(terminal, si);

    assert.strictEqual(si._calls.length, 1, "should call executeCommand");

    // Promise should NOT have resolved yet — waiting for command start
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(resolved, false, "should not resolve before command starts");

    // Simulate command starting
    startMock.fire(terminal);
    await promise;

    assert.strictEqual(resolved, true);
    assert.ok(messages.some((m) => m.includes("Shell integration activated")));
    assert.ok(messages.some((m) => m.includes("Command execution started")));
    assert.strictEqual(terminal._sendTextCalls.length, 0, "should NOT fall back to sendText");
  });

  it("falls back to sendText and resolves immediately when shell integration times out", async () => {
    const terminal = createMockTerminal(undefined);
    const { subscribe, mock: siMock } = createMockSubscribe();
    const { onDidStartExecution } = createMockOnDidStartExecution();
    const { log, messages } = createMockLog();

    await executeInTerminal(terminal as unknown as vscode.Terminal, "claude --resume 'timeout-test'", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 30
    });

    assert.strictEqual(terminal._sendTextCalls.length, 1, "should fall back to sendText");
    assert.strictEqual(terminal._sendTextCalls[0].text, "claude --resume 'timeout-test'");
    assert.strictEqual(terminal._sendTextCalls[0].shouldExecute, true);
    assert.ok(messages.some((m) => m.includes("falling back to sendText")));
    assert.ok(siMock.disposed, "shell integration listener should be disposed");
  });

  it("ignores shell integration events for a different terminal", async () => {
    const terminal = createMockTerminal(undefined);
    const otherTerminal = createMockTerminal(undefined);
    const { subscribe, mock: siMock } = createMockSubscribe();
    const { onDidStartExecution } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "test-cmd", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 50
    });

    // Fire event for a *different* terminal — should be ignored
    const si = createMockShellIntegration();
    siMock.fire(otherTerminal, si);

    assert.strictEqual(si._calls.length, 0, "should NOT execute for wrong terminal");

    // Let timeout fire → should fall back to sendText
    await promise;
    assert.strictEqual(terminal._sendTextCalls.length, 1, "should fall back to sendText after timeout");
  });

  it("ignores onDidStartExecution events for a different terminal", async () => {
    const si = createMockShellIntegration();
    const terminal = createMockTerminal(si);
    const otherTerminal = createMockTerminal(undefined);
    const { subscribe } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    let resolved = false;
    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "test", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 100
    }).then(() => {
      resolved = true;
    });

    // Fire start event for wrong terminal
    startMock.fire(otherTerminal);
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(resolved, false, "should not resolve for wrong terminal");

    // Fire for correct terminal
    startMock.fire(terminal);
    await promise;
    assert.strictEqual(resolved, true);
  });

  it("does not double-execute if shell integration activates after timeout already fired", async () => {
    const terminal = createMockTerminal(undefined);
    const { subscribe, mock: siMock } = createMockSubscribe();
    const { onDidStartExecution } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    await executeInTerminal(terminal as unknown as vscode.Terminal, "double-test", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 20
    });

    assert.strictEqual(terminal._sendTextCalls.length, 1, "sendText should have fired");

    // Simulate late shell integration activation
    const si = createMockShellIntegration();
    siMock.fire(terminal, si);

    assert.strictEqual(si._calls.length, 0, "should NOT call executeCommand after timeout");
    assert.strictEqual(terminal._sendTextCalls.length, 1, "sendText called exactly once");
  });

  it("does not fall back to sendText if shell integration activated before timeout", (done) => {
    const terminal = createMockTerminal(undefined);
    const { subscribe, mock: siMock } = createMockSubscribe();
    const { onDidStartExecution, mock: startMock } = createMockOnDidStartExecution();
    const { log } = createMockLog();

    const promise = executeInTerminal(terminal as unknown as vscode.Terminal, "no-fallback", {
      subscribe,
      onDidStartExecution,
      log,
      timeoutMs: 50
    });

    // Activate shell integration immediately
    const si = createMockShellIntegration();
    siMock.fire(terminal, si);
    assert.strictEqual(si._calls.length, 1);

    // Fire command start
    startMock.fire(terminal);

    promise.then(() => {
      setTimeout(() => {
        assert.strictEqual(terminal._sendTextCalls.length, 0, "sendText should NOT fire");
        assert.strictEqual(si._calls.length, 1, "executeCommand called exactly once");
        done();
      }, 80);
    });
  });

  it("exports SHELL_INTEGRATION_TIMEOUT_MS as 500", () => {
    assert.strictEqual(SHELL_INTEGRATION_TIMEOUT_MS, 500);
  });
});

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("terminal helpers", () => {
  it("builds safe resume command by default", () => {
    const command = buildClaudeResumeCommand("abc-123", false);
    assert.strictEqual(command, "claude --resume 'abc-123'");
  });

  it("builds dangerous resume command when enabled", () => {
    const command = buildClaudeResumeCommand("abc-123", true);
    assert.strictEqual(command, "claude --dangerously-skip-permissions --resume 'abc-123'");
  });

  it("session ID with spaces is properly quoted", () => {
    const command = buildClaudeResumeCommand("my session id", false);
    assert.strictEqual(command, "claude --resume 'my session id'");
  });

  it("empty session ID is still quoted", () => {
    const command = buildClaudeResumeCommand("", false);
    assert.strictEqual(command, "claude --resume ''");
  });
});

describe("shellQuote", () => {
  it("quotes single quotes in shell values", () => {
    const quoted = shellQuote("id'withquote");
    assert.strictEqual(quoted, "'id'\\''withquote'");
  });

  it("handles empty string", () => {
    assert.strictEqual(shellQuote(""), "''");
  });

  it("handles string with no special characters", () => {
    assert.strictEqual(shellQuote("hello"), "'hello'");
  });

  it("handles string with multiple single quotes", () => {
    assert.strictEqual(shellQuote("it's a 'test'"), "'it'\\''s a '\\''test'\\'''");
  });
});
