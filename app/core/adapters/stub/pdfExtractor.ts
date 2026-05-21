import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import type {
  PDFExtractInput,
  PDFExtractor,
  PDFExtractResult,
} from "@/core/domain/ingestion/ports/pdfExtractor";

/**
 * MVP PDF extractor.
 *
 * Textual and scanned PDF ingestion are both out of scope for the MVP:
 * the production adapter would wrap a PDF parsing library (pdf.js /
 * pdfium / etc.) to distinguish textual from scanned PDFs, but no such
 * backend is wired in this build. The usecase layer surfaces the
 * resulting `BusinessRuleError` as a non-retryable "feature not
 * available yet" so the ingestion job transitions to `failed` with a
 * clear error code rather than burning worker retries.
 *
 * MVP 内では pdfTextual / pdfScanned 形式は未対応。実 PDF パーサを
 * 接続する場合は本クラスを差し替える。
 */
export class StubPDFExtractor implements PDFExtractor {
  async extract(_input: PDFExtractInput): Promise<PDFExtractResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "pdf_extraction_not_implemented_in_mvp",
    );
  }
}
