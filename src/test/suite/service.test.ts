import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fsp } from "fs";
import * as vscode from "vscode";
import { ClaudeSessionDiscoveryService } from "../../discovery/service";
import type { SessionNode } from "../../models";

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
 * Build a minimal valid JSONL transcript string.
 * The system line establishes sessionId + cwd; subsequent lines are optional
 * additional user messages.
 */
function makeTranscript(
  sessionId: string,
  cwd: string,
  prompts: Array<{ uuid: string; content: string; timestamp?: string }> = []
): string {
  const lines: string[] = [JSON.stringify({ type: "system", sessionId, cwd })];
  for (const p of prompts) {
    lines.push(
      JSON.stringify({
        type: "user",
        sessionId,
        uuid: p.uuid,
        timestamp: p.timestamp ?? "2025-01-01T00:00:00Z",
        message: { role: "user", content: p.content }
      })
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// discover() integration tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionDiscoveryService.discover()", () => {
  let tmpDir: string;
  let projectsRoot: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-svc-discover-"));
    projectsRoot = path.join(tmpDir, "projects");
    await fsp.mkdir(projectsRoot, { recursive: true });
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Returns sessions grouped by matching workspace folder
  // -------------------------------------------------------------------------
  it("returns sessions grouped by matching workspace folder", async () => {
    const proj1 = path.join(tmpDir, "workspace", "project1");
    const proj2 = path.join(tmpDir, "workspace", "project2");
    await fsp.mkdir(proj1, { recursive: true });
    await fsp.mkdir(proj2, { recursive: true });

    const encodedProj1 = encodeURIComponent(proj1)
      .replace(/%2F/g, "-")
      .replace(/%3A/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    const encodedProj2 = encodeURIComponent(proj2)
      .replace(/%2F/g, "-")
      .replace(/%3A/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "-");

    const bucket1 = path.join(projectsRoot, `bucket-${encodedProj1}`);
    const bucket2 = path.join(projectsRoot, `bucket-${encodedProj2}`);
    await fsp.mkdir(bucket1, { recursive: true });
    await fsp.mkdir(bucket2, { recursive: true });

    await fsp.writeFile(
      path.join(bucket1, "sess-a.jsonl"),
      makeTranscript("sess-a", proj1, [{ uuid: "p1", content: "Hello from project 1" }])
    );
    await fsp.writeFile(
      path.join(bucket2, "sess-b.jsonl"),
      makeTranscript("sess-b", proj2, [{ uuid: "p2", content: "Hello from project 2" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folders = [makeFolder(proj1, 0), makeFolder(proj2, 1)];
    const result = await svc.discover(folders);

    assert.strictEqual(result.globalInfoMessage, undefined);

    const sessionsProj1 = result.sessionsByWorkspace.get(folders[0].uri.toString());
    const sessionsProj2 = result.sessionsByWorkspace.get(folders[1].uri.toString());

    assert.ok(sessionsProj1, "project1 key should exist in map");
    assert.ok(sessionsProj2, "project2 key should exist in map");
    assert.strictEqual(sessionsProj1.length, 1);
    assert.strictEqual(sessionsProj2.length, 1);
    assert.strictEqual(sessionsProj1[0].sessionId, "sess-a");
    assert.strictEqual(sessionsProj2[0].sessionId, "sess-b");
  });

  // -------------------------------------------------------------------------
  // 2. Returns empty when projectsRoot doesn't exist → globalInfoMessage set
  // -------------------------------------------------------------------------
  it("returns empty result with globalInfoMessage when projectsRoot does not exist", async () => {
    const nonExistentRoot = path.join(tmpDir, "does-not-exist");
    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, nonExistentRoot);

    const proj = path.join(tmpDir, "some-project");
    await fsp.mkdir(proj, { recursive: true });

    const result = await svc.discover([makeFolder(proj)]);

    assert.ok(
      typeof result.globalInfoMessage === "string" && result.globalInfoMessage.length > 0,
      "globalInfoMessage should be set"
    );
    const sessions = result.sessionsByWorkspace.get(makeFolder(proj).uri.toString());
    assert.ok(sessions !== undefined);
    assert.strictEqual(sessions.length, 0);
  });

  // -------------------------------------------------------------------------
  // 3. Returns empty when no workspace folders → globalInfoMessage set
  // -------------------------------------------------------------------------
  it("returns empty result with globalInfoMessage when no workspace folders are provided", async () => {
    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);

    const result = await svc.discover([]);

    assert.ok(
      typeof result.globalInfoMessage === "string" && result.globalInfoMessage.length > 0,
      "globalInfoMessage should be set when no folders"
    );
    assert.strictEqual(result.sessionsByWorkspace.size, 0);
  });

  // -------------------------------------------------------------------------
  // 4. Deduplicates sessions by sessionId, keeping the one with latest mtime
  // -------------------------------------------------------------------------
  it("deduplicates sessions by sessionId keeping the transcript with the latest mtime", async () => {
    const workspaceDir = path.join(tmpDir, "dedup-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "dedup-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const olderPath = path.join(bucket, "sess-dup-old.jsonl");
    const newerPath = path.join(bucket, "sess-dup-new.jsonl");

    await fsp.writeFile(
      olderPath,
      makeTranscript("sess-dup", workspaceDir, [{ uuid: "p-old", content: "Older transcript" }])
    );
    await fsp.writeFile(
      newerPath,
      makeTranscript("sess-dup", workspaceDir, [{ uuid: "p-new", content: "Newer transcript" }])
    );

    // Force older file to have an earlier mtime
    const oldTime = new Date(Date.now() - 60_000);
    await fsp.utimes(olderPath, oldTime, oldTime);
    const newTime = new Date();
    await fsp.utimes(newerPath, newTime, newTime);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);
    const result = await svc.discover([folder]);

    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    const dupSessions = sessions.filter((s) => s.sessionId === "sess-dup");
    assert.strictEqual(dupSessions.length, 1, "should deduplicate to a single session entry");
    assert.strictEqual(dupSessions[0].transcriptPath, newerPath, "should keep the transcript with the latest mtime");
  });

  // -------------------------------------------------------------------------
  // 5. Sorts sessions by updatedAt descending (most recent first)
  // -------------------------------------------------------------------------
  it("sorts sessions by updatedAt descending so newest appears first", async () => {
    const workspaceDir = path.join(tmpDir, "sort-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "sort-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const firstPath = path.join(bucket, "sess-first.jsonl");
    const secondPath = path.join(bucket, "sess-second.jsonl");
    const thirdPath = path.join(bucket, "sess-third.jsonl");

    await fsp.writeFile(
      firstPath,
      makeTranscript("sess-first", workspaceDir, [{ uuid: "pa", content: "First session" }])
    );
    await fsp.writeFile(
      secondPath,
      makeTranscript("sess-second", workspaceDir, [{ uuid: "pb", content: "Second session" }])
    );
    await fsp.writeFile(
      thirdPath,
      makeTranscript("sess-third", workspaceDir, [{ uuid: "pc", content: "Third session" }])
    );

    // Assign distinct mtimes: third > second > first
    const baseTime = Date.now();
    await fsp.utimes(firstPath, new Date(baseTime - 20_000), new Date(baseTime - 20_000));
    await fsp.utimes(secondPath, new Date(baseTime - 10_000), new Date(baseTime - 10_000));
    await fsp.utimes(thirdPath, new Date(baseTime), new Date(baseTime));

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);
    const result = await svc.discover([folder]);

    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    const relevant = sessions.filter((s) => ["sess-first", "sess-second", "sess-third"].includes(s.sessionId));
    assert.strictEqual(relevant.length, 3);
    assert.ok(relevant[0].updatedAt >= relevant[1].updatedAt, "first should be newer than second");
    assert.ok(relevant[1].updatedAt >= relevant[2].updatedAt, "second should be newer than third");
    assert.strictEqual(relevant[0].sessionId, "sess-third");
    assert.strictEqual(relevant[2].sessionId, "sess-first");
  });

  // -------------------------------------------------------------------------
  // 6. Ignores transcripts whose cwd doesn't match any workspace folder
  // -------------------------------------------------------------------------
  it("ignores transcripts whose cwd does not match any workspace folder", async () => {
    const workspaceDir = path.join(tmpDir, "filter-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "filter-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const matchingPath = path.join(bucket, "sess-match.jsonl");
    const nonMatchingPath = path.join(bucket, "sess-nomatch.jsonl");

    await fsp.writeFile(
      matchingPath,
      makeTranscript("sess-match", workspaceDir, [{ uuid: "pm", content: "Matching cwd" }])
    );
    await fsp.writeFile(
      nonMatchingPath,
      makeTranscript("sess-nomatch", path.join(tmpDir, "completely-different-dir"), [
        { uuid: "pn", content: "Non-matching cwd" }
      ])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);
    const result = await svc.discover([folder]);

    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions.some((s) => s.sessionId === "sess-match"),
      "matching session should be included"
    );
    assert.ok(!sessions.some((s) => s.sessionId === "sess-nomatch"), "non-matching session should be excluded");
  });

  // -------------------------------------------------------------------------
  // 7. Skips files in `subagents/` directory
  // -------------------------------------------------------------------------
  it("skips transcript files located inside a subagents/ directory", async () => {
    const workspaceDir = path.join(tmpDir, "subagents-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "subagents-bucket");
    const subagentsDir = path.join(bucket, "subagents");
    await fsp.mkdir(subagentsDir, { recursive: true });

    const topLevelPath = path.join(bucket, "sess-toplevel.jsonl");
    const subagentPath = path.join(subagentsDir, "sess-subagent.jsonl");

    await fsp.writeFile(
      topLevelPath,
      makeTranscript("sess-toplevel", workspaceDir, [{ uuid: "pt", content: "Top-level transcript" }])
    );
    await fsp.writeFile(
      subagentPath,
      makeTranscript("sess-subagent", workspaceDir, [{ uuid: "ps", content: "Subagent transcript" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);
    const result = await svc.discover([folder]);

    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions.some((s) => s.sessionId === "sess-toplevel"),
      "top-level session should be included"
    );
    assert.ok(!sessions.some((s) => s.sessionId === "sess-subagent"), "subagent session should be excluded");
  });

  // -------------------------------------------------------------------------
  // 8. Skips `agent-*.jsonl` files
  // -------------------------------------------------------------------------
  it("skips files whose name starts with agent-", async () => {
    const workspaceDir = path.join(tmpDir, "agent-file-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "agent-file-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const normalPath = path.join(bucket, "sess-normal.jsonl");
    const agentPath = path.join(bucket, "agent-abc123.jsonl");

    await fsp.writeFile(
      normalPath,
      makeTranscript("sess-normal", workspaceDir, [{ uuid: "pn", content: "Normal session" }])
    );
    await fsp.writeFile(
      agentPath,
      makeTranscript("sess-agent-file", workspaceDir, [{ uuid: "pa", content: "Agent file session" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);
    const result = await svc.discover([folder]);

    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions.some((s) => s.sessionId === "sess-normal"),
      "normal session should be included"
    );
    assert.ok(!sessions.some((s) => s.sessionId === "sess-agent-file"), "agent-prefixed file should be excluded");
  });

  // -------------------------------------------------------------------------
  // 9. Handles malformed transcript files gracefully
  // -------------------------------------------------------------------------
  it("handles malformed transcript files gracefully without throwing", async () => {
    const workspaceDir = path.join(tmpDir, "malformed-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "malformed-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const malformedPath = path.join(bucket, "malformed.jsonl");
    const goodPath = path.join(bucket, "good.jsonl");

    // File with broken JSON mixed with a valid line that still lacks sessionId/cwd
    await fsp.writeFile(malformedPath, '{not valid json}\n{"broken":\n');
    await fsp.writeFile(
      goodPath,
      makeTranscript("sess-good-malformed", workspaceDir, [{ uuid: "pg", content: "Good session" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    // Should not throw
    let result;
    try {
      result = await svc.discover([folder]);
    } catch (err) {
      assert.fail(`discover() should not throw on malformed files, but got: ${String(err)}`);
    }

    assert.ok(result);
    const sessions = result.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions.some((s) => s.sessionId === "sess-good-malformed"),
      "good session alongside malformed file should still be discovered"
    );
  });

  // -------------------------------------------------------------------------
  // 10. Session cache: second call with same mtime skips reparsing
  // -------------------------------------------------------------------------
  it("uses cached session metadata on second discover() call when mtime is unchanged", async () => {
    const workspaceDir = path.join(tmpDir, "cache-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "cache-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const transcriptPath = path.join(bucket, "sess-cache.jsonl");
    await fsp.writeFile(
      transcriptPath,
      makeTranscript("sess-cache", workspaceDir, [{ uuid: "pc", content: "Cache test" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    const result1 = await svc.discover([folder]);
    const sessions1 = result1.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions1.some((s) => s.sessionId === "sess-cache"),
      "session should appear in first call"
    );

    // Second call without touching the file - should return same results
    const result2 = await svc.discover([folder]);
    const sessions2 = result2.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions2.some((s) => s.sessionId === "sess-cache"),
      "session should appear in second call"
    );

    // Both calls should find the same session with the same data
    const s1 = sessions1.find((s) => s.sessionId === "sess-cache")!;
    const s2 = sessions2.find((s) => s.sessionId === "sess-cache")!;
    assert.strictEqual(s1.sessionId, s2.sessionId);
    assert.strictEqual(s1.cwd, s2.cwd);
    assert.strictEqual(s1.transcriptPath, s2.transcriptPath);
  });

  // -------------------------------------------------------------------------
  // 11. Session cache: pruned entries for deleted files on re-discover
  // -------------------------------------------------------------------------
  it("prunes session cache entries for files that no longer exist on subsequent discover()", async () => {
    const workspaceDir = path.join(tmpDir, "prune-workspace");
    await fsp.mkdir(workspaceDir, { recursive: true });

    const bucket = path.join(projectsRoot, "prune-bucket");
    await fsp.mkdir(bucket, { recursive: true });

    const persistentPath = path.join(bucket, "sess-persistent.jsonl");
    const ephemeralPath = path.join(bucket, "sess-ephemeral.jsonl");

    await fsp.writeFile(
      persistentPath,
      makeTranscript("sess-persistent", workspaceDir, [{ uuid: "pp", content: "Persistent" }])
    );
    await fsp.writeFile(
      ephemeralPath,
      makeTranscript("sess-ephemeral", workspaceDir, [{ uuid: "pe", content: "Ephemeral" }])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const folder = makeFolder(workspaceDir);

    // First discover - both sessions should be present
    const result1 = await svc.discover([folder]);
    const sessions1 = result1.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      sessions1.some((s) => s.sessionId === "sess-ephemeral"),
      "ephemeral session should appear initially"
    );

    // Remove the ephemeral file
    await fsp.unlink(ephemeralPath);

    // Second discover - ephemeral session should be gone
    const result2 = await svc.discover([folder]);
    const sessions2 = result2.sessionsByWorkspace.get(folder.uri.toString()) ?? [];
    assert.ok(
      !sessions2.some((s) => s.sessionId === "sess-ephemeral"),
      "ephemeral session should be absent after file deletion"
    );
    assert.ok(
      sessions2.some((s) => s.sessionId === "sess-persistent"),
      "persistent session should still be present"
    );
  });
});

// ---------------------------------------------------------------------------
// getUserPrompts() integration tests
// ---------------------------------------------------------------------------

describe("ClaudeSessionDiscoveryService.getUserPrompts()", () => {
  let tmpDir: string;
  let projectsRoot: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-svc-prompts-"));
    projectsRoot = path.join(tmpDir, "projects");
    await fsp.mkdir(projectsRoot, { recursive: true });
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  function makeSessionNode(transcriptPath: string, sessionId: string, cwd: string): SessionNode {
    return {
      kind: "session",
      sessionId,
      cwd,
      transcriptPath,
      title: "Test Session",
      updatedAt: Date.now()
    };
  }

  // -------------------------------------------------------------------------
  // 12. Returns parsed prompts for a valid session
  // -------------------------------------------------------------------------
  it("returns parsed prompts for a valid session transcript", async () => {
    const transcriptPath = path.join(tmpDir, "valid-prompts.jsonl");
    await fsp.writeFile(
      transcriptPath,
      makeTranscript("sess-valid-prompts", tmpDir, [
        { uuid: "uuid-1", content: "Fix the authentication bug", timestamp: "2025-03-01T10:00:00Z" },
        { uuid: "uuid-2", content: "Add unit tests for auth module", timestamp: "2025-03-01T10:05:00Z" }
      ])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const session = makeSessionNode(transcriptPath, "sess-valid-prompts", tmpDir);

    const prompts = await svc.getUserPrompts(session);

    assert.strictEqual(prompts.length, 2);
    assert.strictEqual(prompts[0].promptId, "uuid-1");
    assert.strictEqual(prompts[0].sessionId, "sess-valid-prompts");
    assert.strictEqual(prompts[0].promptRaw, "Fix the authentication bug");
    assert.strictEqual(prompts[0].timestampMs, Date.parse("2025-03-01T10:00:00Z"));
    assert.strictEqual(prompts[1].promptId, "uuid-2");
    assert.strictEqual(prompts[1].promptRaw, "Add unit tests for auth module");
  });

  // -------------------------------------------------------------------------
  // 13. Returns empty array when transcript file doesn't exist
  // -------------------------------------------------------------------------
  it("returns an empty array when the transcript file does not exist", async () => {
    const nonExistentPath = path.join(tmpDir, "does-not-exist.jsonl");

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const session = makeSessionNode(nonExistentPath, "sess-missing", tmpDir);

    const prompts = await svc.getUserPrompts(session);

    assert.strictEqual(prompts.length, 0);
    assert.ok(
      channel.messages.some((m) => m.includes(nonExistentPath)),
      "should log an error mentioning the missing file"
    );
  });

  // -------------------------------------------------------------------------
  // 14. Prompt cache: second call with same mtime returns cached prompts
  // -------------------------------------------------------------------------
  it("returns cached prompts on second getUserPrompts() call when file mtime is unchanged", async () => {
    const transcriptPath = path.join(tmpDir, "cached-prompts.jsonl");
    await fsp.writeFile(
      transcriptPath,
      makeTranscript("sess-prompt-cache", tmpDir, [
        { uuid: "pc-1", content: "First prompt for cache test", timestamp: "2025-04-01T09:00:00Z" }
      ])
    );

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const session = makeSessionNode(transcriptPath, "sess-prompt-cache", tmpDir);

    const prompts1 = await svc.getUserPrompts(session);
    assert.strictEqual(prompts1.length, 1);
    assert.strictEqual(prompts1[0].promptId, "pc-1");

    // Second call without modifying the file - should return the same data
    const prompts2 = await svc.getUserPrompts(session);
    assert.strictEqual(prompts2.length, 1);
    assert.strictEqual(prompts2[0].promptId, "pc-1");
    assert.strictEqual(prompts2[0].promptRaw, prompts1[0].promptRaw);
  });

  // -------------------------------------------------------------------------
  // 15. Prompt cache: returns fresh data when file mtime changes
  // -------------------------------------------------------------------------
  it("returns fresh prompts when the transcript file mtime changes between calls", async () => {
    const transcriptPath = path.join(tmpDir, "stale-cache-prompts.jsonl");
    await fsp.writeFile(
      transcriptPath,
      makeTranscript("sess-stale-cache", tmpDir, [
        { uuid: "sc-1", content: "Initial prompt content", timestamp: "2025-05-01T08:00:00Z" }
      ])
    );

    // Set an old mtime so it is clearly in the past
    const oldTime = new Date(Date.now() - 120_000);
    await fsp.utimes(transcriptPath, oldTime, oldTime);

    const channel = createMockOutputChannel();
    const svc = new ClaudeSessionDiscoveryService(channel, projectsRoot);
    const session = makeSessionNode(transcriptPath, "sess-stale-cache", tmpDir);

    // First call primes the cache
    const prompts1 = await svc.getUserPrompts(session);
    assert.strictEqual(prompts1.length, 1);
    assert.strictEqual(prompts1[0].promptRaw, "Initial prompt content");

    // Rewrite the file with different content and update the mtime
    await fsp.writeFile(
      transcriptPath,
      makeTranscript("sess-stale-cache", tmpDir, [
        { uuid: "sc-1", content: "Initial prompt content", timestamp: "2025-05-01T08:00:00Z" },
        { uuid: "sc-2", content: "New prompt added after cache prime", timestamp: "2025-05-01T08:05:00Z" }
      ])
    );
    const newTime = new Date();
    await fsp.utimes(transcriptPath, newTime, newTime);

    // Second call should detect changed mtime and re-parse
    const prompts2 = await svc.getUserPrompts(session);
    assert.strictEqual(prompts2.length, 2, "should return fresh data with the newly added prompt");
    assert.strictEqual(prompts2[1].promptId, "sc-2");
    assert.strictEqual(prompts2[1].promptRaw, "New prompt added after cache prime");
  });
});
