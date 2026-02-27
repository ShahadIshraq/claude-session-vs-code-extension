import * as assert from "assert";
import { buildClaudeResumeCommand, shellQuote } from "../../terminal";

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
