import * as assert from "assert";
import * as path from "path";
import { isNormalizedPathWithin, isPathWithin, normalizeFsPath } from "../../discovery/pathUtils";

describe("isPathWithin", () => {
  it("returns true when candidate equals root exactly", () => {
    const root = "/tmp/repo";
    assert.strictEqual(isPathWithin(root, root), true);
  });

  it("returns true when candidate is a descendant of root", () => {
    const root = "/tmp/repo";
    const candidate = "/tmp/repo/src/index.ts";
    assert.strictEqual(isPathWithin(candidate, root), true);
  });

  it("returns false when candidate is not within root", () => {
    const root = "/tmp/repo";
    const candidate = "/tmp/other";
    assert.strictEqual(isPathWithin(candidate, root), false);
  });

  it("returns false for paths sharing a common prefix but not at a directory boundary", () => {
    const root = "/tmp/repo";
    const candidate = "/tmp/repo-extra";
    assert.strictEqual(isPathWithin(candidate, root), false);
  });

  it("handles trailing slashes by resolving them before comparison", () => {
    // path.resolve strips trailing slashes, so these should behave identically
    // to their non-trailing-slash equivalents
    const root = "/tmp/repo/";
    const descendant = "/tmp/repo/sub/";
    const unrelated = "/tmp/repo-extra/";
    assert.strictEqual(isPathWithin(root, root), true);
    assert.strictEqual(isPathWithin(descendant, root), true);
    assert.strictEqual(isPathWithin(unrelated, root), false);
  });
});

describe("normalizeFsPath", () => {
  it("resolves relative paths to absolute paths", () => {
    const result = normalizeFsPath("some/relative/path");
    assert.ok(path.isAbsolute(result), "expected an absolute path");
    assert.ok(result.endsWith(path.join("some", "relative", "path")));
  });

  it("returns already-absolute paths unchanged on macOS", () => {
    // On macOS (non-win32) normalizeFsPath is equivalent to path.resolve,
    // which is a no-op for paths that are already resolved.
    const absolute = "/usr/local/bin";
    assert.strictEqual(normalizeFsPath(absolute), path.resolve(absolute));
  });
});

describe("isNormalizedPathWithin", () => {
  it("returns true for exact match", () => {
    const p = "/tmp/repo";
    assert.strictEqual(isNormalizedPathWithin(p, p), true);
  });

  it("returns true for a descendant path", () => {
    const root = "/tmp/repo";
    const candidate = "/tmp/repo/src/utils.ts";
    assert.strictEqual(isNormalizedPathWithin(candidate, root), true);
  });

  it("returns false for a path outside root", () => {
    const root = "/tmp/repo";
    const candidate = "/var/log";
    assert.strictEqual(isNormalizedPathWithin(candidate, root), false);
  });

  it("returns false for paths sharing a common prefix not at a directory boundary", () => {
    const root = "/tmp/repo";
    const candidate = "/tmp/repo-extra";
    assert.strictEqual(isNormalizedPathWithin(candidate, root), false);
  });
});
