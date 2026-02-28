import * as assert from "assert";
import { extractSnippet } from "../../search/searchCommand";

// The snippet context is 40 chars on each side of the match (from SNIPPET_CONTEXT_CHARS constant)
const CONTEXT = 40;

describe("extractSnippet", () => {
  // ---------------------------------------------------------------------------
  // Test 1: Basic snippet — match in the middle of a long text
  // ---------------------------------------------------------------------------
  it("returns '...' prefix and suffix when match is in the middle of a long text", () => {
    const prefix = "a".repeat(CONTEXT + 5); // 45 chars before match
    const match = "KEYWORD";
    const suffix = "b".repeat(CONTEXT + 5); // 45 chars after match
    const text = prefix + match + suffix;

    const matchIndex = prefix.length;
    const snippet = extractSnippet(text, matchIndex, match.length);

    assert.ok(snippet.startsWith("..."), "snippet should start with '...' when there is text before context");
    assert.ok(snippet.endsWith("..."), "snippet should end with '...' when there is text after context");
    assert.ok(snippet.includes("KEYWORD"), "snippet should include the matched keyword");
  });

  // ---------------------------------------------------------------------------
  // Test 2: Match at start — no "..." prefix but "..." suffix
  // ---------------------------------------------------------------------------
  it("has no '...' prefix but has '...' suffix when match is at the very start", () => {
    const match = "STARTMATCH";
    const suffix = "c".repeat(CONTEXT + 10); // more than context chars after match
    const text = match + suffix;

    const snippet = extractSnippet(text, 0, match.length);

    assert.ok(!snippet.startsWith("..."), "snippet should NOT start with '...' when match is at position 0");
    assert.ok(snippet.endsWith("..."), "snippet should end with '...' when there is text after the context window");
    assert.ok(snippet.includes("STARTMATCH"), "snippet should include the matched text");
  });

  // ---------------------------------------------------------------------------
  // Test 3: Match at end — "..." prefix but no "..." suffix
  // ---------------------------------------------------------------------------
  it("has '...' prefix but no '...' suffix when match is at the very end", () => {
    const prefix = "d".repeat(CONTEXT + 10); // more than context chars before match
    const match = "ENDMATCH";
    const text = prefix + match;

    const matchIndex = prefix.length;
    const snippet = extractSnippet(text, matchIndex, match.length);

    assert.ok(
      snippet.startsWith("..."),
      "snippet should start with '...' when there is text before the context window"
    );
    assert.ok(!snippet.endsWith("..."), "snippet should NOT end with '...' when match is at the very end of text");
    assert.ok(snippet.includes("ENDMATCH"), "snippet should include the matched text");
  });

  // ---------------------------------------------------------------------------
  // Test 4: Short text — no "..." at all when entire text fits within context
  // ---------------------------------------------------------------------------
  it("has no '...' at either end when the entire text is shorter than the context window", () => {
    const text = "Short text with MATCH here";
    const matchIndex = text.indexOf("MATCH");

    const snippet = extractSnippet(text, matchIndex, "MATCH".length);

    assert.ok(!snippet.startsWith("..."), "snippet should NOT start with '...' when text is short");
    assert.ok(!snippet.endsWith("..."), "snippet should NOT end with '...' when text is short");
    assert.ok(snippet.includes("MATCH"), "snippet should include the matched text");
    assert.strictEqual(snippet, text, "snippet should equal the full text when it fits within context");
  });

  // ---------------------------------------------------------------------------
  // Test 5: Multiline text — newlines are collapsed to spaces
  // ---------------------------------------------------------------------------
  it("collapses newlines and carriage returns to spaces in the snippet", () => {
    const text = "Line one of context\nLine two of context\nKEYWORD\nLine four of context\nLine five of context";
    const matchIndex = text.indexOf("KEYWORD");

    const snippet = extractSnippet(text, matchIndex, "KEYWORD".length);

    assert.ok(!snippet.includes("\n"), "snippet should not contain raw newline characters");
    assert.ok(!snippet.includes("\r"), "snippet should not contain raw carriage return characters");
    assert.ok(snippet.includes("KEYWORD"), "snippet should include the matched text");
    // Newlines should have been replaced with spaces
    assert.ok(snippet.includes("Line one of context Line two of context"), "newlines should be replaced with spaces");
  });

  // ---------------------------------------------------------------------------
  // Test 6: Multiple whitespace — runs of whitespace are collapsed to single space
  // ---------------------------------------------------------------------------
  it("collapses consecutive whitespace characters to a single space", () => {
    const text = "Before   match  with    extra     spaces  KEYWORD  and   more   spaces";
    const matchIndex = text.indexOf("KEYWORD");

    const snippet = extractSnippet(text, matchIndex, "KEYWORD".length);

    assert.ok(!/\s{2,}/.test(snippet), "snippet should not contain two or more consecutive whitespace characters");
    assert.ok(snippet.includes("KEYWORD"), "snippet should include the matched text");
  });

  // ---------------------------------------------------------------------------
  // Test 7: Tabs are collapsed to spaces
  // ---------------------------------------------------------------------------
  it("collapses tab characters to spaces", () => {
    const text = "Before\t\tKEYWORD\t\tAfter";
    const matchIndex = text.indexOf("KEYWORD");

    const snippet = extractSnippet(text, matchIndex, "KEYWORD".length);

    assert.ok(!snippet.includes("\t"), "snippet should not contain tab characters");
    assert.ok(snippet.includes("KEYWORD"), "snippet should include the matched text");
  });

  // ---------------------------------------------------------------------------
  // Test 8: Empty match context — match is the entire text
  // ---------------------------------------------------------------------------
  it("returns the full text without '...' when the match spans the entire text", () => {
    const text = "ExactlyTheMatch";
    const snippet = extractSnippet(text, 0, text.length);

    assert.ok(!snippet.startsWith("..."), "no '...' prefix when match is at start");
    assert.ok(!snippet.endsWith("..."), "no '...' suffix when match reaches end");
    assert.strictEqual(snippet, text, "snippet should equal the entire text");
  });

  // ---------------------------------------------------------------------------
  // Test 9: Long match — the matched term itself is very long
  // ---------------------------------------------------------------------------
  it("handles a very long matched term that spans most of the text", () => {
    const longMatch = "x".repeat(200);
    const text = "prefix " + longMatch + " suffix";
    const matchIndex = "prefix ".length;

    const snippet = extractSnippet(text, matchIndex, longMatch.length);

    assert.ok(snippet.includes(longMatch), "snippet should include the long matched term");
    // The snippet should include context around the match
    assert.ok(snippet.includes("prefix"), "snippet should include text before the long match (within context)");
    assert.ok(snippet.includes("suffix"), "snippet should include text after the long match (within context)");
  });

  // ---------------------------------------------------------------------------
  // Test 10: Match in the exact middle with exactly CONTEXT chars on each side
  // ---------------------------------------------------------------------------
  it("produces no '...' ellipsis when context exactly fills the window boundary", () => {
    const prefix = "e".repeat(CONTEXT); // exactly CONTEXT chars before match
    const match = "MID";
    const suffix = "f".repeat(CONTEXT); // exactly CONTEXT chars after match
    const text = prefix + match + suffix;

    const matchIndex = prefix.length;
    const snippet = extractSnippet(text, matchIndex, match.length);

    // start = max(0, CONTEXT - CONTEXT) = 0 → no prefix ellipsis
    // end = min(text.length, CONTEXT + 3 + CONTEXT) = text.length → no suffix ellipsis
    assert.ok(!snippet.startsWith("..."), "no '...' prefix when prefix length equals CONTEXT exactly");
    assert.ok(!snippet.endsWith("..."), "no '...' suffix when suffix length equals CONTEXT exactly");
    assert.ok(snippet.includes("MID"), "snippet should include the match");
    assert.strictEqual(snippet, text, "snippet should equal the full text when boundaries are exact");
  });

  // ---------------------------------------------------------------------------
  // Test 11: Verifies snippet context window size (~40 chars before and after)
  // ---------------------------------------------------------------------------
  it("includes approximately CONTEXT characters before and after the match", () => {
    const prefix = "abcdefghijklmnopqrstuvwxyz1234567890abcd"; // exactly 40 chars
    const extraBefore = "HIDDEN_PREFIX_"; // 14 chars — outside context window
    const match = "TARGET";
    const suffix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD"; // exactly 40 chars
    const extraAfter = "_HIDDEN_SUFFIX"; // outside context window

    const text = extraBefore + prefix + match + suffix + extraAfter;
    const matchIndex = extraBefore.length + prefix.length;

    const snippet = extractSnippet(text, matchIndex, match.length);

    // Should include the 40-char prefix window
    assert.ok(snippet.includes(prefix), "snippet should include the 40 characters before the match");
    // Should include the match
    assert.ok(snippet.includes(match), "snippet should include the match itself");
    // Should include the 40-char suffix window
    assert.ok(snippet.includes(suffix), "snippet should include the 40 characters after the match");
    // Should have '...' on the left because extraBefore was cut off
    assert.ok(snippet.startsWith("..."), "snippet should have '...' prefix because there is text before the context");
    // Should have '...' on the right because extraAfter was cut off
    assert.ok(snippet.endsWith("..."), "snippet should have '...' suffix because there is text after the context");
    // Should NOT include the hidden parts outside the window
    assert.ok(!snippet.includes("HIDDEN_PREFIX_"), "snippet should not include text outside the left context window");
    assert.ok(!snippet.includes("_HIDDEN_SUFFIX"), "snippet should not include text outside the right context window");
  });

  // ---------------------------------------------------------------------------
  // Test 12: Match index at zero with exactly CONTEXT trailing chars
  // ---------------------------------------------------------------------------
  it("returns just the text and match with trailing '...' when match is at index 0 and tail is long", () => {
    const match = "FIRST";
    const tail = "g".repeat(CONTEXT + 1); // one more than context, so '...' should appear
    const text = match + tail;

    const snippet = extractSnippet(text, 0, match.length);

    assert.ok(!snippet.startsWith("..."), "no leading '...' when match starts at position 0");
    assert.ok(snippet.endsWith("..."), "trailing '...' because tail exceeds context window");
  });
});
