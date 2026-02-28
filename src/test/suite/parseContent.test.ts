import * as assert from "assert";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { parseSessionContent } from "../../search/parseContent";

const FIXTURES = path.resolve(__dirname, "../fixtures/");
const CONTENT_CAP_CHARS = 200 * 1024;

describe("parseSessionContent", () => {
  let tmpDir: string;
  const noop = () => {};

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "parse-content-test-"));
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test 1: Basic extraction — includes both user and assistant messages
  // ---------------------------------------------------------------------------
  it("extracts text from both user and assistant messages in the fixture file", async () => {
    const filePath = path.join(FIXTURES, "search-content.jsonl");
    const result = await parseSessionContent(filePath, noop);

    // Should include user message text
    assert.ok(result.includes("JWT authentication"), "result should contain text from a user message");
    // Should include assistant message text
    assert.ok(result.includes("jsonwebtoken"), "result should contain text from an assistant message");
    // Should include another user message
    assert.ok(result.includes("middleware function"), "result should contain text from the second user message");
    // Should include another assistant message about refresh tokens
    assert.ok(
      result.includes("Refresh token rotation"),
      "result should contain text from assistant response about refresh tokens"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Skips internal commands — hidden-prefix messages are NOT in result
  // ---------------------------------------------------------------------------
  it("does not include text from internal user commands with hidden prefixes", async () => {
    const filePath = path.join(FIXTURES, "search-content.jsonl");
    const result = await parseSessionContent(filePath, noop);

    // The <local-command-stdout> line contained "npm install jsonwebtoken express-jwt"
    // But "npm install" should NOT appear because that line is skipped as an internal command
    assert.ok(
      !result.includes("npm install jsonwebtoken"),
      "result should NOT contain text from <local-command-stdout> internal command"
    );

    // The <command-name>/cost</command-name> line should also be skipped
    assert.ok(!result.includes("/cost"), "result should NOT contain text from <command-name> internal command");
  });

  // ---------------------------------------------------------------------------
  // Test 3: Includes assistant messages — verifies assistant content is included
  // ---------------------------------------------------------------------------
  it("includes text from assistant messages", async () => {
    const filePath = path.join(FIXTURES, "search-content.jsonl");
    const result = await parseSessionContent(filePath, noop);

    assert.ok(
      result.includes("axios interceptor"),
      "result should contain text from the assistant's frontend advice message"
    );
    assert.ok(result.includes("httpOnly cookie"), "result should contain another phrase from the assistant response");
  });

  // ---------------------------------------------------------------------------
  // Test 4: Handles empty file — returns empty string
  // ---------------------------------------------------------------------------
  it("returns an empty string for an empty file", async () => {
    const filePath = path.join(FIXTURES, "empty.jsonl");
    const result = await parseSessionContent(filePath, noop);

    assert.strictEqual(result, "", "empty file should produce an empty string");
  });

  // ---------------------------------------------------------------------------
  // Test 5: Handles malformed JSON lines — skips them gracefully
  // ---------------------------------------------------------------------------
  it("skips malformed JSON lines without throwing and logs the error", async () => {
    const lines = [
      "{not valid json at all",
      JSON.stringify({
        type: "user",
        sessionId: "sess-malformed",
        uuid: "u-good",
        message: { role: "user", content: "Good message after malformed line" }
      }),
      "another bad line!!!",
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-malformed",
        uuid: "a-good",
        message: { role: "assistant", content: "Good assistant response" }
      })
    ];
    const filePath = path.join(tmpDir, "test-malformed.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const logMessages: string[] = [];
    const log = (msg: string) => logMessages.push(msg);

    let result: string;
    // Should not throw
    try {
      result = await parseSessionContent(filePath, log);
    } catch (err) {
      assert.fail(`parseSessionContent should not throw on malformed lines, got: ${String(err)}`);
      return;
    }

    // Good user message should be present
    assert.ok(
      result.includes("Good message after malformed line"),
      "result should include text from the valid user message"
    );
    // Good assistant message should be present
    assert.ok(
      result.includes("Good assistant response"),
      "result should include text from the valid assistant message"
    );

    // Log should have been called for each malformed line
    assert.ok(logMessages.length >= 2, "should have logged at least 2 malformed-line errors");
    assert.ok(
      logMessages.every((m) => m.includes("[search]") && m.includes("malformed JSON")),
      "all log messages should mention [search] and malformed JSON"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 6: Content cap at 200KB
  // ---------------------------------------------------------------------------
  it("caps the output at approximately 200KB when the transcript content is very large", async () => {
    // Each message is roughly 1000 chars. We need more than 200KB = 204800 bytes total.
    // Use 250 messages of ~1000 chars each = ~250KB.
    const messagePart = "a".repeat(900); // 900 chars of filler per message
    const lines: string[] = [];

    // Alternate user and assistant messages
    for (let i = 0; i < 250; i++) {
      if (i % 2 === 0) {
        lines.push(
          JSON.stringify({
            type: "user",
            sessionId: "sess-cap",
            uuid: `u-${String(i)}`,
            message: { role: "user", content: `User prompt ${String(i)}: ${messagePart}` }
          })
        );
      } else {
        lines.push(
          JSON.stringify({
            type: "assistant",
            sessionId: "sess-cap",
            uuid: `a-${String(i)}`,
            message: { role: "assistant", content: `Assistant response ${String(i)}: ${messagePart}` }
          })
        );
      }
    }

    const filePath = path.join(tmpDir, "large-content.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const logMessages: string[] = [];
    const log = (msg: string) => logMessages.push(msg);

    const result = await parseSessionContent(filePath, log);

    // Result should be capped — well under 250KB of text
    assert.ok(
      result.length <= CONTENT_CAP_CHARS + 2000, // allow a bit of overshoot due to last message
      `result length ${String(result.length)} should be close to the 200KB cap`
    );
    // Result should be substantial — close to 200KB
    assert.ok(
      result.length >= CONTENT_CAP_CHARS * 0.9,
      `result length ${String(result.length)} should be close to 200KB (within 10%)`
    );

    // The cap log message should have been emitted
    assert.ok(
      logMessages.some((m) => m.includes("[search]") && m.includes("content cap")),
      "should log a message when content cap is reached"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 7: Handles missing message field — records without message are skipped
  // ---------------------------------------------------------------------------
  it("skips records that do not have a message field", async () => {
    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-no-msg", cwd: "/home/user/project" }),
      JSON.stringify({ type: "user", sessionId: "sess-no-msg" }), // no message field
      JSON.stringify({
        type: "user",
        sessionId: "sess-no-msg",
        uuid: "u-with-msg",
        message: { role: "user", content: "This message has a proper message field" }
      }),
      JSON.stringify({ type: "assistant", sessionId: "sess-no-msg" }), // no message field
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-no-msg",
        message: { role: "assistant", content: "Assistant response with message field" }
      })
    ];
    const filePath = path.join(tmpDir, "missing-message.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    assert.ok(
      result.includes("This message has a proper message field"),
      "result should contain text from messages that have the message field"
    );
    assert.ok(
      result.includes("Assistant response with message field"),
      "result should contain text from assistant messages that have the message field"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 8: Handles various content formats — string, array, and object content
  // ---------------------------------------------------------------------------
  it("handles string content, array content, and object content formats correctly", async () => {
    const lines = [
      // String content
      JSON.stringify({
        type: "user",
        sessionId: "sess-formats",
        uuid: "u-string",
        message: { role: "user", content: "String content user message" }
      }),
      // Array content (array of {type, text} objects — Claude's streaming format)
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-formats",
        uuid: "a-array",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Array content part one" },
            { type: "text", text: "array content part two" }
          ]
        }
      }),
      // Object content with a text property
      JSON.stringify({
        type: "user",
        sessionId: "sess-formats",
        uuid: "u-object",
        message: { role: "user", content: { text: "Object content user message" } }
      }),
      // Array of plain strings
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-formats",
        uuid: "a-str-array",
        message: {
          role: "assistant",
          content: ["Plain string array part one", "plain string array part two"]
        }
      })
    ];

    const filePath = path.join(tmpDir, "content-formats.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    assert.ok(result.includes("String content user message"), "should handle string content");
    assert.ok(result.includes("Array content part one"), "should handle array of {type, text} objects");
    assert.ok(result.includes("array content part two"), "should include all parts from array content");
    assert.ok(result.includes("Object content user message"), "should handle object content with text property");
    assert.ok(result.includes("Plain string array part one"), "should handle array of plain strings");
  });

  // ---------------------------------------------------------------------------
  // Test 9: Concatenates all extracted text with newline separators
  // ---------------------------------------------------------------------------
  it("joins all extracted text parts with newlines", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-join",
        uuid: "u-1",
        message: { role: "user", content: "First user message" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-join",
        uuid: "a-1",
        message: { role: "assistant", content: "First assistant response" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-join",
        uuid: "u-2",
        message: { role: "user", content: "Second user message" }
      })
    ];
    const filePath = path.join(tmpDir, "join-test.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    // All three parts should be present, separated by newlines
    const parts = result.split("\n");
    assert.ok(parts.length >= 3, "result should contain at least 3 newline-separated parts");
    assert.ok(parts.includes("First user message"), "first user message should be a separate part");
    assert.ok(parts.includes("First assistant response"), "assistant response should be a separate part");
    assert.ok(parts.includes("Second user message"), "second user message should be a separate part");
  });

  // ---------------------------------------------------------------------------
  // Test 10: Skips empty and whitespace-only content
  // ---------------------------------------------------------------------------
  it("skips user and assistant messages with empty or whitespace-only content", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-empty-content",
        uuid: "u-empty",
        message: { role: "user", content: "" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-empty-content",
        uuid: "u-spaces",
        message: { role: "user", content: "   \t\n   " }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-empty-content",
        uuid: "a-empty",
        message: { role: "assistant", content: "" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-empty-content",
        uuid: "u-real",
        message: { role: "user", content: "This is a real user message" }
      })
    ];
    const filePath = path.join(tmpDir, "empty-content.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    assert.ok(result.includes("This is a real user message"), "should include non-empty messages");
    // The result should not have leading or trailing empty sections from skipped messages
    assert.ok(result.trim().length > 0, "result should not be empty");
  });

  // ---------------------------------------------------------------------------
  // Test 11: Skips system records (type === "system")
  // ---------------------------------------------------------------------------
  it("does not include text from system records in the result", async () => {
    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-sys", cwd: "/home/user/project" }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-sys",
        uuid: "u-1",
        message: { role: "user", content: "User message after system record" }
      })
    ];
    const filePath = path.join(tmpDir, "system-record.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    assert.ok(result.includes("User message after system record"), "should include the user message");
    // The system record has no message.role so it would be skipped by type check
    // "/home/user/project" from the system record should not appear in text output
    assert.ok(!result.includes("/home/user/project"), "should not include cwd from the system record");
  });

  // ---------------------------------------------------------------------------
  // Test 12: Handles whitespace-only lines (blank lines) without errors
  // ---------------------------------------------------------------------------
  it("ignores blank and whitespace-only lines in the transcript without throwing", async () => {
    const lines = [
      "",
      "   ",
      JSON.stringify({
        type: "user",
        sessionId: "sess-blank",
        uuid: "u-1",
        message: { role: "user", content: "Message after blank lines" }
      }),
      "",
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-blank",
        uuid: "a-1",
        message: { role: "assistant", content: "Assistant after blank lines" }
      }),
      "   "
    ];
    const filePath = path.join(tmpDir, "blank-lines.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const result = await parseSessionContent(filePath, noop);

    assert.ok(result.includes("Message after blank lines"), "should handle blank lines gracefully");
    assert.ok(result.includes("Assistant after blank lines"), "should include assistant message after blank lines");
  });
});
