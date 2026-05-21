import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import type {
  SpeechRecognitionProvider,
  SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";

/**
 * MVP speech-to-text adapter.
 *
 * Audio ingestion is out of scope for the MVP: the production adapter
 * would wrap a hosted ASR service, but no such backend is wired in this
 * build. The usecase layer surfaces the resulting `BusinessRuleError`
 * as a non-retryable "feature not available yet" so the ingestion job
 * transitions to `failed` with a clear error code rather than burning
 * worker retries.
 *
 * MVP 内では audio 形式は未対応。実 ASR をサポートする場合は本クラスを
 * 差し替える。
 */
export class StubSpeechRecognitionProvider
  implements SpeechRecognitionProvider
{
  async transcribe(_input: SpeechTranscribeInput): Promise<string> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "speech_recognition_not_implemented_in_mvp",
    );
  }
}
