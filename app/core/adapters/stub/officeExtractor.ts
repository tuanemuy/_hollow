import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import type {
  OfficeExtractInput,
  OfficeExtractor,
  OfficeExtractResult,
} from "@/core/domain/ingestion/ports/officeExtractor";

/**
 * MVP office-document extractor.
 *
 * Office (`.docx` / `.odt` / `.xlsx` / `.pptx` / legacy) ingestion is
 * out of scope for the MVP: the production adapter would wrap a parsing
 * library or external service, but no such backend is wired in this
 * build. The usecase layer surfaces the resulting `BusinessRuleError`
 * as a non-retryable "feature not available yet" so the ingestion job
 * transitions to `failed` with a clear error code rather than burning
 * worker retries.
 *
 * MVP 内では office 形式は未対応。実装する場合は本クラスを差し替える。
 */
export class StubOfficeExtractor implements OfficeExtractor {
  async extractText(_input: OfficeExtractInput): Promise<OfficeExtractResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "office_extraction_not_implemented_in_mvp",
    );
  }
}
