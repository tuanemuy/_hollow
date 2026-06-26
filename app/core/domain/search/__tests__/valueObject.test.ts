import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { SearchErrorCode } from "../errorCode";
import {
  DateRange,
  IndexJobAttempts,
  IndexJobId,
  IndexJobLastError,
  IndexJobOp,
  SearchBody,
  SearchCursor,
  SearchDirectoryPath,
  SearchHighlightedTitle,
  SearchKeyword,
  SearchLimit,
  SearchScore,
  SearchSnippet,
  SearchTitle,
  Visibility,
} from "../valueObject";

describe("IndexJobId", () => {
  it("trims and accepts a non-empty id", () => {
    const id = IndexJobId.create("  abc-123  ");
    expect(id as unknown as string).toBe("abc-123");
  });

  it("rejects an empty / whitespace-only string", () => {
    for (const raw of ["", "   "]) {
      try {
        IndexJobId.create(raw);
        expect.fail(`expected throw for: ${JSON.stringify(raw)}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(SearchErrorCode.InvalidIndexJobId);
        }
      }
    }
  });
});

describe("Visibility", () => {
  it.each(["private", "unlisted", "public"] as const)("accepts %s", (raw) => {
    expect(Visibility.create(raw)).toBe(raw);
  });

  it("rejects unknown visibility values", () => {
    try {
      Visibility.create("draft");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.InvalidVisibility);
      }
    }
  });
});

describe("IndexJobOp", () => {
  it.each(["upsert", "delete"] as const)("accepts %s", (raw) => {
    expect(IndexJobOp.create(raw)).toBe(raw);
  });

  it("rejects unknown ops", () => {
    try {
      IndexJobOp.create("merge");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.InvalidOp);
      }
    }
  });
});

describe("SearchTitle", () => {
  it("accepts any string up to 200 characters", () => {
    const raw = "t".repeat(200);
    expect((SearchTitle.create(raw) as unknown as string).length).toBe(200);
  });

  it("rejects strings longer than 200 characters", () => {
    try {
      SearchTitle.create("t".repeat(201));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.TitleTooLong);
      }
    }
  });

  it("accepts an empty title (title is not required for index documents)", () => {
    expect(SearchTitle.create("") as unknown as string).toBe("");
  });
});

describe("SearchHighlightedTitle", () => {
  it("accepts a plain title and a marker-decorated title up to 1024 chars", () => {
    expect(SearchHighlightedTitle.create("hit") as unknown as string).toBe(
      "hit",
    );
    const marked = `<mark>${"t".repeat(1000)}</mark>`;
    expect(
      (SearchHighlightedTitle.create(marked) as unknown as string).length,
    ).toBe(marked.length);
    expect(
      (SearchHighlightedTitle.create("t".repeat(1024)) as unknown as string)
        .length,
    ).toBe(1024);
  });

  it("accepts an empty string (no-title / no-match renders nothing)", () => {
    expect(SearchHighlightedTitle.create("") as unknown as string).toBe("");
  });

  it("rejects strings longer than 1024 characters", () => {
    try {
      SearchHighlightedTitle.create("t".repeat(1025));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.HighlightedTitleTooLong);
      }
    }
  });
});

describe("SearchBody", () => {
  it("accepts strings up to the 1MiB cap", () => {
    const raw = "b".repeat(1024);
    expect((SearchBody.create(raw) as unknown as string).length).toBe(1024);
  });

  it("rejects strings larger than the cap", () => {
    try {
      SearchBody.create("b".repeat(1024 * 1024 + 1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.BodyTooLong);
      }
    }
  });
});

describe("SearchDirectoryPath", () => {
  it("accepts the empty path (root)", () => {
    expect(SearchDirectoryPath.create("") as unknown as string).toBe("");
  });

  it("requires a leading slash for non-empty paths", () => {
    try {
      SearchDirectoryPath.create("foo/bar");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.DirectoryPathInvalid);
      }
    }
  });

  it("accepts a slash-prefixed path", () => {
    expect(SearchDirectoryPath.create("/foo/bar") as unknown as string).toBe(
      "/foo/bar",
    );
  });

  it("rejects paths longer than the cap", () => {
    const raw = `/${"a".repeat(2048)}`;
    try {
      SearchDirectoryPath.create(raw);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.DirectoryPathInvalid);
      }
    }
  });
});

describe("SearchKeyword", () => {
  it("trims and accepts a 1..200 char keyword", () => {
    const k = SearchKeyword.create("  hello  ");
    expect(k as unknown as string).toBe("hello");
  });

  it("rejects whitespace-only inputs as KeywordEmpty", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      try {
        SearchKeyword.create(raw);
        expect.fail(`expected throw for ${JSON.stringify(raw)}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(SearchErrorCode.KeywordEmpty);
        }
      }
    }
  });

  it("rejects strings longer than 200 characters after trimming", () => {
    try {
      SearchKeyword.create("k".repeat(201));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.KeywordTooLong);
      }
    }
  });
});

