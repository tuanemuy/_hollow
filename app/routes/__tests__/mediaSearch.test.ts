import { describe, expect, it } from "vitest";
import { validateMediaSearch } from "@/components/media/mediaSearch";

/**
 * Issue #452: the note-detail "ダウンロード" link renders
 * `/media/<id>?download=1`. TanStack Router's default search parser
 * JSON-parses values, so the bare `1` arrives as the number `1` (not the
 * string "1"). The route schema must accept the boolean, string, and
 * number forms; a regression here surfaces as an HTTP 500 on download.
 */

describe("validateMediaSearch", () => {
  it("treats a bare numeric `download=1` (TanStack JSON parse) as download", () => {
    expect(validateMediaSearch({ download: 1 })).toEqual({ download: true });
  });

  it("treats numeric `download=0` as inline", () => {
    expect(validateMediaSearch({ download: 0 })).toEqual({ download: false });
  });

  it('accepts the string `download="1"` form as download', () => {
    expect(validateMediaSearch({ download: "1" })).toEqual({ download: true });
  });

  it("accepts the boolean `download=true` form as download", () => {
    expect(validateMediaSearch({ download: true })).toEqual({ download: true });
  });

  it("defaults to inline (undefined) when `download` is absent", () => {
    expect(validateMediaSearch({})).toEqual({ download: false });
  });
});
