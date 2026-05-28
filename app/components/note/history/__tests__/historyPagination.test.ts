import { describe, expect, it } from "vitest";
import {
  NOTE_HISTORY_DEFAULT_LIMIT,
  NOTE_HISTORY_DEFAULT_PAGE,
} from "../../schema";
import { historyNavSearch } from "../historyPagination";

describe("historyNavSearch", () => {
  // Issue #215 regression: page-navigation links must drop default-
  // equal `page` / `limit` so 1ページ目に戻ったときに URL から
  // `?page=1&limit=20` が消える。
  it("returns an empty payload when both values equal the schema defaults", () => {
    expect(
      historyNavSearch(NOTE_HISTORY_DEFAULT_PAGE, NOTE_HISTORY_DEFAULT_LIMIT),
    ).toEqual({});
  });

  it("keeps `page` when it is non-default and drops the default `limit`", () => {
    expect(historyNavSearch(2, NOTE_HISTORY_DEFAULT_LIMIT)).toEqual({
      page: 2,
    });
  });

  it("keeps `limit` when it is non-default and drops the default `page`", () => {
    expect(historyNavSearch(NOTE_HISTORY_DEFAULT_PAGE, 50)).toEqual({
      limit: 50,
    });
  });

  it("keeps both values when neither equals the schema default", () => {
    expect(historyNavSearch(3, 50)).toEqual({ page: 3, limit: 50 });
  });
});
