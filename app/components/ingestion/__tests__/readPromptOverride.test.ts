// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { serverFnChainStub } from "@/components/_test-utils/serverFnMock";
import {
  AppServerError,
  type SerializedError,
} from "@/core/presentation/errorResponse";

// `actions.ts` (and its transitive `errorResponseMiddleware` /
// `../note/actions` imports) build `createServerFn` / `createMiddleware`
// chains at module top-level. Stub them so importing the module for the
// pure `readPromptOverride` unit under test has no side effects.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => serverFnChainStub(),
  createMiddleware: () => serverFnChainStub(),
}));

const { readPromptOverride, PROMPT_OVERRIDE_MAX_BYTES } = await import(
  "../actions"
);

function formDataWith(entries: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe("readPromptOverride", () => {
  // (a) non-empty strings are trimmed and mapped to structure / metadata.
  it("trims non-empty values into { structure, metadata }", () => {
    const result = readPromptOverride(
      formDataWith({
        structurePrompt: "  structure body  ",
        metadataPrompt: "\tmetadata body\n",
      }),
    );
    expect(result).toEqual({
      structure: "structure body",
      metadata: "metadata body",
    });
  });

  // (b) blank / whitespace-only values do not produce a property.
  it("omits blank / whitespace-only fields", () => {
    const result = readPromptOverride(
      formDataWith({ structurePrompt: "real", metadataPrompt: "   " }),
    );
    expect(result).toEqual({ structure: "real" });
    expect(result && "metadata" in result).toBe(false);
  });

  // (c) when neither field is set the whole function returns undefined.
  it("returns undefined when neither field is present", () => {
    expect(readPromptOverride(new FormData())).toBeUndefined();
  });

  // (c') both blank → still undefined (no override object).
  it("returns undefined when both fields are blank", () => {
    const result = readPromptOverride(
      formDataWith({ structurePrompt: "  ", metadataPrompt: "" }),
    );
    expect(result).toBeUndefined();
  });

  // (d) File values are not strings, so they are ignored entirely.
  it("ignores File values (treated as no override)", () => {
    const fd = new FormData();
    fd.append("structurePrompt", new File(["body"], "x.txt"));
    fd.append("metadataPrompt", new File(["meta"], "y.txt"));
    expect(readPromptOverride(fd)).toBeUndefined();
  });

  // (e) over-cap values throw an AppServerError carrying a `validation`
  // kind. Byte size — not character length — is what the cap measures,
  // so a multibyte string under the char count can still breach.
  it("throws an AppServerError(validation) when over the byte cap", () => {
    const oversize = "a".repeat(PROMPT_OVERRIDE_MAX_BYTES + 1);
    expect(() =>
      readPromptOverride(formDataWith({ structurePrompt: oversize })),
    ).toThrow(AppServerError);

    let serialized: SerializedError | null = null;
    try {
      readPromptOverride(formDataWith({ structurePrompt: oversize }));
    } catch (e) {
      if (e instanceof AppServerError) serialized = e.serialized;
    }
    expect(serialized?.kind).toBe("validation");
    expect(serialized?.code).toBe("INVALID_INPUT");
    expect(
      (serialized as { fieldErrors?: Record<string, readonly string[]> })
        .fieldErrors?.structurePrompt,
    ).toBeDefined();
  });

  it("measures the cap in bytes, not characters (multibyte breach)", () => {
    // Each "あ" is 3 UTF-8 bytes. A string whose char count is well under
    // the byte cap can still exceed it once encoded.
    const charCount = Math.floor(PROMPT_OVERRIDE_MAX_BYTES / 3) + 1;
    const multibyte = "あ".repeat(charCount);
    expect(multibyte.length).toBeLessThan(PROMPT_OVERRIDE_MAX_BYTES);
    expect(new TextEncoder().encode(multibyte).length).toBeGreaterThan(
      PROMPT_OVERRIDE_MAX_BYTES,
    );
    expect(() =>
      readPromptOverride(formDataWith({ metadataPrompt: multibyte })),
    ).toThrow(AppServerError);
  });

  // (e') a value exactly at the cap is accepted (boundary, not over).
  it("accepts a value exactly at the byte cap", () => {
    const exact = "a".repeat(PROMPT_OVERRIDE_MAX_BYTES);
    const result = readPromptOverride(formDataWith({ structurePrompt: exact }));
    expect(result?.structure).toBe(exact);
  });

  // (f) only the canonical field names are read; aliases are ignored.
  it("reads only `structurePrompt` / `metadataPrompt`, not aliases", () => {
    const result = readPromptOverride(
      formDataWith({
        structure_prompt: "ignored",
        metadata: "ignored",
        prompt: "ignored",
      }),
    );
    expect(result).toBeUndefined();
  });
});
