import * as assert from "assert";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "../../discovery/service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOutputChannel(): vscode.OutputChannel & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    name: "test",
    append: () => {},
    appendLine: (msg: string) => {
      messages.push(msg);
    },
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: () => {}
  } as unknown as vscode.OutputChannel & { messages: string[] };
}

function makeFolder(fsPath: string, index = 0): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(fsPath), name: path.basename(fsPath), index };
}

/**
 * Encode a file-system path the same way the discovery service expects bucket directories:
 * replaces path separators with dashes.
 */
function encodePathToBucketSuffix(fsPath: string): string {
  return encodeURIComponent(fsPath)
    .replace(/%2F/g, "-")
    .replace(/%3A/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Write a minimal JSONL transcript with a system line establishing cwd and sessionId,
 * then optional user and assistant messages.
 */
async function writeTranscript(
  filePath: string,
  sessionId: string,
  cwd: string,
  turns: Array<{ role: "user" | "assistant"; content: string; uuid?: string }>
): Promise<void> {
  const lines: string[] = [JSON.stringify({ type: "system", sessionId, cwd })];
  for (const turn of turns) {
    const uuid = turn.uuid ?? `${turn.role}-${String(Math.random()).slice(2, 8)}`;
    if (turn.role === "user") {
      lines.push(
        JSON.stringify({
          type: "user",
          sessionId,
          uuid,
          timestamp: "2025-08-01T10:00:00Z",
          message: { role: "user", content: turn.content }
        })
      );
    } else {
      lines.push(
        JSON.stringify({
          type: "assistant",
          sessionId,
          uuid,
          message: { role: "assistant", content: turn.content }
        })
      );
    }
  }
  await fsp.writeFile(filePath, lines.join("\n") + "\n", "utf8");
}

/**
 * Creates a project bucket directory for the given cwd and returns the bucket path.
 */
async function createBucket(projectsRoot: string, cwd: string): Promise<string> {
  const suffix = encodePathToBucketSuffix(cwd);
  const bucket = path.join(projectsRoot, `bucket-${suffix}`);
  await fsp.mkdir(bucket, { recursive: true });
  return bucket;
}

// ---------------------------------------------------------------------------
// getSearchableEntries() integration tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionDiscoveryService.getSearchableEntries()", () => {
  let tmpDir: string;
  let projectsRoot: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-searchable-"));
    projectsRoot = path.join(tmpDir, "projects");
    await fsp.mkdir(projectsRoot, { recursive: true });
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: Returns searchable entries with the correct fields
  // -------------------------------------------------------------------------
  it("returns SearchableEntry objects with correct sessionId, transcriptPath, title, cwd, updatedAt, and contentText", async () => {
    const workspaceDir = path.join(tmpDir, "ws-fields");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const transcriptPath = path.join(bucket, "sess-fields.jsonl");

    await writeTranscript(transcriptPath, "sess-fields", workspaceDir, [
      { role: "user", content: "How does binary search work?", uuid: "u-1" },
      {
        role: "assistant",
        content: "Binary search works by dividing the search interval in half repeatedly.",
        uuid: "a-1"
      }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);

    assert.ok(entries.length >= 1, "should return at least one searchable entry");

    const entry = entries.find((e) => e.sessionId === "sess-fields");
    assert.ok(entry !== undefined, "entry for sess-fields should be present");

    // Verify all required fields are present and have correct types
    assert.strictEqual(typeof entry.sessionId, "string", "sessionId should be a string");
    assert.strictEqual(entry.sessionId, "sess-fields");

    assert.strictEqual(typeof entry.transcriptPath, "string", "transcriptPath should be a string");
    assert.strictEqual(entry.transcriptPath, transcriptPath);

    assert.strictEqual(typeof entry.title, "string", "title should be a string");
    assert.ok(entry.title.length > 0, "title should not be empty");

    assert.strictEqual(typeof entry.cwd, "string", "cwd should be a string");
    assert.strictEqual(entry.cwd, workspaceDir);

    assert.strictEqual(typeof entry.updatedAt, "number", "updatedAt should be a number");
    assert.ok(entry.updatedAt > 0, "updatedAt should be a positive timestamp");

    assert.strictEqual(typeof entry.contentText, "string", "contentText should be a string");
    assert.ok(entry.contentText.length > 0, "contentText should not be empty");
  });

  // -------------------------------------------------------------------------
  // Test 2: contentText includes both user and assistant text
  // -------------------------------------------------------------------------
  it("contentText in the SearchableEntry contains text from both user prompts and assistant responses", async () => {
    const workspaceDir = path.join(tmpDir, "ws-content");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const transcriptPath = path.join(bucket, "sess-content.jsonl");

    const userQuestion = "Explain the differences between TCP and UDP protocols";
    const assistantResponse =
      "TCP is connection-oriented and guarantees delivery. UDP is connectionless and faster but unreliable.";

    await writeTranscript(transcriptPath, "sess-content", workspaceDir, [
      { role: "user", content: userQuestion, uuid: "u-tcp" },
      { role: "assistant", content: assistantResponse, uuid: "a-tcp" }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);

    const entry = entries.find((e) => e.sessionId === "sess-content");
    assert.ok(entry !== undefined, "entry for sess-content should be present");

    assert.ok(
      entry.contentText.includes("TCP and UDP protocols"),
      "contentText should include text from the user prompt"
    );
    assert.ok(
      entry.contentText.includes("connection-oriented"),
      "contentText should include text from the assistant response"
    );
    assert.ok(
      entry.contentText.includes("connectionless"),
      "contentText should include additional text from the assistant response"
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Internal user commands are excluded from contentText
  // -------------------------------------------------------------------------
  it("contentText excludes text from internal user commands (hidden prefix messages)", async () => {
    const workspaceDir = path.join(tmpDir, "ws-commands");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const transcriptPath = path.join(bucket, "sess-commands.jsonl");

    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-commands", cwd: workspaceDir }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-commands",
        uuid: "u-normal",
        timestamp: "2025-08-01T10:00:00Z",
        message: { role: "user", content: "What is polymorphism in object-oriented programming?" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-commands",
        uuid: "u-internal",
        timestamp: "2025-08-01T10:01:00Z",
        message: { role: "user", content: "<local-command-stdout>ls -la\nfoo.txt  bar.txt</local-command-stdout>" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-commands",
        uuid: "a-1",
        message: {
          role: "assistant",
          content: "Polymorphism allows objects of different types to be treated as the same base type."
        }
      })
    ];
    await fsp.writeFile(transcriptPath, lines.join("\n") + "\n", "utf8");

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);
    const entry = entries.find((e) => e.sessionId === "sess-commands");
    assert.ok(entry !== undefined, "entry for sess-commands should be present");

    assert.ok(entry.contentText.includes("polymorphism"), "contentText should include the user's visible question");
    assert.ok(
      entry.contentText.includes("Polymorphism allows objects"),
      "contentText should include the assistant's response"
    );
    assert.ok(
      !entry.contentText.includes("ls -la"),
      "contentText should NOT include output from <local-command-stdout>"
    );
    assert.ok(
      !entry.contentText.includes("foo.txt"),
      "contentText should NOT include file listing from internal command"
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Caching — second call without file changes reuses cached contentText
  // -------------------------------------------------------------------------
  it("content cache: second call to getSearchableEntries without file changes reuses cached content", async () => {
    const workspaceDir = path.join(tmpDir, "ws-cache");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const transcriptPath = path.join(bucket, "sess-cache.jsonl");

    await writeTranscript(transcriptPath, "sess-cache", workspaceDir, [
      { role: "user", content: "Tell me about memoization in dynamic programming.", uuid: "u-memo" },
      {
        role: "assistant",
        content: "Memoization is an optimization technique that stores results of expensive function calls for reuse.",
        uuid: "a-memo"
      }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    // First call — populates the content cache
    const entries1 = await svc.getSearchableEntries([folder]);
    const entry1 = entries1.find((e) => e.sessionId === "sess-cache");
    assert.ok(entry1 !== undefined, "entry should be present on first call");

    const logCountAfterFirst = channel.messages.length;

    // Second call — should use the cache; contentText should be identical
    const entries2 = await svc.getSearchableEntries([folder]);
    const entry2 = entries2.find((e) => e.sessionId === "sess-cache");
    assert.ok(entry2 !== undefined, "entry should be present on second call");

    // ContentText should be the same object or identical string value
    assert.strictEqual(
      entry2.contentText,
      entry1.contentText,
      "contentText should be identical on second call (served from cache)"
    );

    // The second call should not have logged additional parseSessionContent messages
    // (cache hit means no re-parsing, so parse-related logs should not grow)
    const logCountAfterSecond = channel.messages.length;
    assert.ok(
      logCountAfterSecond <= logCountAfterFirst + 5, // some discover-level logs may still appear
      "second call should not produce significantly more log messages than the first call"
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Cache invalidates when file mtime changes
  // -------------------------------------------------------------------------
  it("content cache: re-parses session content when the transcript file mtime changes", async () => {
    const workspaceDir = path.join(tmpDir, "ws-cache-invalidate");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const transcriptPath = path.join(bucket, "sess-invalidate.jsonl");

    await writeTranscript(transcriptPath, "sess-invalidate", workspaceDir, [
      { role: "user", content: "Original question about recursion", uuid: "u-orig" },
      { role: "assistant", content: "Recursion is when a function calls itself.", uuid: "a-orig" }
    ]);

    // Set a clearly old mtime
    const oldTime = new Date(Date.now() - 120_000);
    await fsp.utimes(transcriptPath, oldTime, oldTime);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    // First call — caches the content
    const entries1 = await svc.getSearchableEntries([folder]);
    const entry1 = entries1.find((e) => e.sessionId === "sess-invalidate");
    assert.ok(entry1 !== undefined);
    assert.ok(entry1.contentText.includes("Original question about recursion"));

    // Update the file with new content and a new mtime
    await writeTranscript(transcriptPath, "sess-invalidate", workspaceDir, [
      { role: "user", content: "Original question about recursion", uuid: "u-orig" },
      { role: "assistant", content: "Recursion is when a function calls itself.", uuid: "a-orig" },
      {
        role: "user",
        content: "What is tail call optimization?",
        uuid: "u-new"
      },
      {
        role: "assistant",
        content: "Tail call optimization eliminates the call stack growth for tail-recursive functions.",
        uuid: "a-new"
      }
    ]);
    const newTime = new Date();
    await fsp.utimes(transcriptPath, newTime, newTime);

    // Second call — should detect mtime change and re-parse
    const entries2 = await svc.getSearchableEntries([folder]);
    const entry2 = entries2.find((e) => e.sessionId === "sess-invalidate");
    assert.ok(entry2 !== undefined);
    assert.ok(
      entry2.contentText.includes("tail call optimization") || entry2.contentText.includes("tail-recursive"),
      "contentText should include the newly added content after cache invalidation"
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: Empty workspace — returns empty array
  // -------------------------------------------------------------------------
  it("returns an empty array when no matching sessions exist for the given workspace folder", async () => {
    const workspaceDir = path.join(tmpDir, "ws-empty");
    await fsp.mkdir(workspaceDir, { recursive: true });

    // No transcript files that match workspaceDir — sessions for a different workspace exist
    const otherWorkspaceDir = path.join(tmpDir, "ws-other-for-empty-test");
    await fsp.mkdir(otherWorkspaceDir, { recursive: true });
    const bucket = await createBucket(projectsRoot, otherWorkspaceDir);
    await writeTranscript(path.join(bucket, "sess-other.jsonl"), "sess-other", otherWorkspaceDir, [
      { role: "user", content: "Question for other workspace", uuid: "u-o" }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);

    // Only provide workspaceDir — sessions in otherWorkspaceDir should not appear
    const folder = makeFolder(workspaceDir);
    const entries = await svc.getSearchableEntries([folder]);

    assert.strictEqual(
      entries.length,
      0,
      "getSearchableEntries should return an empty array when no sessions match the workspace folder"
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Multiple workspaces — sessions from all workspaces are included
  // -------------------------------------------------------------------------
  it("returns searchable entries from all provided workspace folders", async () => {
    const workspace1 = path.join(tmpDir, "ws-multi-1");
    const workspace2 = path.join(tmpDir, "ws-multi-2");
    await fsp.mkdir(workspace1, { recursive: true });
    await fsp.mkdir(workspace2, { recursive: true });

    const bucket1 = await createBucket(projectsRoot, workspace1);
    const bucket2 = await createBucket(projectsRoot, workspace2);

    await writeTranscript(path.join(bucket1, "sess-m1.jsonl"), "sess-m1", workspace1, [
      {
        role: "user",
        content: "How do I configure webpack for production builds?",
        uuid: "u-m1"
      },
      {
        role: "assistant",
        content: "Set mode to production and configure optimization plugins in webpack.config.js.",
        uuid: "a-m1"
      }
    ]);

    await writeTranscript(path.join(bucket2, "sess-m2.jsonl"), "sess-m2", workspace2, [
      {
        role: "user",
        content: "What is the difference between REST and GraphQL?",
        uuid: "u-m2"
      },
      {
        role: "assistant",
        content: "REST uses fixed endpoints per resource, while GraphQL uses a single endpoint with flexible queries.",
        uuid: "a-m2"
      }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folders = [makeFolder(workspace1, 0), makeFolder(workspace2, 1)];

    const entries = await svc.getSearchableEntries(folders);

    const entryM1 = entries.find((e) => e.sessionId === "sess-m1");
    const entryM2 = entries.find((e) => e.sessionId === "sess-m2");

    assert.ok(entryM1 !== undefined, "entry from workspace1 (sess-m1) should be present");
    assert.ok(entryM2 !== undefined, "entry from workspace2 (sess-m2) should be present");

    assert.strictEqual(entryM1.cwd, workspace1, "sess-m1 entry should have cwd set to workspace1");
    assert.strictEqual(entryM2.cwd, workspace2, "sess-m2 entry should have cwd set to workspace2");

    assert.ok(entryM1.contentText.includes("webpack"), "sess-m1 contentText should contain webpack-related content");
    assert.ok(entryM2.contentText.includes("GraphQL"), "sess-m2 contentText should contain GraphQL-related content");
  });

  // -------------------------------------------------------------------------
  // Test 8: Returns entries with contentText that is searchable (case-insensitive indexOf)
  // -------------------------------------------------------------------------
  it("contentText is case-sensitively present allowing case-insensitive search via toLowerCase", async () => {
    const workspaceDir = path.join(tmpDir, "ws-search-case");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    await writeTranscript(path.join(bucket, "sess-case.jsonl"), "sess-case", workspaceDir, [
      {
        role: "user",
        content: "Explain Dependency Injection in software design.",
        uuid: "u-di"
      },
      {
        role: "assistant",
        content:
          "Dependency Injection is a design pattern where dependencies are provided to a class rather than created inside it.",
        uuid: "a-di"
      }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);
    const entry = entries.find((e) => e.sessionId === "sess-case");
    assert.ok(entry !== undefined);

    // Verify case-insensitive search works (as the search command does it)
    const lowerContent = entry.contentText.toLowerCase();
    assert.ok(
      lowerContent.indexOf("dependency injection") !== -1,
      "lowercase contentText should allow case-insensitive search for 'dependency injection'"
    );
    assert.ok(
      lowerContent.indexOf("design pattern") !== -1,
      "lowercase contentText should allow case-insensitive search for 'design pattern'"
    );
  });

  // -------------------------------------------------------------------------
  // Test 9: Returns entries including title derived from the session
  // -------------------------------------------------------------------------
  it("each SearchableEntry has a non-empty title derived from the session content", async () => {
    const workspaceDir = path.join(tmpDir, "ws-title");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);

    // Write a transcript with a clear first user message that should become the title
    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-title", cwd: workspaceDir }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-title",
        uuid: "u-title",
        timestamp: "2025-08-01T10:00:00Z",
        message: { role: "user", content: "Help me implement a binary search tree" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-title",
        uuid: "a-title",
        message: { role: "assistant", content: "Sure, let me walk you through implementing a BST." }
      })
    ];
    await fsp.writeFile(path.join(bucket, "sess-title.jsonl"), lines.join("\n") + "\n", "utf8");

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);
    const entry = entries.find((e) => e.sessionId === "sess-title");
    assert.ok(entry !== undefined);

    assert.ok(entry.title.length > 0, "title should be a non-empty string derived from session content");
    // The title is built from the first user prompt or sessionId
    assert.ok(
      entry.title.includes("binary search tree") || entry.title === "sess-title",
      `title should be derived from the first user prompt or session ID, got: "${entry.title}"`
    );
  });

  // -------------------------------------------------------------------------
  // Test 10: Does not include sessions from subagents/ directory
  // -------------------------------------------------------------------------
  it("does not return SearchableEntry objects for sessions in subagents/ subdirectory", async () => {
    const workspaceDir = path.join(tmpDir, "ws-subagent");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = await createBucket(projectsRoot, workspaceDir);
    const subagentsDir = path.join(bucket, "subagents");
    await fsp.mkdir(subagentsDir, { recursive: true });

    // Top-level session (should be included)
    await writeTranscript(path.join(bucket, "sess-top.jsonl"), "sess-top", workspaceDir, [
      { role: "user", content: "Top level session question", uuid: "u-top" }
    ]);

    // Subagent session (should be excluded)
    await writeTranscript(path.join(subagentsDir, "sess-sub.jsonl"), "sess-sub", workspaceDir, [
      { role: "user", content: "Subagent session question", uuid: "u-sub" }
    ]);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const entries = await svc.getSearchableEntries([folder]);

    assert.ok(
      entries.some((e) => e.sessionId === "sess-top"),
      "top-level session should be included in searchable entries"
    );
    assert.ok(
      !entries.some((e) => e.sessionId === "sess-sub"),
      "subagent session should NOT be included in searchable entries"
    );
  });
});
