import { describe, expect, it } from "vitest";
import type { AppConfig } from "@/core/application/di/types";
import { buildHead, buildJsonLdScript } from "../head";

const baseConfig: AppConfig = {
  appUrl: "https://example.com",
  siteName: "Example",
  defaultTitle: "Example",
  defaultDescription: "An example site.",
  themeColor: "#ffffff",
  locale: "ja_JP",
};

function metaContent(
  meta: ReturnType<typeof buildHead>["meta"],
  predicate: (tag: Record<string, string>) => boolean,
): string | undefined {
  const found = meta.find((tag) => predicate(tag as Record<string, string>)) as
    | Record<string, string>
    | undefined;
  return found?.content;
}

describe("buildHead — og:locale is config-driven", () => {
  it("emits the configured locale", () => {
    const { meta } = buildHead(baseConfig);
    expect(metaContent(meta, (t) => t.property === "og:locale")).toBe("ja_JP");
  });

  it("reflects a different configured locale", () => {
    const { meta } = buildHead({ ...baseConfig, locale: "en_US" });
    expect(metaContent(meta, (t) => t.property === "og:locale")).toBe("en_US");
  });
});

describe("buildHead — noIndex", () => {
  it("omits robots meta by default", () => {
    const { meta } = buildHead(baseConfig);
    expect(
      meta.find((t) => (t as { name?: string }).name === "robots"),
    ).toBeUndefined();
  });

  it("emits noindex, nofollow when noIndex is true", () => {
    const { meta } = buildHead(baseConfig, { noIndex: true });
    expect(metaContent(meta, (t) => t.name === "robots")).toBe(
      "noindex, nofollow",
    );
  });
});

describe("buildHead — article:* meta", () => {
  it("does not emit article:* for website type", () => {
    const { meta } = buildHead(baseConfig, {
      publishedTime: "2026-01-01T00:00:00.000Z",
      authorName: "Alice",
      tags: ["x"],
    });
    expect(
      meta.find((t) =>
        (t as { property?: string }).property?.startsWith("article:"),
      ),
    ).toBeUndefined();
  });

  it("emits published/modified/author/tag for article type", () => {
    const { meta } = buildHead(baseConfig, {
      ogType: "article",
      publishedTime: "2026-01-01T00:00:00.000Z",
      modifiedTime: "2026-02-01T00:00:00.000Z",
      authorName: "Alice",
      tags: ["tech", "life"],
    });
    expect(
      metaContent(meta, (t) => t.property === "article:published_time"),
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(
      metaContent(meta, (t) => t.property === "article:modified_time"),
    ).toBe("2026-02-01T00:00:00.000Z");
    expect(metaContent(meta, (t) => t.property === "article:author")).toBe(
      "Alice",
    );
    const tags = meta
      .filter((t) => (t as { property?: string }).property === "article:tag")
      .map((t) => (t as { content: string }).content);
    expect(tags).toEqual(["tech", "life"]);
  });

  it("omits article fields that are not provided", () => {
    const { meta } = buildHead(baseConfig, {
      ogType: "article",
      authorName: "Alice",
    });
    expect(
      meta.find(
        (t) =>
          (t as { property?: string }).property === "article:published_time",
      ),
    ).toBeUndefined();
    expect(
      meta.find(
        (t) =>
          (t as { property?: string }).property === "article:modified_time",
      ),
    ).toBeUndefined();
  });
});

describe("buildJsonLdScript — escaping", () => {
  it("escapes a literal </script> in a string value", () => {
    const script = buildJsonLdScript({
      headline: "before</script><script>alert(1)</script>after",
    });
    expect(script.type).toBe("application/ld+json");
    // No raw `<` survives in the serialized payload.
    expect(script.children).not.toContain("<");
    expect(script.children).toContain("\\u003c");
    // Still valid JSON that round-trips to the original string.
    const parsed = JSON.parse(script.children) as { headline: string };
    expect(parsed.headline).toBe(
      "before</script><script>alert(1)</script>after",
    );
  });

  it("escapes every `<` occurrence, not just the first", () => {
    const script = buildJsonLdScript({ a: "<", b: "<<<" });
    expect(script.children).not.toContain("<");
    const parsed = JSON.parse(script.children) as { a: string; b: string };
    expect(parsed.a).toBe("<");
    expect(parsed.b).toBe("<<<");
  });

  it("leaves payloads without `<` semantically identical", () => {
    const data = { "@type": "Article", headline: "Hello" };
    const script = buildJsonLdScript(data);
    expect(JSON.parse(script.children)).toEqual(data);
  });
});
