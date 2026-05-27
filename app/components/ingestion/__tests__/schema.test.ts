import { describe, expect, it } from "vitest";
import { FRONT_MATTER_JSON_MAX_BYTES } from "../../note/schema";
import { commitIngestionPreviewSchema, getIngestionJobSchema } from "../schema";

describe("commitIngestionPreviewSchema", () => {
  it("accepts the minimum payload (jobId only)", () => {
    const parsed = commitIngestionPreviewSchema.parse({ jobId: "j-1" });
    expect(parsed.jobId).toBe("j-1");
    expect(parsed.frontMatterJson).toBeUndefined();
    expect(parsed.tagNames).toBeUndefined();
  });

  it("accepts a payload with frontMatterJson", () => {
    const parsed = commitIngestionPreviewSchema.parse({
      jobId: "j-1",
      frontMatterJson: '{"a":1}',
    });
    expect(parsed.frontMatterJson).toBe('{"a":1}');
  });

  it("rejects frontMatterJson longer than the cap", () => {
    const oversize = "x".repeat(FRONT_MATTER_JSON_MAX_BYTES + 1);
    const result = commitIngestionPreviewSchema.safeParse({
      jobId: "j-1",
      frontMatterJson: oversize,
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty jobId", () => {
    const result = commitIngestionPreviewSchema.safeParse({ jobId: "" });
    expect(result.success).toBe(false);
  });

  it("trims tagNames entries and rejects empty after trim", () => {
    const result = commitIngestionPreviewSchema.safeParse({
      jobId: "j-1",
      tagNames: ["ok", "  "],
    });
    expect(result.success).toBe(false);
  });
});

describe("getIngestionJobSchema", () => {
  it("accepts a non-empty jobId", () => {
    const parsed = getIngestionJobSchema.parse({ jobId: "j-1" });
    expect(parsed.jobId).toBe("j-1");
  });

  it("rejects an empty jobId", () => {
    const result = getIngestionJobSchema.safeParse({ jobId: "" });
    expect(result.success).toBe(false);
  });
});
