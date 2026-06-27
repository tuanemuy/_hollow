import { describe, expect, it } from "vitest";
import { BYTE_SIZE_MAX } from "../schema";
import { validateMediaFile } from "../validation";

describe("validateMediaFile", () => {
  describe("format validation", () => {
    it("accepts image MIME types", () => {
      const file = new File([], "test.jpg", { type: "image/jpeg" });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: true, kind: "image" });
    });

    it("accepts video MIME types", () => {
      const file = new File([], "test.mov", { type: "video/quicktime" });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: true, kind: "video" });
    });

    it("rejects unsupported MIME types", () => {
      const file = new File([], "test.pdf", { type: "application/pdf" });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: false, reason: "unsupported" });
    });

    it("rejects unknown MIME type", () => {
      const file = new File([], "test.doc", { type: "application/msword" });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: false, reason: "unsupported" });
    });

    it("rejects audio MIME types", () => {
      const file = new File([], "test.mp3", { type: "audio/mpeg" });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: false, reason: "unsupported" });
    });
  });

  describe("size validation", () => {
    it("accepts files under BYTE_SIZE_MAX", () => {
      const file = new File([], "test.jpg", { type: "image/jpeg" });
      const sizeInBytes = Math.floor(BYTE_SIZE_MAX / 2);
      Object.defineProperty(file, "size", { value: sizeInBytes });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: true, kind: "image" });
    });

    it("accepts files exactly at BYTE_SIZE_MAX", () => {
      const file = new File([], "test.jpg", { type: "image/jpeg" });
      Object.defineProperty(file, "size", { value: BYTE_SIZE_MAX });
      const result = validateMediaFile(file);
      expect(result).toEqual({ ok: true, kind: "image" });
    });

    it("rejects files over BYTE_SIZE_MAX", () => {
      const file = new File([], "test.mov", { type: "video/quicktime" });
      const sizeInBytes = BYTE_SIZE_MAX + 1;
      Object.defineProperty(file, "size", { value: sizeInBytes });
      const result = validateMediaFile(file);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        ok: false,
        reason: "oversized",
      });
      if (!result.ok) {
        expect(result.sizeLabel).toMatch(/\d+\.\d+\s+MB/);
      }
    });

    it("formats large file sizes correctly", () => {
      const file = new File([], "test.mov", { type: "video/quicktime" });
      // 6 GiB = 6144 MB
      const sixGiB = 6 * 1024 * 1024 * 1024;
      Object.defineProperty(file, "size", { value: sixGiB });
      const result = validateMediaFile(file);
      expect(result).toMatchObject({
        ok: false,
        reason: "oversized",
        sizeLabel: "6144.0 MB",
      });
    });
  });

  describe("kind derivation", () => {
    it("derives kind=image from image MIME types", () => {
      const types = ["image/jpeg", "image/png", "image/webp"];
      for (const type of types) {
        const file = new File([], "test", { type });
        const result = validateMediaFile(file);
        expect(result).toEqual({ ok: true, kind: "image" });
      }
    });

    it("derives kind=video from video MIME types", () => {
      const types = ["video/mp4", "video/quicktime", "video/webm"];
      for (const type of types) {
        const file = new File([], "test", { type });
        const result = validateMediaFile(file);
        expect(result).toEqual({ ok: true, kind: "video" });
      }
    });
  });
});
