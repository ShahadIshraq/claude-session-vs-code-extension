import * as assert from "assert";
import { formatAgeToken, formatRelativeTime, truncateForTreeLabel } from "../../utils/formatting";

// ---------------------------------------------------------------------------
// formatRelativeTime tests
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  it("returns 'just now' for a timestamp less than 1 minute ago", () => {
    const ts = Date.now() - 30_000; // 30 seconds ago
    assert.strictEqual(formatRelativeTime(ts), "just now");
  });
});

// ---------------------------------------------------------------------------
// formatAgeToken tests
// ---------------------------------------------------------------------------

describe("formatAgeToken", () => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  it("returns 'now' for a timestamp less than 1 minute ago", () => {
    const ts = Date.now() - 30_000;
    assert.strictEqual(formatAgeToken(ts), "now");
  });

  it("returns 'Xm ago' for a timestamp several minutes old", () => {
    const ts = Date.now() - 5 * minute;
    assert.strictEqual(formatAgeToken(ts), "5m ago");
  });

  it("returns 'Xh ago' for a timestamp several hours old", () => {
    const ts = Date.now() - 3 * hour;
    assert.strictEqual(formatAgeToken(ts), "3h ago");
  });

  it("returns 'Xd ago' for a timestamp several days old", () => {
    const ts = Date.now() - 4 * day;
    assert.strictEqual(formatAgeToken(ts), "4d ago");
  });

  it("returns 'Xw ago' for a timestamp several weeks old", () => {
    const ts = Date.now() - 2 * week;
    assert.strictEqual(formatAgeToken(ts), "2w ago");
  });

  it("returns 'Xmo ago' for a timestamp several months old", () => {
    const ts = Date.now() - 3 * month;
    assert.strictEqual(formatAgeToken(ts), "3mo ago");
  });

  it("returns 'Xy ago' for a timestamp about one year old", () => {
    const ts = Date.now() - year;
    assert.strictEqual(formatAgeToken(ts), "1y ago");
  });
});

// ---------------------------------------------------------------------------
// truncateForTreeLabel tests
// ---------------------------------------------------------------------------

describe("truncateForTreeLabel", () => {
  it("preserves short strings unchanged", () => {
    assert.strictEqual(truncateForTreeLabel("short text", 20), "short text");
  });

  it("truncates with '...' for strings over maxLength", () => {
    const result = truncateForTreeLabel("This is a long string that should be truncated", 20);
    assert.strictEqual(result.length, 20);
    assert.ok(result.endsWith("..."));
  });

  it("collapses internal whitespace into single spaces", () => {
    const result = truncateForTreeLabel("hello   world\t\nnext", 50);
    assert.strictEqual(result, "hello world next");
  });

  it("handles an empty string without throwing", () => {
    assert.strictEqual(truncateForTreeLabel("", 10), "");
  });

  it("does not truncate a string that is exactly at maxLength", () => {
    const value = "exactly20characters!"; // 20 chars
    assert.strictEqual(value.length, 20);
    assert.strictEqual(truncateForTreeLabel(value, 20), value);
  });
});
