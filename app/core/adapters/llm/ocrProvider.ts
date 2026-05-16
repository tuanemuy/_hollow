import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import type {
  OCRExtractInput,
  OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";

/**
 * MVP OCR adapter.
 *
 * Image / scanned-PDF ingestion is out of scope for the MVP per the
 * ingestion spec: the production adapter would wrap a hosted OCR
 * service, but no such backend is wired in this build. The usecase
 * layer is expected to surface the resulting `BusinessRuleError` as
 * a non-retryable "feature not available yet" so the ingestion job
 * transitions to `failed` with a clear error code rather than burning
 * worker retries.
 *
 * MVP 内では image / pdfScanned 形式は未対応。実 OCR をサポートする
 * 場合は本クラスを差し替える。
 */
export class StubOCRProvider implements OCRProvider {
  async extractText(_input: OCRExtractInput): Promise<string> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "ocr_not_implemented_in_mvp",
    );
  }
}
