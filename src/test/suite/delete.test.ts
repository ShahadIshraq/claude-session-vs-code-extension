import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fsp } from "fs";
import { deleteSession } from "../../delete";

describe("deleteSession", () => {
  let base: string;
  const sessionId = "abc123session";

  beforeEach(async () => {
    base = await fsp.mkdtemp(path.join(os.tmpdir(), "delete-test-"));
  });

  afterEach(async () => {
    await fsp.rm(base, { recursive: true, force: true });
  });

  it("deletes the transcript file", async () => {
    const projectsDir = path.join(base, "projects", "-testproj");
    await fsp.mkdir(projectsDir, { recursive: true });
    const transcriptPath = path.join(projectsDir, `${sessionId}.jsonl`);
    await fsp.writeFile(transcriptPath, "", "utf8");

    const result = await deleteSession(transcriptPath, sessionId);

    assert.strictEqual(result.success, true);
    assert.ok(result.deletedPaths.includes(transcriptPath));
    await assert.rejects(() => fsp.stat(transcriptPath), { code: "ENOENT" });
  });

  it("returns success with empty deletedPaths for nonexistent session", async () => {
    const transcriptPath = path.join(base, "projects", "-testproj", `${sessionId}.jsonl`);

    const result = await deleteSession(transcriptPath, sessionId);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.deletedPaths, []);
  });

  it("cleans up associated data directories", async () => {
    const projectsDir = path.join(base, "projects", "-testproj");
    await fsp.mkdir(projectsDir, { recursive: true });
    const transcriptPath = path.join(projectsDir, `${sessionId}.jsonl`);
    await fsp.writeFile(transcriptPath, "", "utf8");

    const subagentDir = path.join(projectsDir, sessionId);
    await fsp.mkdir(subagentDir, { recursive: true });

    const sessionEnvDir = path.join(base, "session-env", sessionId);
    await fsp.mkdir(sessionEnvDir, { recursive: true });

    const fileHistoryDir = path.join(base, "file-history", sessionId);
    await fsp.mkdir(fileHistoryDir, { recursive: true });

    const debugDir = path.join(base, "debug");
    await fsp.mkdir(debugDir, { recursive: true });
    const debugFile = path.join(debugDir, `${sessionId}.txt`);
    await fsp.writeFile(debugFile, "", "utf8");

    const tasksDir = path.join(base, "tasks", sessionId);
    await fsp.mkdir(tasksDir, { recursive: true });

    const result = await deleteSession(transcriptPath, sessionId);

    assert.strictEqual(result.success, true);
    assert.ok(result.deletedPaths.includes(transcriptPath));
    assert.ok(result.deletedPaths.includes(subagentDir));
    assert.ok(result.deletedPaths.includes(sessionEnvDir));
    assert.ok(result.deletedPaths.includes(fileHistoryDir));
    assert.ok(result.deletedPaths.includes(debugFile));
    assert.ok(result.deletedPaths.includes(tasksDir));
    assert.strictEqual(result.deletedPaths.length, 6);

    await assert.rejects(() => fsp.stat(transcriptPath), { code: "ENOENT" });
    await assert.rejects(() => fsp.stat(subagentDir), { code: "ENOENT" });
    await assert.rejects(() => fsp.stat(sessionEnvDir), { code: "ENOENT" });
    await assert.rejects(() => fsp.stat(fileHistoryDir), { code: "ENOENT" });
    await assert.rejects(() => fsp.stat(debugFile), { code: "ENOENT" });
    await assert.rejects(() => fsp.stat(tasksDir), { code: "ENOENT" });
  });

  it("handles mixed existing and non-existing targets gracefully", async () => {
    const projectsDir = path.join(base, "projects", "-testproj");
    await fsp.mkdir(projectsDir, { recursive: true });
    const transcriptPath = path.join(projectsDir, `${sessionId}.jsonl`);
    await fsp.writeFile(transcriptPath, "", "utf8");

    const debugDir = path.join(base, "debug");
    await fsp.mkdir(debugDir, { recursive: true });
    const debugFile = path.join(debugDir, `${sessionId}.txt`);
    await fsp.writeFile(debugFile, "", "utf8");

    const result = await deleteSession(transcriptPath, sessionId);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.deletedPaths.length, 2);
    assert.ok(result.deletedPaths.includes(transcriptPath));
    assert.ok(result.deletedPaths.includes(debugFile));
  });
});
