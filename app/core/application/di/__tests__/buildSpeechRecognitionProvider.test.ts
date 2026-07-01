import type { Ai } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { DeepgramSpeechRecognitionProvider } from "@/core/adapters/deepgram/speechRecognitionProvider";
import { DeepgramWorkersAiSpeechRecognitionProvider } from "@/core/adapters/deepgram/workersAiSpeechRecognitionProvider";
import { OpenAISpeechRecognitionProvider } from "@/core/adapters/openai/speechRecognitionProvider";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
import { buildSpeechRecognitionProvider } from "../serverCloudflare";

// The builder only stashes the binding; a bare object stand-in is enough.
const FAKE_AI = {} as unknown as Ai;

describe("buildSpeechRecognitionProvider", () => {
  it("returns the OpenAI provider when both api key and model are present", () => {
    const provider = buildSpeechRecognitionProvider(
      "openai",
      "sk-speech",
      "gpt-4o-transcribe",
    );
    expect(provider).toBeInstanceOf(OpenAISpeechRecognitionProvider);
  });

  it("defaults the provider to openai when the provider arg is undefined", () => {
    const provider = buildSpeechRecognitionProvider(
      undefined,
      "sk-speech",
      "gpt-4o-transcribe",
    );
    expect(provider).toBeInstanceOf(OpenAISpeechRecognitionProvider);
  });

  it("falls back to the Stub when the api key is missing", () => {
    const provider = buildSpeechRecognitionProvider(
      "openai",
      undefined,
      "gpt-4o-transcribe",
    );
    expect(provider).toBeInstanceOf(StubSpeechRecognitionProvider);
  });

  it("falls back to the Stub when the model is missing", () => {
    const provider = buildSpeechRecognitionProvider(
      "openai",
      "sk-speech",
      undefined,
    );
    expect(provider).toBeInstanceOf(StubSpeechRecognitionProvider);
  });

  it("returns the Deepgram provider when both api key and model are present", () => {
    const provider = buildSpeechRecognitionProvider(
      "deepgram",
      "dg-speech",
      "nova-3",
    );
    expect(provider).toBeInstanceOf(DeepgramSpeechRecognitionProvider);
  });

  it("falls back to the Stub for an unregistered provider (operator typo)", () => {
    const provider = buildSpeechRecognitionProvider(
      "whisper-x",
      "sk-speech",
      "some-model",
    );
    expect(provider).toBeInstanceOf(StubSpeechRecognitionProvider);
  });

  describe("keyless deepgram-workers-ai (Issue #788)", () => {
    it("returns the Workers AI provider with a binding + model and NO api key", () => {
      const provider = buildSpeechRecognitionProvider(
        "deepgram-workers-ai",
        undefined, // no api key — keyless
        "@cf/deepgram/nova-3",
        FAKE_AI,
      );
      expect(provider).toBeInstanceOf(
        DeepgramWorkersAiSpeechRecognitionProvider,
      );
    });

    it("falls back to the Stub when the AI binding is not injected (even with model present)", () => {
      const provider = buildSpeechRecognitionProvider(
        "deepgram-workers-ai",
        undefined,
        "@cf/deepgram/nova-3",
        undefined, // no binding
      );
      expect(provider).toBeInstanceOf(StubSpeechRecognitionProvider);
    });

    it("falls back to the Stub when the model is missing (binding present)", () => {
      const provider = buildSpeechRecognitionProvider(
        "deepgram-workers-ai",
        undefined,
        undefined,
        FAKE_AI,
      );
      expect(provider).toBeInstanceOf(StubSpeechRecognitionProvider);
    });

    it("ignores a stray api key and still wires the keyless provider", () => {
      const provider = buildSpeechRecognitionProvider(
        "deepgram-workers-ai",
        "sk-should-be-ignored",
        "@cf/deepgram/nova-3",
        FAKE_AI,
      );
      expect(provider).toBeInstanceOf(
        DeepgramWorkersAiSpeechRecognitionProvider,
      );
    });
  });
});
