/**
 * Speech-to-text port for `audio` ingestion. Returns a single
 * transcript per call; speaker diarisation and timestamps are out of
 * scope for the MVP and are not part of the contract.
 */

export class SpeechFailureError extends Error {
  override readonly name = "SpeechFailureError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isSpeechFailureError(
  error: unknown,
): error is SpeechFailureError {
  return error instanceof SpeechFailureError;
}

export type SpeechTranscribeInput = Readonly<{
  audioBytes: ArrayBuffer;
  mime: string;
  locale: string;
}>;

export interface SpeechRecognitionProvider {
  /**
   * Transcribes `audioBytes` into a single string. Returns an empty
   * string when no speech was detected; only catastrophic failures
   * surface as `SpeechFailureError`.
   */
  transcribe(input: SpeechTranscribeInput): Promise<string>;
}
