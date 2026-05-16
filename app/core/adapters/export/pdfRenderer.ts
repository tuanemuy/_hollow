import { BusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import type {
  MediaResolver,
  PDFRenderer,
} from "@/core/domain/export/ports/pdfRenderer";
import type { PdfPaperSize } from "@/core/domain/export/valueObject";

/**
 * MVP PDF renderer adapter.
 *
 * The production adapter is expected to wrap a remote headless rendering
 * service (chromium / pdfium). The MVP build does not ship one — the
 * usecase layer surfaces an unambiguous, structured failure so the
 * surrounding flow (export job → fail transition) records the gap
 * faithfully. Callers should treat the thrown `BusinessRuleError` as a
 * 4xx "feature not available yet" rather than retrying.
 *
 * MVP では未実装。実 PDF レンダリングをサポートする場合は本クラスを差し替える。
 */
export class StubPdfRenderer implements PDFRenderer {
  async render(
    _html: string,
    _options: Readonly<{
      paper: PdfPaperSize;
      embedMedia: boolean;
      mediaResolver: MediaResolver;
    }>,
  ): Promise<ArrayBuffer> {
    throw new BusinessRuleError(
      ExportErrorCode.PdfNotImplemented,
      "pdf_export_not_implemented_in_mvp",
    );
  }
}