describe("SearchLimit", () => {
  it("accepts integers in [1, 50]", () => {
    for (const n of [1, 25, 50]) {
      expect(SearchLimit.create(n) as unknown as number).toBe(n);
    }
  });

  it("rejects non-integers or out-of-range values", () => {
    for (const n of [0, -1, 51, 1.5, Number.NaN]) {
      try {
        SearchLimit.create(n);
        expect.fail(`expected throw for ${n}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(SearchErrorCode.LimitOutOfRange);
        }
      }
    }
  });
});

describe("SearchCursor", () => {
  it("accepts a non-empty bounded string", () => {
    expect(SearchCursor.create("abc") as unknown as string).toBe("abc");
  });

  it("rejects empty cursors", () => {
    try {
      SearchCursor.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.InvalidCursor);
      }
    }
  });

  it("rejects cursors longer than the cap", () => {
    try {
      SearchCursor.create("c".repeat(1025));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.InvalidCursor);
      }
    }
  });
});

describe("DateRange", () => {
  it("constructs when from <= to", () => {
    const from = new Date(0);
    const to = new Date(1);
    const range = DateRange.create({ from, to });
    expect(range.from).toBe(from);
    expect(range.to).toBe(to);
  });

  it("accepts the degenerate from === to case", () => {
    const same = new Date(0);
    const range = DateRange.create({ from: same, to: same });
    expect(range.from.getTime()).toBe(range.to.getTime());
  });

  it("rejects from > to", () => {
    try {
      DateRange.create({ from: new Date(10), to: new Date(0) });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.InvalidDateRange);
      }
    }
  });
});

describe("SearchSnippet", () => {
  it("accepts strings up to 1024 chars", () => {
    expect(
      (SearchSnippet.create("s".repeat(1024)) as unknown as string).length,
    ).toBe(1024);
  });

  it("rejects longer strings", () => {
    try {
      SearchSnippet.create("s".repeat(1025));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.SnippetTooLong);
      }
    }
  });
});

describe("SearchScore", () => {
  it("accepts finite non-negative numbers, including 0", () => {
    expect(SearchScore.create(0) as unknown as number).toBe(0);
    expect(SearchScore.create(1.5) as unknown as number).toBe(1.5);
  });

  it("rejects negatives, NaN, and ±Infinity", () => {
    for (const n of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        SearchScore.create(n);
        expect.fail(`expected throw for ${n}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(SearchErrorCode.InvalidScore);
        }
      }
    }
  });
});

describe("IndexJobAttempts", () => {
  it("zero() yields 0 and next() advances by 1", () => {
    const a0 = IndexJobAttempts.zero();
    expect(a0 as unknown as number).toBe(0);
    const a1 = IndexJobAttempts.next(a0);
    expect(a1 as unknown as number).toBe(1);
    const a2 = IndexJobAttempts.next(a1);
    expect(a2 as unknown as number).toBe(2);
  });

  it("create accepts non-negative integers, rejects negatives / non-integers", () => {
    expect(IndexJobAttempts.create(7) as unknown as number).toBe(7);
    for (const bad of [-1, 1.5, Number.NaN]) {
      try {
        IndexJobAttempts.create(bad);
        expect.fail(`expected throw for ${bad}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(SearchErrorCode.InvalidAttempts);
        }
      }
    }
  });
});

describe("IndexJobLastError", () => {
  it("accepts short strings verbatim", () => {
    expect(IndexJobLastError.create("boom") as unknown as string).toBe("boom");
  });

  // Truncating (rather than throwing) is the documented contract — re-throwing
  // would just bounce the row back through another retry that fails the same way.
  it("truncates inputs longer than the cap to the cap length", () => {
    const raw = "e".repeat(5000);
    const out = IndexJobLastError.create(raw) as unknown as string;
    expect(out.length).toBe(4096);
  });
});
