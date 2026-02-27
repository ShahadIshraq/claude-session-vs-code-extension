import * as assert from "assert";
import * as path from "path";
import { buildTitle, extractText, isDisplayableUserPrompt, isPathWithin } from "../../discovery";

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
});
