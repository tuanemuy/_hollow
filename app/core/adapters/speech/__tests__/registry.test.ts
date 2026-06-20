import { describe, expect, it } from "vitest";
import { deepgramSpeechAdapter } from "../../deepgram";
import { openaiSpeechAdapter } from "../../openai";
// Import the REAL registry (no `vi.mock`) so this test verifies that the
// speech providers are actually registered. The
// `speechConnectionTester.test.ts` mocks `lookupSpeechAdapter`, so it cannot
// prove the registry contents — this is the dedicated dispatch test
// ([arch S-003]).
import { lookupSpeechAdapter, speechProviderRegistry } from "../registry";

describe("speechProviderRegistry", () => {
  it("registers the OpenAI adapter", () => {
    expect(speechProviderRegistry.openai).toBe(openaiSpeechAdapter);
  });

  it("registers the Deepgram adapter", () => {
    expect(speechProviderRegistry.deepgram).toBe(deepgramSpeechAdapter);
  });
});

describe("lookupSpeechAdapter", () => {
  it("resolves the Deepgram adapter by its provider string", () => {
    const adapter = lookupSpeechAdapter("deepgram");
    expect(adapter).toBeDefined();
    expect(adapter).toBe(deepgramSpeechAdapter);
  });

  it("resolves the OpenAI adapter by its provider string", () => {
    expect(lookupSpeechAdapter("openai")).toBe(openaiSpeechAdapter);
  });

  it("returns undefined for an unregistered provider string", () => {
    expect(lookupSpeechAdapter("whisper-x")).toBeUndefined();
    expect(lookupSpeechAdapter("")).toBeUndefined();
  });
});
