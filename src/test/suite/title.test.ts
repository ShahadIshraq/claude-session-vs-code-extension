import * as assert from "assert";
import {
  buildTitle,
  chooseSessionTitleRaw,
  parseRenameCommandArgs,
  parseRenameStdoutTitle,
  toNonEmptySingleLine
} from "../../discovery/title";

const SESSION_ID = "12345678-aaaa-bbbb-cccc-1234567890ab";

describe("buildTitle", () => {
  it("uses sanitized first non-empty line", () => {
    const title = buildTitle("Hello Claude", SESSION_ID);
    assert.strictEqual(title, "Hello Claude");
  });

  it("truncates at 80 chars with '...' suffix (total length 80)", () => {
    const raw = "x".repeat(100);
    const title = buildTitle(raw, SESSION_ID);
    assert.strictEqual(title.length, 80);
    assert.ok(title.endsWith("..."));
    assert.strictEqual(title, "x".repeat(77) + "...");
  });

  it("returns fallback Session xxxxxxxx when rawPrompt is empty string", () => {
    const title = buildTitle("", SESSION_ID);
    assert.strictEqual(title, "Session 12345678");
  });

  it("returns fallback when rawPrompt is only whitespace and newlines", () => {
    const title = buildTitle("   \n\n\t  \r\n  ", SESSION_ID);
    assert.strictEqual(title, "Session 12345678");
  });

  it("returns fallback when rawPrompt is only XML tags (sanitized to empty)", () => {
    const title = buildTitle("<command-name></command-name>", SESSION_ID);
    assert.strictEqual(title, "Session 12345678");
  });

  it("strips HTML and XML tags from title", () => {
    const title = buildTitle("<command-message>run checks</command-message>", SESSION_ID);
    assert.strictEqual(title, "run checks");
  });

  it("collapses multiple whitespace to single space", () => {
    const title = buildTitle("hello    world", SESSION_ID);
    assert.strictEqual(title, "hello world");
  });

  it("uses second line if first line is empty", () => {
    const title = buildTitle("\n\nSecond line content", SESSION_ID);
    assert.strictEqual(title, "Second line content");
  });

  it("does not truncate when rawPrompt is exactly 80 chars", () => {
    const raw = "a".repeat(80);
    const title = buildTitle(raw, SESSION_ID);
    assert.strictEqual(title.length, 80);
    assert.ok(!title.endsWith("..."));
    assert.strictEqual(title, raw);
  });

  it("truncates when rawPrompt is 81 chars to total length of 80", () => {
    const raw = "b".repeat(81);
    const title = buildTitle(raw, SESSION_ID);
    assert.strictEqual(title.length, 80);
    assert.ok(title.endsWith("..."));
    assert.strictEqual(title, "b".repeat(77) + "...");
  });
});

describe("chooseSessionTitleRaw", () => {
  it("returns latestExplicitTitle when all three sources are provided", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: "Explicit Title",
      firstPromptRaw: "First prompt content",
      firstUserRaw: "First user content"
    });
    assert.strictEqual(result, "Explicit Title");
  });

  it("returns firstPromptRaw when latestExplicitTitle is empty string", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: "",
      firstPromptRaw: "First prompt content",
      firstUserRaw: "First user content"
    });
    assert.strictEqual(result, "First prompt content");
  });

  it("returns firstPromptRaw when latestExplicitTitle is undefined", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: undefined,
      firstPromptRaw: "First prompt content",
      firstUserRaw: "First user content"
    });
    assert.strictEqual(result, "First prompt content");
  });

  it("returns firstUserRaw when both explicit and firstPromptRaw are empty", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: "",
      firstPromptRaw: "",
      firstUserRaw: "First user content"
    });
    assert.strictEqual(result, "First user content");
  });

  it("returns undefined when all three sources are empty strings", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: "",
      firstPromptRaw: "",
      firstUserRaw: ""
    });
    assert.strictEqual(result, undefined);
  });

  it("returns undefined when all three sources are undefined", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: undefined,
      firstPromptRaw: undefined,
      firstUserRaw: undefined
    });
    assert.strictEqual(result, undefined);
  });

  it("trims whitespace from explicit title via toNonEmptySingleLine", () => {
    const result = chooseSessionTitleRaw({
      latestExplicitTitle: "  My Session  ",
      firstPromptRaw: "First prompt content",
      firstUserRaw: "First user content"
    });
    assert.strictEqual(result, "My Session");
  });
});

describe("parseRenameCommandArgs", () => {
  it("extracts title from a valid rename command", () => {
    const raw =
      "<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args>My Session Name</command-args>";
    const result = parseRenameCommandArgs(raw);
    assert.strictEqual(result, "My Session Name");
  });

  it("returns undefined for a non-rename command", () => {
    const raw =
      "<command-name>/model</command-name>\n<command-message>change model</command-message>\n<command-args>claude-3</command-args>";
    const result = parseRenameCommandArgs(raw);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined when command-args is empty", () => {
    const raw =
      "<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args></command-args>";
    const result = parseRenameCommandArgs(raw);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined when no command-args tag is present", () => {
    const raw = "<command-name>/rename</command-name>\n<command-message>rename</command-message>";
    const result = parseRenameCommandArgs(raw);
    assert.strictEqual(result, undefined);
  });
});

describe("parseRenameStdoutTitle", () => {
  it("extracts title from 'Session renamed to: ...' stdout", () => {
    const raw = "<local-command-stdout>Session renamed to: my-session-title</local-command-stdout>";
    const result = parseRenameStdoutTitle(raw);
    assert.strictEqual(result, "my-session-title");
  });

  it("extracts title from 'Session and agent renamed to: ...' stdout", () => {
    const raw =
      "<local-command-stdout>Session and agent renamed to: auto-generated-session-name</local-command-stdout>";
    const result = parseRenameStdoutTitle(raw);
    assert.strictEqual(result, "auto-generated-session-name");
  });

  it("returns undefined for non-rename stdout content", () => {
    const raw = "<local-command-stdout>Some other output that is not a rename</local-command-stdout>";
    const result = parseRenameStdoutTitle(raw);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined when no local-command-stdout tag is present", () => {
    const raw = "Session renamed to: my-session-title";
    const result = parseRenameStdoutTitle(raw);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined when stdout content is empty after prefix removal", () => {
    const raw = "<local-command-stdout>Session renamed to:   </local-command-stdout>";
    const result = parseRenameStdoutTitle(raw);
    assert.strictEqual(result, undefined);
  });
});

describe("toNonEmptySingleLine", () => {
  it("returns a trimmed single-line string unchanged", () => {
    const result = toNonEmptySingleLine("hello world");
    assert.strictEqual(result, "hello world");
  });

  it("collapses a multiline string to a single line", () => {
    const result = toNonEmptySingleLine("line one\nline two\nline three");
    assert.strictEqual(result, "line one line two line three");
  });

  it("returns undefined for an empty string", () => {
    const result = toNonEmptySingleLine("");
    assert.strictEqual(result, undefined);
  });

  it("returns undefined for a whitespace-only string", () => {
    const result = toNonEmptySingleLine("   \t\n  ");
    assert.strictEqual(result, undefined);
  });

  it("returns undefined for non-string inputs (number, null, undefined)", () => {
    assert.strictEqual(toNonEmptySingleLine(42), undefined);
    assert.strictEqual(toNonEmptySingleLine(null), undefined);
    assert.strictEqual(toNonEmptySingleLine(undefined), undefined);
  });
});
