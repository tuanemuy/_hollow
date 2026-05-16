import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { PdfPaperSize } from "../valueObject";

/**
 * Raised when the PDF rendering pipeline cannot produce output for
 * the supplied HTML / options. Adapters translate provider-native
 * errors into this class so the rest of the stack sees a stable
 * contract.
 */
export class PDFRenderError extends Error {
  override readonly name = "PDFRenderError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isPDFRenderError(error: unknown): error is PDFRenderError {
  return error instanceof PDFRenderError;
}

/**
 * Resolves an embedded media reference to its raw bytes. Returning
 * `null` means "media not available" — the renderer falls back to a
 * placeholder rather than failing the whole document.
 */
export type MediaResolver = (id: MediaAssetId) => Promise<ArrayBuffer | null>;

/**
 * Headless renderer that turns export-ready HTML into a PDF. The
 * MVP adapter is expected to wrap a remote `chromium` / `pdfium`
 * service; the port stays oblivious to the concrete engine.
 */
export interface PDFRenderer {
  render(
    html: string,
    options: Readonly<{
      paper: PdfPaperSize;
      embedMedia: boolean;
      mediaResolver: MediaResolver;
    }>,
  ): Promise<ArrayBuffer>;
}
