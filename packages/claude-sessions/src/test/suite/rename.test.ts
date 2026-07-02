import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fsp } from "fs";
import { renameSession } from "../../rename";

describe("renameSession", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "rename-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("appends a custom-title record to the transcript file", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const result = await renameSession(filePath, "s1", "New Title");
    assert.strictEqual(result.success, true);

    const content = await fsp.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.type, "custom-title");
    assert.strictEqual(last.customTitle, "New Title");
    assert.strictEqual(last.sessionId, "s1");
  });

  it("trims whitespace from the title", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const result = await renameSession(filePath, "s1", "  Trimmed  ");
    assert.strictEqual(result.success, true);

    const content = await fsp.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.customTitle, "Trimmed");
  });

  it("rejects an empty title", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const result = await renameSession(filePath, "s1", "");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it("rejects a whitespace-only title", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const result = await renameSession(filePath, "s1", "   ");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it("handles a missing parent directory gracefully", async () => {
    const filePath = path.join(tmpDir, "no-such-dir", "nonexistent.jsonl");

    const result = await renameSession(filePath, "s1", "Title");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it("is safe without a trailing newline in the existing file", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    // No trailing newline
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}', "utf8");

    const result = await renameSession(filePath, "s1", "Safe Title");
    assert.strictEqual(result.success, true);

    const content = await fsp.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    assert.strictEqual(lines.length, 2);
    // Verify the system line is not corrupted
    const first = JSON.parse(lines[0]);
    assert.strictEqual(first.type, "system");
    const last = JSON.parse(lines[1]);
    assert.strictEqual(last.type, "custom-title");
    assert.strictEqual(last.customTitle, "Safe Title");
  });

  it("supports double rename (second record appended, latest wins)", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    await renameSession(filePath, "s1", "First Title");
    await renameSession(filePath, "s1", "Second Title");

    const content = await fsp.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const customTitleLines = lines.map((l) => JSON.parse(l)).filter((r: { type: string }) => r.type === "custom-title");
    assert.strictEqual(customTitleLines.length, 2);
    assert.strictEqual(customTitleLines[0].customTitle, "First Title");
    assert.strictEqual(customTitleLines[1].customTitle, "Second Title");
  });

  it("preserves original file mtime after rename", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    // Set mtime to 1 hour ago
    const pastTime = new Date(Date.now() - 3600_000);
    await fsp.utimes(filePath, pastTime, pastTime);
    const beforeStat = await fsp.stat(filePath);

    const result = await renameSession(filePath, "s1", "Renamed");
    assert.strictEqual(result.success, true);

    const afterStat = await fsp.stat(filePath);
    assert.strictEqual(afterStat.mtimeMs, beforeStat.mtimeMs);
  });

  it("preserves original atime after rename", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const pastTime = new Date(Date.now() - 7200_000);
    await fsp.utimes(filePath, pastTime, pastTime);
    const beforeStat = await fsp.stat(filePath);

    await renameSession(filePath, "s1", "Renamed");

    const afterStat = await fsp.stat(filePath);
    assert.strictEqual(afterStat.atimeMs, beforeStat.atimeMs);
  });

  it("preserves original mtime across consecutive renames", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const pastTime = new Date(Date.now() - 3600_000);
    await fsp.utimes(filePath, pastTime, pastTime);
    const originalStat = await fsp.stat(filePath);

    await renameSession(filePath, "s1", "First");
    await renameSession(filePath, "s1", "Second");
    await renameSession(filePath, "s1", "Third");

    const afterStat = await fsp.stat(filePath);
    assert.strictEqual(afterStat.mtimeMs, originalStat.mtimeMs);
  });

  it("preserves mtime while still writing correct content", async () => {
    const filePath = path.join(tmpDir, "session.jsonl");
    await fsp.writeFile(filePath, '{"type":"system","sessionId":"s1","cwd":"/tmp"}\n', "utf8");

    const pastTime = new Date(Date.now() - 3600_000);
    await fsp.utimes(filePath, pastTime, pastTime);

    await renameSession(filePath, "s1", "Verified Title");

    // mtime preserved (allow 1ms tolerance for filesystem rounding)
    const afterStat = await fsp.stat(filePath);
    assert.ok(
      Math.abs(afterStat.mtimeMs - pastTime.getTime()) < 1,
      `mtime should be restored: got ${afterStat.mtimeMs}, expected ~${pastTime.getTime()}`
    );

    // content is still correct
    const content = await fsp.readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const last = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(last.type, "custom-title");
    assert.strictEqual(last.customTitle, "Verified Title");
  });

  it("returns error when transcript file does not exist (stat fails)", async () => {
    const filePath = path.join(tmpDir, "nonexistent.jsonl");

    const result = await renameSession(filePath, "s1", "Title");
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});
