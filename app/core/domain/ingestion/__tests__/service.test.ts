import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "../errorCode";
import { IngestionService } from "../service";
import { IngestionLimits } from "../valueObject";

describe("IngestionService.detectKind", () => {
  it("classifies HTML by MIME", () => {
    expect(IngestionService.detectKind("text/html", "x.html")).toBe("html");
    expect(
      IngestionService.detectKind("application/xhtml+xml", "x.xhtml"),
    ).toBe("html");
  });

  it("classifies Markdown variants", () => {
    expect(IngestionService.detectKind("text/markdown", "x.md")).toBe(
      "markdown",
    );
    expect(IngestionService.detectKind("text/x-markdown", "x.md")).toBe(
      "markdown",
    );
    expect(IngestionService.detectKind("application/markdown", "x.md")).toBe(
      "markdown",
    );
  });

  it("classifies plain text", () => {
    expect(IngestionService.detectKind("text/plain", "notes.txt")).toBe(
      "plain",
    );
  });

  it("classifies PDFs as pdfTextual (optimistic; downgraded at extraction)", () => {
    expect(IngestionService.detectKind("application/pdf", "x.pdf")).toBe(
      "pdfTextual",
    );
  });

  it("classifies office formats (docx, xlsx, pptx, legacy)", () => {
    expect(
      IngestionService.detectKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x.docx",
      ),
    ).toBe("office");
    expect(IngestionService.detectKind("application/msword", "x.doc")).toBe(
      "office",
    );
    expect(
      IngestionService.detectKind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x.xlsx",
      ),
    ).toBe("office");
    expect(
      IngestionService.detectKind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "x.pptx",
      ),
    ).toBe("office");
    expect(IngestionService.detectKind("application/rtf", "x.rtf")).toBe(
      "office",
    );
  });

  it("classifies images and audio by MIME prefix", () => {
    expect(IngestionService.detectKind("image/png", "x.png")).toBe("image");
    expect(IngestionService.detectKind("image/webp", "x.webp")).toBe("image");
    expect(IngestionService.detectKind("audio/mpeg", "x.mp3")).toBe("audio");
    expect(IngestionService.detectKind("audio/wav", "x.wav")).toBe("audio");
  });

  it("falls back to extension when MIME is generic (octet-stream)", () => {
    expect(
      IngestionService.detectKind("application/octet-stream", "x.md"),
    ).toBe("markdown");
    expect(
      IngestionService.detectKind("application/octet-stream", "x.docx"),
    ).toBe("office");
    expect(
      IngestionService.detectKind("application/octet-stream", "x.png"),
    ).toBe("image");
  });

  it("is case-insensitive for MIME and extension", () => {
    expect(IngestionService.detectKind("TEXT/HTML", "X.HTML")).toBe("html");
    expect(
      IngestionService.detectKind("application/octet-stream", "FILE.DOCX"),
    ).toBe("office");
  });

  it("throws UnsupportedFormat when neither MIME nor extension is known", () => {
    try {
      IngestionService.detectKind("application/zip", "archive.zip");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.UnsupportedFormat);
      }
    }
  });

  it("throws UnsupportedFormat when file has no extension and MIME is generic", () => {
    try {
      IngestionService.detectKind("application/octet-stream", "binary");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.UnsupportedFormat);
      }
    }
  });
});

describe("IngestionService.assertWithinLimits", () => {
  it("passes when size is at or below the default cap", () => {
    const limits = IngestionLimits.create({
      defaultMaxBytes: 1024,
      maxRegenerations: 5,
    });
    expect(() =>
      IngestionService.assertWithinLimits("html", 1, limits),
    ).not.toThrow();
    expect(() =>
      IngestionService.assertWithinLimits("html", 1024, limits),
    ).not.toThrow();
  });

  it("prefers per-kind override over default", () => {
    const limits = IngestionLimits.create({
      defaultMaxBytes: 1024,
      maxBytesByKind: { image: 4096 },
      maxRegenerations: 5,
    });
    // image override (4096) — value above default but under override passes.
    expect(() =>
      IngestionService.assertWithinLimits("image", 2048, limits),
    ).not.toThrow();
    // html falls back to default (1024) — 2048 must fail.
    try {
      IngestionService.assertWithinLimits("html", 2048, limits);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.ByteSizeExceedsLimit);
      }
    }
  });

  it("throws ByteSizeExceedsLimit when over cap", () => {
    const limits = IngestionLimits.create({
      defaultMaxBytes: 50 * 1024 * 1024,
      maxRegenerations: 5,
    });
    try {
      IngestionService.assertWithinLimits("html", 50 * 1024 * 1024 + 1, limits);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.ByteSizeExceedsLimit);
      }
    }
  });
});
