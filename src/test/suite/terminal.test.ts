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

  it("quotes single quotes in shell values", () => {
    const quoted = shellQuote("id'withquote");
    assert.strictEqual(quoted, "'id'\\''withquote'");
  });
});
