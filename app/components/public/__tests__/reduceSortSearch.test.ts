import { describe, expect, it } from "vitest";
import { reduceSortSearch } from "../SearchSortToggle";

describe("reduceSortSearch", () => {
  it("newest へ切替で sort=newest を書き、cursor をリセットする", () => {
    const result = reduceSortSearch({ q: "design", cursor: "20" }, "newest");

    expect(result.sort).toBe("newest");
    expect(result.cursor).toBeUndefined();
  });

  it("relevance へ戻すと sort も cursor も undefined になる", () => {
    const result = reduceSortSearch(
      { q: "design", sort: "newest", cursor: "20" },
      "relevance",
    );

    expect(result.sort).toBeUndefined();
    expect(result.cursor).toBeUndefined();
  });

  it("他のパラメータ（q / username / tags / period / limit）を保持する", () => {
    const prev = {
      q: "design",
      username: "alice",
      tags: ["css", "ui"],
      period: "1m",
      limit: 10,
      cursor: "30",
    };

    const result = reduceSortSearch(prev, "newest");

    expect(result).toEqual({
      q: "design",
      username: "alice",
      tags: ["css", "ui"],
      period: "1m",
      limit: 10,
      cursor: undefined,
      sort: "newest",
    });
  });

  it("入力オブジェクトを変更しない", () => {
    const prev = { q: "design", cursor: "20" };
    reduceSortSearch(prev, "newest");

    expect(prev).toEqual({ q: "design", cursor: "20" });
  });
});
