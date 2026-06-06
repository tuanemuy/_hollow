import MarkdownIt from "markdown-it";
import markdownItAttrs from "markdown-it-attrs";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { MarkdownConverter } from "@/core/domain/note/ports/markdownConverter";

// CommonMark conversion via markdown-it. `{#id}` heading anchors are
// resolved by markdown-it-attrs (id-only, no class / arbitrary attrs)
// followed by a core rule that drops ids whose value is not a safe
// identifier. `[[wikilink]]` placeholders survive verbatim because
// markdown-it leaves an unmatched `[` as literal text — the
// link-extraction pass in NoteService depends on this.
//
// `html: false` blocks raw HTML injection from user markdown at the
// converter stage; the sanitiser is a second defence layer downstream.
// The output is a raw HTML string, not yet a `ContentHtml` — the caller
// must pass it through `HtmlSanitizer.sanitize`.

// Anchor ids are restricted to a conservative identifier shape so a
// `{#id}` value can never carry markup or break the HTML it lands in.
const SAFE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

const stripUnsafeIds = (md: MarkdownIt): void => {
  md.core.ruler.push("strip_unsafe_ids", (state) => {
    const visit = (tokens: ReturnType<typeof md.parse>): void => {
      for (const token of tokens) {
        const idIndex = token.attrIndex("id");
        if (idIndex >= 0) {
          const id = token.attrs?.[idIndex]?.[1];
          if (id === undefined || !SAFE_ID_PATTERN.test(id)) {
            token.attrs?.splice(idIndex, 1);
          }
        }
        if (token.children) visit(token.children);
      }
    };
    visit(state.tokens);
    return false;
  });
};

const createRenderer = (): MarkdownIt => {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
  }).use(markdownItAttrs, { allowedAttributes: ["id"] });
  stripUnsafeIds(md);
  return md;
};

class MarkdownItMarkdownConverter implements MarkdownConverter {
  private readonly md = createRenderer();

  async toHtml(markdown: string): Promise<string> {
    try {
      return this.md.render(markdown);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to convert markdown to HTML",
        cause,
      );
    }
  }
}

export { MarkdownItMarkdownConverter };
