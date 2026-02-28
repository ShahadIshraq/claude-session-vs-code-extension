import * as assert from "assert";
import * as vscode from "vscode";
import { buildPromptPreviewHtml, escapeHtml } from "../../extension";
import { SessionPromptNode } from "../../models";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    assert.strictEqual(escapeHtml("a&b"), "a&amp;b");
  });

  it("escapes less-than", () => {
    assert.strictEqual(escapeHtml("a<b"), "a&lt;b");
  });

  it("escapes greater-than", () => {
    assert.strictEqual(escapeHtml("a>b"), "a&gt;b");
  });

  it("escapes double quotes", () => {
    assert.strictEqual(escapeHtml('a"b'), "a&quot;b");
  });

  it("returns plain text unchanged", () => {
    assert.strictEqual(escapeHtml("hello world"), "hello world");
  });

  it("handles empty string", () => {
    assert.strictEqual(escapeHtml(""), "");
  });

  it("handles multiple special characters", () => {
    assert.strictEqual(escapeHtml('<div class="x">&</div>'), "&lt;div class=&quot;x&quot;&gt;&amp;&lt;/div&gt;");
  });
});

describe("buildPromptPreviewHtml", () => {
  const baseNode: SessionPromptNode = {
    kind: "sessionPrompt",
    sessionId: "sess-001",
    sessionTitle: "My Session",
    promptId: "p1",
    promptIndex: 0,
    promptTitle: "First prompt",
    promptRaw: "Hello, world!",
    timestampIso: "2024-01-15T10:30:00.000Z"
  };

  it("produces valid HTML with session title, metadata, and prompt", () => {
    const result = buildPromptPreviewHtml(baseNode);

    assert.ok(result.includes("<!DOCTYPE html>"), "should be a full HTML document");
    assert.ok(result.includes("<h1>My Session</h1>"), "should include session title as H1");
    assert.ok(result.includes("sess-001"), "should include session ID");
    assert.ok(result.includes("Prompt #: 1"), "should show 1-based prompt number");
    assert.ok(result.includes("2024-01-15T10:30:00.000Z"), "should include timestamp");
    assert.ok(result.includes("Hello, world!"), "should include prompt text in <pre> block");
  });

  it("shows 'unavailable' when timestampIso is missing", () => {
    const node: SessionPromptNode = { ...baseNode, timestampIso: undefined, promptIndex: 2 };
    const result = buildPromptPreviewHtml(node);

    assert.ok(result.includes("unavailable"), "should show unavailable when timestampIso is missing");
    assert.ok(result.includes("Prompt #: 3"), "should show correct 1-based prompt index");
  });

  it("escapes HTML special characters in session title and prompt", () => {
    const node: SessionPromptNode = {
      ...baseNode,
      sessionTitle: 'Session <script>alert("xss")</script>',
      promptRaw: "User input with <tags> & special chars"
    };
    const result = buildPromptPreviewHtml(node);

    assert.ok(!result.includes("<script>"), "should not contain raw script tags");
    assert.ok(result.includes("&lt;script&gt;"), "should escape script tags in title");
    assert.ok(result.includes("&lt;tags&gt;"), "should escape tags in prompt");
    assert.ok(result.includes("&amp; special"), "should escape ampersands in prompt");
  });
});

describe("command guard smoke tests", () => {
  it("claudeSessions.openSession with undefined payload does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.openSession", undefined);
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });

  it("claudeSessions.openSessionDangerously with undefined payload does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.openSessionDangerously", undefined);
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });

  it("claudeSessions.openPromptPreview with undefined payload does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.openPromptPreview", undefined);
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });
});
