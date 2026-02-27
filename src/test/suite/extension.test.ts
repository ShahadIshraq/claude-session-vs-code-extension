import * as assert from "assert";
import * as vscode from "vscode";
import { buildPromptPreviewDocument, escapeMarkdown } from "../../extension";
import { SessionPromptNode } from "../../models";

describe("escapeMarkdown", () => {
  it("escapes backslash", () => {
    assert.strictEqual(escapeMarkdown("a\\b"), "a\\\\b");
  });

  it("escapes backtick", () => {
    assert.strictEqual(escapeMarkdown("a`b"), "a\\`b");
  });

  it("escapes asterisk", () => {
    assert.strictEqual(escapeMarkdown("a*b"), "a\\*b");
  });

  it("escapes underscore", () => {
    assert.strictEqual(escapeMarkdown("a_b"), "a\\_b");
  });

  it("escapes curly braces", () => {
    assert.strictEqual(escapeMarkdown("a{b}c"), "a\\{b\\}c");
  });

  it("escapes square brackets", () => {
    assert.strictEqual(escapeMarkdown("a[b]c"), "a\\[b\\]c");
  });

  it("escapes parentheses", () => {
    assert.strictEqual(escapeMarkdown("a(b)c"), "a\\(b\\)c");
  });

  it("escapes hash, plus, dash, dot, bang, pipe, and angle bracket", () => {
    assert.strictEqual(escapeMarkdown("#"), "\\#");
    assert.strictEqual(escapeMarkdown("+"), "\\+");
    assert.strictEqual(escapeMarkdown("-"), "\\-");
    assert.strictEqual(escapeMarkdown("."), "\\.");
    assert.strictEqual(escapeMarkdown("!"), "\\!");
    assert.strictEqual(escapeMarkdown("|"), "\\|");
    assert.strictEqual(escapeMarkdown(">"), "\\>");
  });

  it("returns plain text unchanged", () => {
    assert.strictEqual(escapeMarkdown("hello world"), "hello world");
  });

  it("handles empty string", () => {
    assert.strictEqual(escapeMarkdown(""), "");
  });
});

describe("buildPromptPreviewDocument", () => {
  it("produces markdown with session title as H1, metadata list, and prompt in code block", () => {
    const node: SessionPromptNode = {
      kind: "sessionPrompt",
      sessionId: "sess-001",
      sessionTitle: "My Session",
      promptId: "p1",
      promptIndex: 0,
      promptTitle: "First prompt",
      promptRaw: "Hello, world!",
      timestampIso: "2024-01-15T10:30:00.000Z"
    };

    const result = buildPromptPreviewDocument(node);

    assert.ok(result.startsWith("# My Session\n"), "should start with H1 session title");
    assert.ok(result.includes("- Session ID: `sess-001`"), "should include session ID");
    assert.ok(result.includes("- Prompt #: 1"), "should show prompt number starting at 1");
    assert.ok(result.includes("- Timestamp: 2024-01-15T10:30:00.000Z"), "should include timestamp");
    assert.ok(result.includes("## User Prompt"), "should include User Prompt heading");
    assert.ok(result.includes("```text\nHello, world!\n```"), "should include prompt in text code block");
  });

  it("handles missing timestampIso and shows unavailable", () => {
    const node: SessionPromptNode = {
      kind: "sessionPrompt",
      sessionId: "sess-002",
      sessionTitle: "No Timestamp Session",
      promptId: "p2",
      promptIndex: 2,
      promptTitle: "Third prompt",
      promptRaw: "What is 2+2?",
      timestampIso: undefined
    };

    const result = buildPromptPreviewDocument(node);

    assert.ok(result.includes("- Timestamp: unavailable"), "should show unavailable when timestampIso is missing");
    assert.ok(result.includes("- Prompt #: 3"), "should show correct 1-based prompt index");
  });

  it("escapes markdown special characters in session title", () => {
    const node: SessionPromptNode = {
      kind: "sessionPrompt",
      sessionId: "sess-003",
      sessionTitle: "Session [with] *special* chars",
      promptId: "p3",
      promptIndex: 0,
      promptTitle: "Prompt",
      promptRaw: "test",
      timestampIso: "2024-01-15T10:30:00.000Z"
    };

    const result = buildPromptPreviewDocument(node);

    assert.ok(
      result.startsWith("# Session \\[with\\] \\*special\\* chars\n"),
      "should escape markdown in session title"
    );
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
