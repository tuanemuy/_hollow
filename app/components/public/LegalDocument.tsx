import { CodeHighlight } from "../note/content/CodeHighlight";

type LegalDocumentProps = {
  markdown: string;
};

/**
 * Renders a legal-document Markdown string into the public-facing HTML
 * surface. Markdown is converted via the container's `markdownConverter`
 * port and sanitised through `htmlSanitizer.sanitize` with the strict
 * policy (no media, no internal-link placeholders) before being lifted
 * into the DOM via `dangerouslySetInnerHTML`. The output is wrapped in
 * `.note-detail-content` so it inherits the same typography as public
 * note bodies (CLAUDE.md ADR-002 / Issue #205 ADR-006).
 */
export async function LegalDocument({ markdown }: LegalDocumentProps) {
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  const rawHtml = await container.markdownConverter.toHtml(markdown);
  const { html } = container.htmlSanitizer.sanitize(rawHtml, {
    allowMedia: false,
    allowInternalLinks: false,
  });

  return (
    <main className="flex-1 px-4 py-8 sm:py-12">
      <article
        className="note-detail-content max-w-prose mx-auto"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via HtmlSanitizer port
        dangerouslySetInnerHTML={{ __html: html as string }}
      />
      <CodeHighlight />
    </main>
  );
}
