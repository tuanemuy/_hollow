import { describe, expect, it } from "vitest";
import { BULK_NOTE_IDS_MAX } from "@/components/note/constants";
import { bulkVisibilitySchema } from "../schema";

describe("bulkVisibilitySchema", () => {
  it("accepts exactly BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX },
      (_, i) => `n${i}`,
    );
    expect(() =>
      bulkVisibilitySchema.parse({ noteIds, nextVisibility: "public" }),
    ).not.toThrow();
  });

  it("rejects more than BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX + 1 },
      (_, i) => `n${i}`,
    );
    expect(() =>
      bulkVisibilitySchema.parse({ noteIds, nextVisibility: "public" }),
    ).toThrow();
  });

  it("rejects unknown visibility values", () => {
    expect(() =>
      bulkVisibilitySchema.parse({
        noteIds: ["n1"],
        nextVisibility: "bogus" as never,
      }),
    ).toThrow();
  });

  it("accepts each allowed visibility", () => {
    for (const v of ["private", "unlisted", "public"] as const) {
      expect(() =>
        bulkVisibilitySchema.parse({ noteIds: ["n1"], nextVisibility: v }),
      ).not.toThrow();
    }
  });
});
