import * as assert from "assert";
import { buildSessionViewHtml } from "../../sessionViewHtml";
import { SessionNode } from "../../models";
import { SessionPrompt } from "../../discovery/types";

function makeSession(overrides: Partial<SessionNode> = {}): SessionNode {
  return {
    kind: "session",
    sessionId: "test-session-id",
    title: "Test Session",
    cwd: "/home/user/project",
    transcriptPath: "/home/user/.claude/projects/proj/test.jsonl",
    updatedAt: new Date("2024-01-15T10:00:00Z").getTime(),
    ...overrides
  };
}

function makePrompt(overrides: Partial<SessionPrompt> = {}): SessionPrompt {
  return {
    promptId: "prompt-1",
    sessionId: "test-session-id",
    promptRaw: "Hello world",
    promptTitle: "Hello world",
    timestampIso: "2024-01-15T10:00:00Z",
    timestampMs: new Date("2024-01-15T10:00:00Z").getTime(),
    ...overrides
  };
}

describe("buildSessionViewHtml", () => {
  it("shows 'No prompts found in this session.' when prompts array is empty", () => {
    const html = buildSessionViewHtml(makeSession(), []);
    assert.ok(html.includes("No prompts found in this session."), "should show empty state message");
  });

  it("contains session title in the header", () => {
    const html = buildSessionViewHtml(makeSession({ title: "My Project Session" }), []);
    assert.ok(html.includes("My Project Session"), "should include session title");
  });

  it("contains session ID in the header", () => {
    const html = buildSessionViewHtml(makeSession(), []);
    assert.ok(html.includes("test-session-id"), "should include session ID");
  });

  it("contains cwd in the header", () => {
    const html = buildSessionViewHtml(makeSession(), []);
    assert.ok(html.includes("/home/user/project"), "should include working directory");
  });

  it("shows correct prompt count for 3 prompts", () => {
    const prompts = [makePrompt(), makePrompt({ promptId: "p2" }), makePrompt({ promptId: "p3" })];
    const html = buildSessionViewHtml(makeSession(), prompts);
    assert.ok(html.includes("Prompts: 3"), "should display correct prompt count");
  });

  it("includes user prompt text in output", () => {
    const html = buildSessionViewHtml(makeSession(), [makePrompt({ promptRaw: "What is TypeScript?" })]);
    assert.ok(html.includes("What is TypeScript?"), "should include user prompt text");
  });

  it("renders markdown bold as <strong>", () => {
    const html = buildSessionViewHtml(makeSession(), [makePrompt({ promptRaw: "This is **bold** text" })]);
    assert.ok(html.includes("<strong>bold</strong>"), "should render **bold** as <strong>bold</strong>");
  });

  it("renders fenced code block as <pre><code>", () => {
    const prompt = makePrompt({ promptRaw: "Example:\n```\nconst x = 1;\n```" });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(html.includes("<pre>"), "should render fenced code block with <pre>");
    assert.ok(html.includes("<code>"), "should render fenced code block with <code>");
  });

  it("includes assistant response content when responseRaw is set", () => {
    const prompt = makePrompt({ responseRaw: "TypeScript is a typed superset of JavaScript." });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(html.includes("TypeScript is a typed superset of JavaScript."), "should include assistant response text");
  });

  it("does not include assistant-role label when responseRaw is undefined", () => {
    const prompt = makePrompt({ responseRaw: undefined });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(!html.includes("assistant-message"), "should not include assistant message block when no response");
  });

  it("includes all prompt texts when multiple prompts are given", () => {
    const prompts = [
      makePrompt({ promptId: "p1", promptRaw: "First question" }),
      makePrompt({ promptId: "p2", promptRaw: "Second question" }),
      makePrompt({ promptId: "p3", promptRaw: "Third question" })
    ];
    const html = buildSessionViewHtml(makeSession(), prompts);
    assert.ok(html.includes("First question"), "should include first prompt");
    assert.ok(html.includes("Second question"), "should include second prompt");
    assert.ok(html.includes("Third question"), "should include third prompt");
  });

  it("escapes <script> tag in prompt — no raw script tag in output", () => {
    const prompt = makePrompt({ promptRaw: "<script>alert(1)</script>" });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(!html.includes("<script>alert(1)</script>"), "should not contain raw script tag in prompt body");
  });

  it("contains Content-Security-Policy meta tag", () => {
    const html = buildSessionViewHtml(makeSession(), []);
    assert.ok(html.includes("Content-Security-Policy"), "should include CSP meta tag");
  });

  it("contains role-label and user-role CSS classes when there are prompts", () => {
    const html = buildSessionViewHtml(makeSession(), [makePrompt()]);
    assert.ok(html.includes("role-label"), "should include role-label CSS class");
    assert.ok(html.includes("user-role"), "should include user-role CSS class");
  });

  it("contains assistant-role CSS class when responseRaw is present", () => {
    const prompt = makePrompt({ responseRaw: "Some response." });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(html.includes("assistant-message"), "should include assistant message block");
  });

  it("includes a formatted date string when timestampIso is present", () => {
    const prompt = makePrompt({ timestampIso: "2024-01-15T10:00:00Z" });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    const expectedTs = new Date("2024-01-15T10:00:00Z").toLocaleString();
    assert.ok(html.includes(expectedTs), "should include the locale-formatted timestamp");
  });

  it("does not crash and produces valid HTML when timestampIso is undefined", () => {
    const prompt = makePrompt({ timestampIso: undefined, timestampMs: undefined });
    const html = buildSessionViewHtml(makeSession(), [prompt]);
    assert.ok(html.includes("<!DOCTYPE html>"), "should still produce valid HTML without timestamp");
    assert.ok(html.includes("Hello world"), "should still include prompt text");
  });

  it("HTML-escapes special characters in session title", () => {
    const session = makeSession({ title: 'Session <script>alert("xss")</script>' });
    const html = buildSessionViewHtml(session, []);
    assert.ok(!html.includes("<script>"), "should not include raw script tag in title");
    assert.ok(html.includes("&lt;script&gt;"), "should HTML-escape script tag in session title");
  });
});
