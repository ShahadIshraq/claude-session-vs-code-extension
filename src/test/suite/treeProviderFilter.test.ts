import * as assert from "assert";
import { findHighlightRanges } from "../../utils/formatting";

describe("findHighlightRanges", () => {
  it("returns correct ranges for a single match", () => {
    const ranges = findHighlightRanges("Set up authentication flow", "auth");
    assert.deepStrictEqual(ranges, [[7, 11]]);
  });

  it("returns multiple ranges for repeated occurrences", () => {
    const ranges = findHighlightRanges("foo bar foo baz foo", "foo");
    assert.deepStrictEqual(ranges, [
      [0, 3],
      [8, 11],
      [16, 19]
    ]);
  });

  it("matches case-insensitively", () => {
    const ranges = findHighlightRanges("Hello World", "hello");
    assert.deepStrictEqual(ranges, [[0, 5]]);
  });

  it("returns empty array when query is not found", () => {
    const ranges = findHighlightRanges("no match here", "xyz");
    assert.deepStrictEqual(ranges, []);
  });

  it("returns empty array for empty query", () => {
    const ranges = findHighlightRanges("some text", "");
    assert.deepStrictEqual(ranges, []);
  });
});
