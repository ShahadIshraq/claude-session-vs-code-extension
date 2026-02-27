import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { parseTranscriptFile } from "../../discovery/parseSession";
import { matchWorkspace, matchWorkspacePrecomputed, precomputeWorkspacePaths } from "../../discovery";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/");

function makeFolder(fsPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(fsPath),
    name: path.basename(fsPath),
    index: 0
  };
}

const noop = () => {};

describe("parseTranscriptFile", () => {
  it("parses simple-session.jsonl and returns sessionId, cwd, and first displayable prompt", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "simple-session.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-simple-001");
    assert.strictEqual(result.cwd, "/home/user/project");
    assert.strictEqual(result.titleSourceRaw, "Hello Claude, help me fix the bug");
  });

  it("parses renamed-session.jsonl and returns rename title as titleSourceRaw", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "renamed-session.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-renamed-001");
    assert.strictEqual(result.titleSourceRaw, "My Renamed Session");
  });

  it("parses custom-title-session.jsonl and returns custom title as titleSourceRaw", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "custom-title-session.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-custom-001");
    assert.strictEqual(result.titleSourceRaw, "My Custom Title");
  });

  it("parses agent-name-session.jsonl and returns agent name as titleSourceRaw", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "agent-name-session.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-agent-001");
    assert.strictEqual(result.titleSourceRaw, "Test Runner Agent");
  });

  it("returns null for an empty file", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "empty.jsonl"), noop);
    assert.strictEqual(result, null);
  });

  it("skips malformed JSON lines and returns parsed data from valid lines", async () => {
    const logs: string[] = [];
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "malformed.jsonl"), (msg) => logs.push(msg));
    assert.ok(result !== null, "result should not be null when valid lines are present");
    assert.strictEqual(result.sessionId, "sess-malformed-001");
    assert.strictEqual(result.cwd, "/home/user/project");
    assert.ok(logs.length > 0, "malformed lines should produce log messages");
    assert.ok(
      logs.every((msg) => msg.includes("[discovery] malformed JSON")),
      "log messages should mention malformed JSON"
    );
  });

  it("returns null when no sessionId or cwd is present", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "no-identity.jsonl"), noop);
    assert.strictEqual(result, null);
  });

  it("falls back to firstUserRaw when all user prompts are non-displayable commands", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "command-only-prompts.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-commands-001");
    assert.ok(
      result.titleSourceRaw.includes("<command-name>"),
      "titleSourceRaw should be the first user message (a non-displayable command)"
    );
  });

  it("returns null for a file containing only whitespace lines", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "whitespace-only.jsonl"), noop);
    assert.strictEqual(result, null);
  });

  it("uses the latest explicit title when multiple title sources are present", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "all-title-sources.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-titles-001");
    assert.strictEqual(result.titleSourceRaw, "Final Renamed Title");
  });

  it("picks the first sessionId encountered in a file with multiple session records", async () => {
    const result = await parseTranscriptFile(path.join(FIXTURES_DIR, "multi-session.jsonl"), noop);
    assert.ok(result !== null);
    assert.strictEqual(result.sessionId, "sess-multi-first");
    assert.strictEqual(result.cwd, "/home/user/project-a");
  });
});

describe("matchWorkspace", () => {
  it("returns the folder that contains the session cwd", () => {
    const folders = [makeFolder("/workspace/project-a"), makeFolder("/workspace/project-b")];
    const result = matchWorkspace("/workspace/project-a/subdir", folders);
    assert.strictEqual(result?.uri.fsPath, folders[0].uri.fsPath);
  });

  it("returns undefined when no folder matches", () => {
    const folders = [makeFolder("/workspace/project-a")];
    const result = matchWorkspace("/other/path", folders);
    assert.strictEqual(result, undefined);
  });

  it("prefers the deepest matching folder", () => {
    const parent = makeFolder("/workspace");
    const child = makeFolder("/workspace/nested");
    const folders = [parent, child];
    const result = matchWorkspace("/workspace/nested/sub", folders);
    assert.strictEqual(result?.uri.fsPath, child.uri.fsPath);
  });

  it("matches when cwd equals folder path exactly", () => {
    const folder = makeFolder("/workspace/project");
    const result = matchWorkspace("/workspace/project", [folder]);
    assert.strictEqual(result?.uri.fsPath, folder.uri.fsPath);
  });
});

describe("precomputeWorkspacePaths", () => {
  it("returns entries sorted by normalized path length descending", () => {
    const short = makeFolder("/workspace");
    const long = makeFolder("/workspace/nested/deep");
    const medium = makeFolder("/workspace/nested");
    const precomputed = precomputeWorkspacePaths([short, long, medium]);

    assert.strictEqual(precomputed.length, 3);
    assert.ok(
      precomputed[0].normalizedPath.length >= precomputed[1].normalizedPath.length,
      "first entry should have the longest path"
    );
    assert.ok(
      precomputed[1].normalizedPath.length >= precomputed[2].normalizedPath.length,
      "second entry should have a path no longer than the first"
    );
    assert.strictEqual(precomputed[0].folder.uri.fsPath, long.uri.fsPath);
    assert.strictEqual(precomputed[2].folder.uri.fsPath, short.uri.fsPath);
  });

  it("handles an empty array input", () => {
    const precomputed = precomputeWorkspacePaths([]);
    assert.deepStrictEqual(precomputed, []);
  });
});

describe("matchWorkspacePrecomputed", () => {
  it("returns the deepest matching folder from precomputed list", () => {
    const parent = makeFolder("/workspace");
    const child = makeFolder("/workspace/project");
    const precomputed = precomputeWorkspacePaths([parent, child]);
    const result = matchWorkspacePrecomputed("/workspace/project/src", precomputed);
    assert.strictEqual(result?.uri.fsPath, child.uri.fsPath);
  });

  it("returns undefined when no folder matches", () => {
    const folder = makeFolder("/workspace/project");
    const precomputed = precomputeWorkspacePaths([folder]);
    const result = matchWorkspacePrecomputed("/unrelated/path", precomputed);
    assert.strictEqual(result, undefined);
  });
});
