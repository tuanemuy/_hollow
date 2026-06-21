import { describe, expect, it } from "vitest";
import { DeepgramSpeechRecognitionProvider } from "@/core/adapters/deepgram/speechRecognitionProvider";
import { OpenAISpeechRecognitionProvider } from "@/core/adapters/openai/speechRecognitionProvider";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
import { buildSpeechRecognitionProvider } from "../serverCloudflare";

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
});
