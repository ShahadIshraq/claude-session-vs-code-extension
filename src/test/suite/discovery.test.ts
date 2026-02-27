import * as assert from "assert";
import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  buildTitle,
  chooseSessionTitleRaw,
  extractText,
  isDisplayableUserPrompt,
  isPathWithin,
  matchWorkspace,
  parseAllUserPrompts,
  parseRenameCommandArgs,
  parseRenameStdoutTitle
} from "../../discovery";

describe("discovery helpers", () => {
  it("extractText handles string content", () => {
    assert.strictEqual(extractText("hello"), "hello");
  });

  it("extractText handles content arrays", () => {
    const content = [{ type: "text", text: "line 1" }, { type: "text", text: "line 2" }];
    assert.strictEqual(extractText(content), "line 1\nline 2");
  });

  it("buildTitle uses sanitized first line", () => {
    const title = buildTitle("<command-message>run checks</command-message>\nnext", "12345678-aaaa-bbbb-cccc-1234567890ab");
    assert.strictEqual(title, "run checks");
  });

  it("buildTitle truncates long titles", () => {
    const raw = "x".repeat(120);
    const title = buildTitle(raw, "12345678-aaaa-bbbb-cccc-1234567890ab");
    assert.strictEqual(title.length, 80);
    assert.ok(title.endsWith("..."));
  });

  it("isPathWithin matches root and descendants", () => {
    const root = path.join("/tmp", "repo");
    assert.strictEqual(isPathWithin(root, root), true);
    assert.strictEqual(isPathWithin(path.join(root, "subdir"), root), true);
    assert.strictEqual(isPathWithin(path.join("/tmp", "other"), root), false);
  });

  it("filters command wrapper prompts from display", () => {
    assert.strictEqual(isDisplayableUserPrompt("<local-command-caveat>ignore</local-command-caveat>"), false);
    assert.strictEqual(isDisplayableUserPrompt("<command-name>/model</command-name>"), false);
    assert.strictEqual(isDisplayableUserPrompt("agentId: abc123"), false);
    assert.strictEqual(isDisplayableUserPrompt("Implement this feature in phases"), true);
  });

  it("extracts /rename command args", () => {
    const title = parseRenameCommandArgs(
      "<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args>My Session Name</command-args>"
    );
    assert.strictEqual(title, "My Session Name");
  });

  it("extracts generated rename title from command stdout", () => {
    const title = parseRenameStdoutTitle(
      "<local-command-stdout>Session and agent renamed to: auto-generated-session-name</local-command-stdout>"
    );
    assert.strictEqual(title, "auto-generated-session-name");
  });

  it("ignores empty /rename args", () => {
    const title = parseRenameCommandArgs(
      "<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args></command-args>"
    );
    assert.strictEqual(title, undefined);
  });

  it("prefers latest explicit title over first prompt fallback", () => {
    const chosen = chooseSessionTitleRaw({
      latestExplicitTitle: "Renamed Session",
      firstPromptRaw: "Implement the following plan",
      firstUserRaw: "Implement the following plan"
    });
    assert.strictEqual(chosen, "Renamed Session");
  });

  it("falls back to first prompt when explicit title is unavailable", () => {
    const chosen = chooseSessionTitleRaw({
      latestExplicitTitle: "",
      firstPromptRaw: "Implement the following plan",
      firstUserRaw: "Implement the following plan"
    });
    assert.strictEqual(chosen, "Implement the following plan");
  });
});

describe("matchWorkspace", () => {
  function makeFolder(fsPath: string): vscode.WorkspaceFolder {
    return {
      uri: vscode.Uri.file(fsPath),
      name: path.basename(fsPath),
      index: 0
    };
  }

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

  it("matches when cwd equals the folder path exactly", () => {
    const folder = makeFolder("/workspace/project");
    const result = matchWorkspace("/workspace/project", [folder]);
    assert.strictEqual(result?.uri.fsPath, folder.uri.fsPath);
  });
});

describe("parseAllUserPrompts", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-test-"));
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts user prompts from JSONL transcript", async () => {
    const lines = [
      JSON.stringify({ type: "system", sessionId: "sess-1", cwd: "/tmp" }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        uuid: "uuid-1",
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: "Hello Claude" }
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "Hi there" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        uuid: "uuid-2",
        timestamp: "2025-01-01T00:01:00Z",
        message: { role: "user", content: "Fix the bug" }
      })
    ];

    const filePath = path.join(tmpDir, "test-prompts.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const log = () => {};
    const prompts = await parseAllUserPrompts(filePath, "sess-1", log);

    assert.strictEqual(prompts.length, 2);
    assert.strictEqual(prompts[0].promptId, "uuid-1");
    assert.strictEqual(prompts[0].promptRaw, "Hello Claude");
    assert.strictEqual(prompts[0].timestampMs, Date.parse("2025-01-01T00:00:00Z"));
    assert.strictEqual(prompts[1].promptId, "uuid-2");
    assert.strictEqual(prompts[1].promptRaw, "Fix the bug");
  });

  it("filters non-displayable prompts", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-2",
        uuid: "uuid-a",
        message: { role: "user", content: "<command-name>/model</command-name>" }
      }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-2",
        uuid: "uuid-b",
        message: { role: "user", content: "Implement the feature" }
      })
    ];

    const filePath = path.join(tmpDir, "test-filter.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const log = () => {};
    const prompts = await parseAllUserPrompts(filePath, "sess-2", log);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].promptRaw, "Implement the feature");
  });

  it("uses fallback session ID when line has none", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "A prompt without session ID" }
      })
    ];

    const filePath = path.join(tmpDir, "test-fallback.jsonl");
    await fsp.writeFile(filePath, lines.join("\n"), "utf8");

    const log = () => {};
    const prompts = await parseAllUserPrompts(filePath, "fallback-id", log);

    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].sessionId, "fallback-id");
    assert.strictEqual(prompts[0].promptId, "fallback-id:0");
  });
});
