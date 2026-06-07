import { describe, expect, it } from "vitest";
import type { SavedViewDTO } from "@/core/application/dto/view";
import {
  dateRangeChipLabel,
  directoryChipLabel,
  sortChipLabel,
  visibilityChipLabel,
} from "../styles";

describe("sortChipLabel", () => {
  const cases: Array<[SavedViewDTO["sort"], string]> = [
    [{ by: "updatedAt", direction: "desc" }, "ソート: 更新降順"],
    [{ by: "updatedAt", direction: "asc" }, "ソート: 更新昇順"],
    [{ by: "createdAt", direction: "desc" }, "ソート: 作成降順"],
    [{ by: "createdAt", direction: "asc" }, "ソート: 作成昇順"],
    [{ by: "title", direction: "desc" }, "ソート: タイトル降順"],
    [{ by: "title", direction: "asc" }, "ソート: タイトル昇順"],
  ];

  for (const [sort, expected] of cases) {
    it(`${sort.by}/${sort.direction} -> ${expected}`, () => {
      expect(sortChipLabel(sort)).toBe(expected);
    });
  }
});

describe("visibilityChipLabel", () => {
  it("returns null for an empty filter (no chip)", () => {
    expect(visibilityChipLabel([])).toBeNull();
  });

  it("renders a single value", () => {
    expect(visibilityChipLabel(["public"])).toBe("公開状態: 公開");
  });

  it("joins multiple values with ・", () => {
    expect(visibilityChipLabel(["public", "unlisted"])).toBe(
      "公開状態: 公開・限定公開",
    );
  });

  it("renders all three values in order", () => {
    expect(visibilityChipLabel(["private", "unlisted", "public"])).toBe(
      "公開状態: 非公開・限定公開・公開",
    );
  });
});

describe("dateRangeChipLabel", () => {
  // Fixed base date so the preset arithmetic is deterministic.
  const baseDate = new Date(2026, 5, 7); // 2026-06-07 (local)

  it("returns null when the range is null (no chip)", () => {
    expect(dateRangeChipLabel(null, baseDate)).toBeNull();
  });

  it("matches a preset (過去30日) when bounds align with last30", () => {
    // last30 = baseDate − 29 days .. baseDate = 2026-05-09 .. 2026-06-07
    expect(
      dateRangeChipLabel({ from: "2026-05-09", to: "2026-06-07" }, baseDate),
    ).toBe("更新: 過去30日");
  });

  it("falls back to compact M/D–M/D when no preset matches", () => {
    expect(
      dateRangeChipLabel({ from: "2026-03-01", to: "2026-03-15" }, baseDate),
    ).toBe("更新: 3/1–3/15");
  });

  it("renders an open-ended range when only `from` is set", () => {
    expect(dateRangeChipLabel({ from: "2026-03-01", to: null }, baseDate)).toBe(
      "更新: 3/1–…",
    );
  });

  it("renders an open-ended range when only `to` is set", () => {
    expect(dateRangeChipLabel({ from: null, to: "2026-03-15" }, baseDate)).toBe(
      "更新: …–3/15",
    );
  });

  it("returns null when both bounds are null", () => {
    expect(dateRangeChipLabel({ from: null, to: null }, baseDate)).toBeNull();
  });

  it("slices ISO datetimes to date-only before formatting", () => {
    expect(
      dateRangeChipLabel(
        { from: "2026-03-01T12:34:56.000Z", to: "2026-03-15T00:00:00.000Z" },
        baseDate,
      ),
    ).toBe("更新: 3/1–3/15");
  });
});

describe("directoryChipLabel", () => {
  it("returns null when no directory is pinned", () => {
    expect(directoryChipLabel(null, () => undefined)).toBeNull();
  });

  it("renders the resolved path on success", () => {
    expect(directoryChipLabel("dir-1", (id) => `仕事/${id}`)).toBe(
      "ディレクトリ: 仕事/dir-1",
    );
  });

  it("falls back to the generic label when the id cannot be resolved", () => {
    expect(directoryChipLabel("dir-x", () => undefined)).toBe("ディレクトリ");
  });
});
