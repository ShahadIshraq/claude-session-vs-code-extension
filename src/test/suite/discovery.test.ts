import * as assert from "assert";
import * as path from "path";
import {
  buildTitle,
  chooseSessionTitleRaw,
  extractText,
  isDisplayableUserPrompt,
  isPathWithin,
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
