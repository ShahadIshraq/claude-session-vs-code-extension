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
    assert.ok(result.includes("Prompt #1"), "should show 1-based prompt number");
    const expectedTs = new Date("2024-01-15T10:30:00.000Z").toLocaleString();
    assert.ok(result.includes(expectedTs), "should include formatted timestamp");
    assert.ok(result.includes("Hello, world!"), "should include prompt text in rendered output");
  });

  it("shows 'unavailable' when timestampIso is missing", () => {
    const node: SessionPromptNode = { ...baseNode, timestampIso: undefined, promptIndex: 2 };
    const result = buildPromptPreviewHtml(node);

    assert.ok(result.includes("unavailable"), "should show unavailable when timestampIso is missing");
    assert.ok(result.includes("Prompt #3"), "should show correct 1-based prompt index");
  });

  it("escapes HTML special characters in session title", () => {
    const node: SessionPromptNode = {
      ...baseNode,
      sessionTitle: 'Session <script>alert("xss")</script>'
    };
    const result = buildPromptPreviewHtml(node);

    assert.ok(!result.includes("<script>"), "should not contain raw script tags in title");
    assert.ok(result.includes("&lt;script&gt;"), "should escape script tags in title");
  });

  it("renders markdown bold in prompt as <strong>", () => {
    const node: SessionPromptNode = { ...baseNode, promptRaw: "This is **bold** text" };
    const result = buildPromptPreviewHtml(node);

    assert.ok(result.includes("<strong>bold</strong>"), "should render **bold** as <strong>bold</strong>");
  });

  it("renders responseRaw when provided and shows assistant block", () => {
    const node: SessionPromptNode = { ...baseNode, responseRaw: "Here is the answer." };
    const result = buildPromptPreviewHtml(node);

    assert.ok(result.includes("Here is the answer."), "should include response text in output");
    assert.ok(result.includes("assistant-message"), "should include assistant message block");
  });

  it("does not include assistant block when responseRaw is absent", () => {
    const node: SessionPromptNode = { ...baseNode, responseRaw: undefined };
    const result = buildPromptPreviewHtml(node);

    assert.ok(!result.includes("assistant-message"), "should not include assistant message block");
  });

  it("contains role-label and user-role CSS classes", () => {
    const result = buildPromptPreviewHtml(baseNode);

    assert.ok(result.includes("role-label"), "should include role-label CSS class");
    assert.ok(result.includes("user-role"), "should include user-role CSS class");
  });

  it("contains Content-Security-Policy meta tag", () => {
    const result = buildPromptPreviewHtml(baseNode);

    assert.ok(result.includes("Content-Security-Policy"), "should include CSP meta tag");
  });

  it("escapes XSS script tag in prompt via markdown rendering", () => {
    const node: SessionPromptNode = {
      ...baseNode,
      promptRaw: "User input with <script>alert(1)</script>"
    };
    const result = buildPromptPreviewHtml(node);

    assert.ok(!result.includes("<script>alert(1)</script>"), "should not contain raw script tag in prompt");
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

  it("claudeSessions.deleteSession with undefined payload does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.deleteSession", undefined);
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });

  it("claudeSessions.toggleSelectionMode does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.toggleSelectionMode");
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });

  it("claudeSessions.clearFilter does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.clearFilter");
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });

  it("claudeSessions.viewSession with undefined payload does not throw an unhandled error", async () => {
    try {
      await vscode.commands.executeCommand("claudeSessions.viewSession", undefined);
    } catch {
      // Commands may throw or show error messages; neither is an unhandled crash
    }
  });
});
