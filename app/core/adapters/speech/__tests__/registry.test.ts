import { describe, expect, it } from "vitest";
import {
  deepgramSpeechAdapter,
  deepgramWorkersAiSpeechAdapter,
} from "../../deepgram";
import { geminiSpeechAdapter } from "../../gemini";
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

  it("registers the Gemini adapter", () => {
    expect(speechProviderRegistry.gemini).toBe(geminiSpeechAdapter);
  });

  it("registers the Deepgram Workers AI adapter (Issue #788)", () => {
    expect(speechProviderRegistry["deepgram-workers-ai"]).toBe(
      deepgramWorkersAiSpeechAdapter,
    );
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

  it("resolves the Gemini adapter by its provider string", () => {
    expect(lookupSpeechAdapter("gemini")).toBe(geminiSpeechAdapter);
  });

  it("resolves the Deepgram Workers AI adapter by its provider string", () => {
    expect(lookupSpeechAdapter("deepgram-workers-ai")).toBe(
      deepgramWorkersAiSpeechAdapter,
    );
  });

  it("returns undefined for an unregistered provider string", () => {
    expect(lookupSpeechAdapter("whisper-x")).toBeUndefined();
    expect(lookupSpeechAdapter("")).toBeUndefined();
  });
});
