import * as assert from "assert";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { parseAllUserPrompts } from "../../discovery/parsePrompts";

const FIXTURES = path.resolve(__dirname, "../fixtures/");

describe("parseAllUserPrompts", () => {
  let tmpDir: string;
  const noop = () => {};

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "parse-prompts-test-"));
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test 1: extracts prompts from simple-session.jsonl
  // ---------------------------------------------------------------------------
  it("extracts user prompts with correct fields from simple-session.jsonl", async () => {
    const filePath = path.join(FIXTURES, "simple-session.jsonl");
    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 2);

    const first = prompts[0];
    assert.strictEqual(first.promptId, "prompt-1");
    assert.strictEqual(first.sessionId, "sess-simple-001");
    assert.strictEqual(first.promptRaw, "Hello Claude, help me fix the bug");
    assert.strictEqual(first.promptTitle, "Hello Claude, help me fix the bug");
    assert.strictEqual(first.timestampIso, "2025-06-01T10:00:00Z");
    assert.strictEqual(first.timestampMs, Date.parse("2025-06-01T10:00:00Z"));

    const second = prompts[1];
    assert.strictEqual(second.promptId, "prompt-2");
    assert.strictEqual(second.sessionId, "sess-simple-001");
    assert.strictEqual(second.promptRaw, "Now add tests for the module");
    assert.strictEqual(second.promptTitle, "Now add tests for the module");
    assert.strictEqual(second.timestampIso, "2025-06-01T10:05:00Z");
    assert.strictEqual(second.timestampMs, Date.parse("2025-06-01T10:05:00Z"));
  });

  // ---------------------------------------------------------------------------
  // Test 2: filters out non-displayable (command) prompts
  // ---------------------------------------------------------------------------
  it("returns empty array when all user messages are non-displayable commands", async () => {
    const filePath = path.join(FIXTURES, "command-only-prompts.jsonl");
    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Test 3: uses fallback session ID when line has no sessionId field
  // ---------------------------------------------------------------------------
  it("uses fallback session ID when a line has no sessionId", async () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "uuid-no-session",
      timestamp: "2025-01-01T00:00:00Z",
      message: { role: "user", content: "Prompt without a session ID" }
    });
    const filePath = path.join(tmpDir, "no-session-id.jsonl");
    await fsp.writeFile(filePath, line, "utf8");

    const prompts = await parseAllUserPrompts(filePath, "my-fallback-session", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].sessionId, "my-fallback-session");
  });

  // ---------------------------------------------------------------------------
  // Test 4: uses fallback promptId (fallbackSessionId:N) when line has no uuid
  // ---------------------------------------------------------------------------
  it("uses fallback promptId when a line has no uuid", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-abc",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: "First prompt without uuid" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-abc",
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "Second prompt without uuid" }
      })
    ];
    const filePath = path.join(tmpDir, "no-uuid.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-id", noop);

    assert.strictEqual(prompts.length, 2);
    assert.strictEqual(prompts[0].promptId, "fallback-id:0");
    assert.strictEqual(prompts[1].promptId, "fallback-id:1");
  });

  // ---------------------------------------------------------------------------
  // Test 5: skips assistant messages
  // ---------------------------------------------------------------------------
  it("skips assistant messages and only returns user messages", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-x",
        uuid: "u1",
        message: { role: "user", content: "User message A" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-x",
        uuid: "a1",
        message: { role: "assistant", content: "Assistant reply" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-x",
        uuid: "u2",
        message: { role: "user", content: "User message B" }
      })
    ];
    const filePath = path.join(tmpDir, "skip-assistant.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 2);
    assert.strictEqual(prompts[0].promptRaw, "User message A");
    assert.strictEqual(prompts[1].promptRaw, "User message B");
  });

  // ---------------------------------------------------------------------------
  // Test 6: skips system messages
  // ---------------------------------------------------------------------------
  it("skips system messages", async () => {
    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-y", cwd: "/home/user" }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-y",
        uuid: "u1",
        message: { role: "user", content: "Only displayable message" }
      })
    ];
    const filePath = path.join(tmpDir, "skip-system.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].promptRaw, "Only displayable message");
  });

  // ---------------------------------------------------------------------------
  // Test 7: skips empty and whitespace-only user prompts
  // ---------------------------------------------------------------------------
  it("skips user messages with empty or whitespace-only content", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-z",
        uuid: "u-empty",
        message: { role: "user", content: "" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-z",
        uuid: "u-spaces",
        message: { role: "user", content: "   \t\n  " }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-z",
        uuid: "u-real",
        message: { role: "user", content: "A real prompt" }
      })
    ];
    const filePath = path.join(tmpDir, "empty-prompts.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].promptRaw, "A real prompt");
  });

  // ---------------------------------------------------------------------------
  // Test 8: handles malformed JSON lines gracefully and continues parsing
  // ---------------------------------------------------------------------------
  it("skips malformed JSON lines and continues parsing valid lines", async () => {
    const filePath = path.join(FIXTURES, "malformed.jsonl");
    const logMessages: string[] = [];
    const log = (msg: string) => logMessages.push(msg);

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", log);

    // The one valid displayable user prompt in malformed.jsonl should be returned
    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].promptRaw, "Valid prompt after malformed lines");
    assert.strictEqual(prompts[0].promptId, "prompt-1");

    // Log messages should have been emitted for the malformed lines
    assert.ok(logMessages.length > 0, "expected log messages for malformed JSON");
    assert.ok(
      logMessages.every((m) => m.includes("[discovery]") && m.includes("malformed JSON")),
      "log messages should reference malformed JSON"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 9: returns empty array for an empty file
  // ---------------------------------------------------------------------------
  it("returns an empty array for an empty file", async () => {
    const filePath = path.join(FIXTURES, "empty.jsonl");
    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 0);
    assert.deepStrictEqual(prompts, []);
  });

  // ---------------------------------------------------------------------------
  // Test 10: missing timestamp field → timestampIso and timestampMs are undefined
  // ---------------------------------------------------------------------------
  it("leaves timestampIso and timestampMs undefined when timestamp field is missing", async () => {
    const line = JSON.stringify({
      type: "user",
      sessionId: "sess-no-ts",
      uuid: "uuid-no-ts",
      message: { role: "user", content: "Prompt with no timestamp" }
    });
    const filePath = path.join(tmpDir, "no-timestamp.jsonl");
    await fsp.writeFile(filePath, line, "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].timestampIso, undefined);
    assert.strictEqual(prompts[0].timestampMs, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 11: invalid timestamp string → timestampMs is undefined but timestampIso is preserved
  // ---------------------------------------------------------------------------
  it("leaves timestampMs undefined when timestamp string is not a valid date", async () => {
    const line = JSON.stringify({
      type: "user",
      sessionId: "sess-bad-ts",
      uuid: "uuid-bad-ts",
      timestamp: "not-a-real-date",
      message: { role: "user", content: "Prompt with invalid timestamp" }
    });
    const filePath = path.join(tmpDir, "bad-timestamp.jsonl");
    await fsp.writeFile(filePath, line, "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].timestampIso, "not-a-real-date");
    assert.strictEqual(prompts[0].timestampMs, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 12: returns prompts in the order they appear in the file
  // ---------------------------------------------------------------------------
  it("returns prompts in the order they appear in the file", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-order",
        uuid: "uuid-first",
        timestamp: "2025-03-01T08:00:00Z",
        message: { role: "user", content: "First prompt" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-order",
        uuid: "uuid-second",
        timestamp: "2025-03-01T08:01:00Z",
        message: { role: "user", content: "Second prompt" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-order",
        uuid: "uuid-third",
        timestamp: "2025-03-01T08:02:00Z",
        message: { role: "user", content: "Third prompt" }
      })
    ];
    const filePath = path.join(tmpDir, "order.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 3);
    assert.strictEqual(prompts[0].promptRaw, "First prompt");
    assert.strictEqual(prompts[0].promptId, "uuid-first");
    assert.strictEqual(prompts[1].promptRaw, "Second prompt");
    assert.strictEqual(prompts[1].promptId, "uuid-second");
    assert.strictEqual(prompts[2].promptRaw, "Third prompt");
    assert.strictEqual(prompts[2].promptId, "uuid-third");

    const timestamps = prompts.map((p) => p.timestampMs as number);
    assert.ok(
      timestamps[0] < timestamps[1] && timestamps[1] < timestamps[2],
      "timestamps should be in ascending order"
    );
  });

  // ---------------------------------------------------------------------------
  // Test 13: responseRaw — single assistant response captured on preceding user prompt
  // ---------------------------------------------------------------------------
  it("captures a single assistant response as responseRaw on the preceding user prompt", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-resp",
        uuid: "u1",
        timestamp: "2025-06-01T10:00:00Z",
        message: { role: "user", content: "What is recursion?" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-resp",
        uuid: "a1",
        message: { role: "assistant", content: "Recursion is when a function calls itself." }
      })
    ];
    const filePath = path.join(tmpDir, "response-single.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].responseRaw, "Recursion is when a function calls itself.");
  });

  // ---------------------------------------------------------------------------
  // Test 14: responseRaw — multiple sequential assistant responses concatenated
  // ---------------------------------------------------------------------------
  it("concatenates multiple sequential assistant responses with newline in responseRaw", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-multi-resp",
        uuid: "u1",
        timestamp: "2025-06-01T10:00:00Z",
        message: { role: "user", content: "Explain closures" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-multi-resp",
        uuid: "a1",
        message: { role: "assistant", content: "A closure is a function that captures its enclosing scope." }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-multi-resp",
        uuid: "a2",
        message: { role: "assistant", content: "This allows the inner function to access outer variables." }
      })
    ];
    const filePath = path.join(tmpDir, "response-multi.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(
      prompts[0].responseRaw,
      "A closure is a function that captures its enclosing scope.\nThis allows the inner function to access outer variables."
    );
  });

  // ---------------------------------------------------------------------------
  // Test 15: responseRaw — undefined when no assistant response follows
  // ---------------------------------------------------------------------------
  it("leaves responseRaw undefined when no assistant response follows the user prompt", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-no-resp",
        uuid: "u1",
        timestamp: "2025-06-01T10:00:00Z",
        message: { role: "user", content: "What is a monad?" }
      })
    ];
    const filePath = path.join(tmpDir, "response-none.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].responseRaw, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test 16: responseRaw — empty and whitespace-only assistant responses excluded
  // ---------------------------------------------------------------------------
  it("excludes empty and whitespace-only assistant responses from responseRaw", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-empty-resp",
        uuid: "u1",
        timestamp: "2025-06-01T10:00:00Z",
        message: { role: "user", content: "Tell me about generics" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-empty-resp",
        uuid: "a1",
        message: { role: "assistant", content: "" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-empty-resp",
        uuid: "a2",
        message: { role: "assistant", content: "   \t\n  " }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-empty-resp",
        uuid: "a3",
        message: { role: "assistant", content: "Generics allow type-safe reusable code." }
      })
    ];
    const filePath = path.join(tmpDir, "response-empty.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].responseRaw, "Generics allow type-safe reusable code.");
  });

  // ---------------------------------------------------------------------------
  // Test 17: responseRaw — truncated at MAX_RESPONSE_LENGTH (50 000 chars)
  // ---------------------------------------------------------------------------
  it("truncates responseRaw at 50 000 characters", async () => {
    const longResponse = "x".repeat(60_000);
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-trunc",
        uuid: "u1",
        timestamp: "2025-06-01T10:00:00Z",
        message: { role: "user", content: "Generate a long response" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-trunc",
        uuid: "a1",
        message: { role: "assistant", content: longResponse }
      })
    ];
    const filePath = path.join(tmpDir, "response-truncate.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const prompts = await parseAllUserPrompts(filePath, "fallback-sess", noop);

    assert.strictEqual(prompts.length, 1);
    assert.ok(prompts[0].responseRaw !== undefined, "responseRaw should be defined");
    assert.strictEqual(prompts[0].responseRaw!.length, 50_000, "responseRaw should be truncated to 50000 chars");
  });
});
