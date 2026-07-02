import * as assert from "assert";
import { extractText, isDisplayableUserPrompt, isRecord } from "../../discovery/content";

describe("extractText", () => {
  it("returns string content as-is", () => {
    assert.strictEqual(extractText("hello world"), "hello world");
  });

  it("joins array of { type, text } objects with newlines", () => {
    const content = [
      { type: "text", text: "line 1" },
      { type: "text", text: "line 2" },
      { type: "text", text: "line 3" }
    ];
    assert.strictEqual(extractText(content), "line 1\nline 2\nline 3");
  });

  it("handles array with plain string elements", () => {
    assert.strictEqual(extractText(["foo", "bar", "baz"]), "foo\nbar\nbaz");
  });

  it("handles mixed array of strings, objects, null, and undefined", () => {
    const content = ["first", { type: "text", text: "second" }, null, undefined, { text: "third" }];
    assert.strictEqual(extractText(content), "first\nsecond\nthird");
  });

  it("filters out array objects missing the text field", () => {
    const content = [
      { type: "image", url: "http://example.com/img.png" },
      { type: "text", text: "kept" }
    ];
    assert.strictEqual(extractText(content), "kept");
  });

  it("handles single object with a text property", () => {
    assert.strictEqual(extractText({ text: "single object text" }), "single object text");
  });

  it("returns empty string for single object without text property", () => {
    assert.strictEqual(extractText({ role: "user" }), "");
  });

  it("returns empty string for null", () => {
    assert.strictEqual(extractText(null), "");
  });

  it("returns empty string for undefined", () => {
    assert.strictEqual(extractText(undefined), "");
  });

  it("returns empty string for a number", () => {
    assert.strictEqual(extractText(42), "");
  });

  it("returns empty string for a boolean", () => {
    assert.strictEqual(extractText(true), "");
  });

  it("returns empty string for an empty array", () => {
    assert.strictEqual(extractText([]), "");
  });
});

describe("isDisplayableUserPrompt", () => {
  it("returns true for normal user text", () => {
    assert.strictEqual(isDisplayableUserPrompt("Implement the new feature"), true);
  });

  it("returns false for prompts starting with <local-command-caveat>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<local-command-caveat>some caveat text</local-command-caveat>"), false);
  });

  it("returns false for prompts starting with <command-name>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<command-name>/model</command-name>"), false);
  });

  it("returns false for prompts starting with <command-message>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<command-message>run checks</command-message>"), false);
  });

  it("returns false for prompts starting with <command-args>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<command-args>My Session Name</command-args>"), false);
  });

  it("returns false for prompts starting with <local-command-stdout>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<local-command-stdout>some output</local-command-stdout>"), false);
  });

  it("returns false for prompts starting with <local-command-stderr>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<local-command-stderr>some error</local-command-stderr>"), false);
  });

  it("returns false for prompts starting with <local-command-exit-code>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<local-command-exit-code>0</local-command-exit-code>"), false);
  });

  it("returns false for prompts starting with <usage>", () => {
    assert.strictEqual(isDisplayableUserPrompt("<usage>some usage info</usage>"), false);
  });

  it("returns false for prompts starting with agentId:", () => {
    assert.strictEqual(isDisplayableUserPrompt("agentId: abc-123-def"), false);
  });

  it("returns false for an empty string", () => {
    assert.strictEqual(isDisplayableUserPrompt(""), false);
  });

  it("returns false for a whitespace-only string", () => {
    assert.strictEqual(isDisplayableUserPrompt("   \t\n  "), false);
  });

  it("returns true when a hidden prefix appears mid-string rather than at the start", () => {
    assert.strictEqual(isDisplayableUserPrompt("Please run <command-name>this command</command-name>"), true);
  });

  it("is case-sensitive: returns true for mixed-case prefix that does not match exactly", () => {
    assert.strictEqual(isDisplayableUserPrompt("<Command-Name>/model</Command-Name>"), true);
  });
});

describe("isRecord", () => {
  it("returns true for a plain empty object", () => {
    assert.strictEqual(isRecord({}), true);
  });

  it("returns true for an object with properties", () => {
    assert.strictEqual(isRecord({ type: "user", sessionId: "sess-1", cwd: "/tmp" }), true);
  });

  it("returns false for null", () => {
    assert.strictEqual(isRecord(null), false);
  });

  it("returns false for undefined", () => {
    assert.strictEqual(isRecord(undefined), false);
  });

  it("returns false for a string", () => {
    assert.strictEqual(isRecord("hello"), false);
  });

  it("returns false for a number", () => {
    assert.strictEqual(isRecord(123), false);
  });

  it("returns true for an array because typeof [] === 'object' and !![] is true", () => {
    // Arrays are objects in JavaScript; isRecord does not special-case them,
    // so [] and non-empty arrays both pass the check.
    assert.strictEqual(isRecord([]), true);
    assert.strictEqual(isRecord([1, 2, 3]), true);
  });
});
