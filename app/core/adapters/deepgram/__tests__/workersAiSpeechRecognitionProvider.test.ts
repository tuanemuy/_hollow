import type { Ai } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";
import { SpeechFailureError } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { deepgramWorkersAiSpeechAdapter } from "../index";
import { DeepgramWorkersAiSpeechRecognitionProvider } from "../workersAiSpeechRecognitionProvider";

type RunFn = (
  model: string,
  inputs: unknown,
  options?: unknown,
) => Promise<unknown>;

/** Build a fake `env.AI` binding whose `run` is the supplied stub. */
function fakeAi(run: RunFn): Ai {
  return { run: vi.fn(run) } as unknown as Ai;
}

function transcriptOutput(transcript: unknown): unknown {
  return { results: { channels: [{ alternatives: [{ transcript }] }] } };
}

function audioBytes(size = 8): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

const INPUT = {
  audioBytes: audioBytes(),
  mime: "audio/webm",
  locale: "ja-JP",
} as const;

function makeProvider(
  overrides: Partial<{ ai: Ai | undefined; timeoutMs: number }> = {},
): DeepgramWorkersAiSpeechRecognitionProvider {
  return new DeepgramWorkersAiSpeechRecognitionProvider({
    model: "@cf/deepgram/nova-3",
    ...(overrides.ai !== undefined ? { ai: overrides.ai } : {}),
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("DeepgramWorkersAiSpeechRecognitionProvider", () => {
  describe("happy path", () => {
    it("calls env.AI.run with the typed model + audio body/contentType and returns the trimmed transcript", async () => {
      const ai = fakeAi(async () => transcriptOutput("  こんにちは世界  "));
      const result = await makeProvider({ ai }).transcribe(INPUT);
      expect(result).toBe("こんにちは世界");

      const runMock = ai.run as unknown as ReturnType<typeof vi.fn>;
      expect(runMock).toHaveBeenCalledTimes(1);
      const [model, inputs] = runMock.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(model).toBe("@cf/deepgram/nova-3");
      expect(inputs.audio).toEqual({
        body: INPUT.audioBytes,
        contentType: "audio/webm",
      });
      expect(inputs.smart_format).toBe(true);
      // locale `ja-JP` → primary subtag `ja`.
      expect(inputs.language).toBe("ja");
    });

    it("omits the language hint for an empty locale", async () => {
      const ai = fakeAi(async () => transcriptOutput("ok"));
      await makeProvider({ ai }).transcribe({ ...INPUT, locale: "" });
      const runMock = ai.run as unknown as ReturnType<typeof vi.fn>;
      const [, inputs] = runMock.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect("language" in inputs).toBe(false);
    });

    it("returns an empty string for an empty transcript output (no detected speech)", async () => {
      const ai = fakeAi(async () => transcriptOutput(""));
      const result = await makeProvider({ ai }).transcribe(INPUT);
      expect(result).toBe("");
    });

    it("returns an empty string when the transcript field is absent", async () => {
      const ai = fakeAi(async () => ({ results: {} }));
      const result = await makeProvider({ ai }).transcribe(INPUT);
      expect(result).toBe("");
    });

    it("handles an empty audio input by forwarding empty bytes to run", async () => {
      // Distinct from the empty-transcript case: here the *input* is empty.
      const empty = audioBytes(0);
      const ai = fakeAi(async () => transcriptOutput("still transcribed"));
      const result = await makeProvider({ ai }).transcribe({
        ...INPUT,
        audioBytes: empty,
      });
      expect(result).toBe("still transcribed");
      const runMock = ai.run as unknown as ReturnType<typeof vi.fn>;
      const [, inputs] = runMock.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect((inputs.audio as { body: unknown }).body).toBe(empty);
    });
  });

  describe("failure mapping", () => {
    it("throws SpeechFailureError when the AI binding is not injected", async () => {
      const provider = makeProvider({ ai: undefined });
      await expect(provider.transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps a run() rejection to SpeechFailureError", async () => {
      const ai = fakeAi(async () => {
        throw new Error("workers-ai exploded");
      });
      await expect(
        makeProvider({ ai }).transcribe(INPUT),
      ).rejects.toBeInstanceOf(SpeechFailureError);
    });

    it("maps a timeout to a timeout-worded SpeechFailureError (Promise.race timer)", async () => {
      // run never resolves — the self-managed timer must reject.
      const ai = fakeAi(() => new Promise<unknown>(() => {}));
      try {
        await makeProvider({ ai, timeoutMs: 5 }).transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).toMatch(/timed out/);
      }
    });
  });
});

describe("deepgramWorkersAiSpeechAdapter.ping (Issue #788 / ADR-005)", () => {
  it("returns ok:true when the AI binding is present (no run() call)", async () => {
    const runMock = vi.fn();
    const ai = { run: runMock } as unknown as Ai;
    const result = await deepgramWorkersAiSpeechAdapter.ping(
      { provider: "deepgram-workers-ai" } as never,
      "",
      1000,
      { ai },
    );
    expect(result).toEqual({ ok: true });
    // The probe must never invoke the model (no billing, no real audio).
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the AI binding is missing", async () => {
    const result = await deepgramWorkersAiSpeechAdapter.ping(
      { provider: "deepgram-workers-ai" } as never,
      "",
      1000,
      undefined,
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(
      /AI binding is not configured/,
    );
  });
});
