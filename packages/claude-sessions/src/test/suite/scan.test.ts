import * as assert from "assert";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { collectTranscriptFiles, exists } from "../../discovery/scan";

describe("collectTranscriptFiles", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-scan-test-"));
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns .jsonl files from a flat directory", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "flat-"));
    await fsp.writeFile(path.join(dir, "session-a.jsonl"), "");
    await fsp.writeFile(path.join(dir, "session-b.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 2);
    assert.ok(result.includes(path.join(dir, "session-a.jsonl")));
    assert.ok(result.includes(path.join(dir, "session-b.jsonl")));
  });

  it("returns .jsonl files from nested subdirectories", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "nested-"));
    const sub = path.join(dir, "projects");
    await fsp.mkdir(sub);
    await fsp.writeFile(path.join(dir, "root.jsonl"), "");
    await fsp.writeFile(path.join(sub, "child.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 2);
    assert.ok(result.includes(path.join(dir, "root.jsonl")));
    assert.ok(result.includes(path.join(sub, "child.jsonl")));
  });

  it("skips subagents/ directories entirely", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "subagents-"));
    const subagentsDir = path.join(dir, "subagents");
    await fsp.mkdir(subagentsDir);
    await fsp.writeFile(path.join(dir, "session.jsonl"), "");
    await fsp.writeFile(path.join(subagentsDir, "agent-task.jsonl"), "");
    await fsp.writeFile(path.join(subagentsDir, "other.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 1);
    assert.ok(result.includes(path.join(dir, "session.jsonl")));
    assert.ok(!result.some((p) => p.startsWith(subagentsDir)));
  });

  it("skips files starting with agent-", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "agent-prefix-"));
    await fsp.writeFile(path.join(dir, "session.jsonl"), "");
    await fsp.writeFile(path.join(dir, "agent-task.jsonl"), "");
    await fsp.writeFile(path.join(dir, "agent-123.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 1);
    assert.ok(result.includes(path.join(dir, "session.jsonl")));
  });

  it("skips non-.jsonl files (.json, .txt, .log)", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "extensions-"));
    await fsp.writeFile(path.join(dir, "session.jsonl"), "");
    await fsp.writeFile(path.join(dir, "data.json"), "");
    await fsp.writeFile(path.join(dir, "notes.txt"), "");
    await fsp.writeFile(path.join(dir, "output.log"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 1);
    assert.ok(result.includes(path.join(dir, "session.jsonl")));
  });

  it("returns empty array for empty directory", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "empty-"));

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.deepStrictEqual(result, []);
  });

  it("returns empty array for nonexistent directory and logs error", async () => {
    const nonexistent = path.join(tmpDir, "does-not-exist-xyz");
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const result = await collectTranscriptFiles(nonexistent, log);

    assert.deepStrictEqual(result, []);
    assert.strictEqual(messages.length, 1);
    assert.ok(messages[0].includes("[discovery] readdir failed for"));
    assert.ok(messages[0].includes(nonexistent));
  });

  it("handles mix of valid and skipped entries in one scan", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "mixed-"));
    const sub = path.join(dir, "subagents");
    await fsp.mkdir(sub);
    await fsp.writeFile(path.join(dir, "valid.jsonl"), "");
    await fsp.writeFile(path.join(dir, "agent-skip.jsonl"), "");
    await fsp.writeFile(path.join(dir, "skip.txt"), "");
    await fsp.writeFile(path.join(dir, "skip.json"), "");
    await fsp.writeFile(path.join(sub, "in-subagents.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 1);
    assert.ok(result.includes(path.join(dir, "valid.jsonl")));
  });

  it("handles deeply nested directory structures (3+ levels)", async () => {
    const dir = await fsp.mkdtemp(path.join(tmpDir, "deep-"));
    const level1 = path.join(dir, "level1");
    const level2 = path.join(level1, "level2");
    const level3 = path.join(level2, "level3");
    await fsp.mkdir(level1);
    await fsp.mkdir(level2);
    await fsp.mkdir(level3);
    await fsp.writeFile(path.join(dir, "root.jsonl"), "");
    await fsp.writeFile(path.join(level1, "l1.jsonl"), "");
    await fsp.writeFile(path.join(level2, "l2.jsonl"), "");
    await fsp.writeFile(path.join(level3, "l3.jsonl"), "");

    const log = () => {};
    const result = await collectTranscriptFiles(dir, log);

    assert.strictEqual(result.length, 4);
    assert.ok(result.includes(path.join(dir, "root.jsonl")));
    assert.ok(result.includes(path.join(level1, "l1.jsonl")));
    assert.ok(result.includes(path.join(level2, "l2.jsonl")));
    assert.ok(result.includes(path.join(level3, "l3.jsonl")));
  });
});

describe("exists", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-exists-test-"));
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns true for an existing readable file", async () => {
    const filePath = path.join(tmpDir, "readable.txt");
    await fsp.writeFile(filePath, "content");

    const result = await exists(filePath);

    assert.strictEqual(result, true);
  });

  it("returns true for an existing readable directory", async () => {
    const dirPath = path.join(tmpDir, "readable-dir");
    await fsp.mkdir(dirPath);

    const result = await exists(dirPath);

    assert.strictEqual(result, true);
  });

  it("returns false for a nonexistent path", async () => {
    const missingPath = path.join(tmpDir, "does-not-exist.txt");

    const result = await exists(missingPath);

    assert.strictEqual(result, false);
  });
});
