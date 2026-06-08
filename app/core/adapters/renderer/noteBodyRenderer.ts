import {
  ELEMENT_NODE,
  type ElementNode,
  type Node,
  parse,
  renderSync,
  TEXT_NODE,
} from "ultrahtml";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { NoteBodyRenderer } from "@/core/domain/note/ports/noteBodyRenderer";
import {
  INTERNAL_LINK_PATTERN,
  UUID_V7_PATTERN,
} from "@/core/domain/note/service";
import type {
  ContentHtml,
  InternalLinkRef,
} from "@/core/domain/note/valueObject";
import { HASHTAG_PATTERN } from "@/core/domain/tag/service";

// Mirror `extractMetadataFromHtml`: a `[[target]]` whose trimmed target
// looks like a UUIDv7 is an id-keyed reference, everything else is a
// title-keyed reference. The `(kind, target)` pair is the ref-map key.
const refKey = (kind: "id" | "title", target: string): string =>
  `${kind}:${target.trim()}`;

// `renderSync` re-emits attribute values / text verbatim (no re-escaping),
// matching `UltrahtmlHtmlSanitizer`. Escape just enough so an injected
// target / display string cannot break out of its context. `&` is left
// untouched because ultrahtml keeps entities literal.
const escapeAttrValue = (value: string): string =>
  value.replace(/"/g, "&quot;");

const escapeTextValue = (value: string): string =>
  value.replace(/</g, "&lt;").replace(/>/g, "&gt;");

const textNode = (value: string): Node =>
  ({ type: TEXT_NODE, value }) as unknown as Node;

// A pre-serialised HTML fragment smuggled through the AST as a text node.
// `renderSync` emits a text node's `value` verbatim, so a node carrying
// already-escaped markup round-trips unchanged — this is how we inject the
// `<a>` / `<span>` element markup without re-parsing it (which would
// re-escape the `<`/`>`).
const rawHtmlNode = (html: string): Node =>
  ({ type: TEXT_NODE, value: html }) as unknown as Node;

type Surface = "auth" | "public";

const wikilinkMarkup = (
  label: string,
  resolvedNoteId: string | null,
  surface: Surface,
): string => {
  const text = escapeTextValue(label);
  if (resolvedNoteId === null) {
    return `<span class="wikilink" data-unresolved>${text}</span>`;
  }
  // Public wikilinks resolve through `/notes/public/$id`, whose route gates
  // on visibility=public (NotFound otherwise), so a private resolved target
  // is never reachable / enumerable from the public surface. The auth route
  // `/notes/$id` is never emitted on a public page.
  const base = surface === "public" ? "/notes/public/" : "/notes/";
  return `<a class="wikilink" href="${base}${escapeAttrValue(resolvedNoteId)}">${text}</a>`;
};

const hashtagMarkup = (tag: string, surface: Surface): string => {
  const text = escapeTextValue(tag);
  if (surface === "public") {
    // No public tag-filter route exists; keep the pill non-linking rather
    // than steering anonymous visitors into the auth-only home filter.
    return `<span class="hashtag">#${text}</span>`;
  }
  // The home tag filter parses `?tagNames=` with TanStack's default search
  // serializer (`app/router.tsx` sets no custom parser) against the
  // `z.array(...)` `noteListSearchSchema.tagNames`. A scalar `?tagNames=foo`
  // is read as the string `"foo"`, rejected by the array schema, and
  // silently dropped (`.catch(undefined)`) — the link looks fine but filters
  // nothing. Emit the default array form `?tagNames=["tag"]` instead.
  const href = `/?tagNames=${encodeURIComponent(JSON.stringify([tag]))}`;
  return `<a class="hashtag" href="${escapeAttrValue(href)}">#${text}</a>`;
};

type Replacement = Readonly<{ start: number; end: number; html: string }>;

// Tokenise a single text node into wikilink / hashtag replacements,
// ordered by position and non-overlapping. A `#tag` that falls inside a
// `[[...]]` span is dropped (the wikilink claims the range first).
const collectReplacements = (
  value: string,
  refsByKey: ReadonlyMap<string, InternalLinkRef>,
  surface: Surface,
): readonly Replacement[] => {
  const replacements: Replacement[] = [];

  // `matchAll` builds a fresh iterator off a cloned lastIndex, so the
  // shared module-level `/g` regex is not mutated across calls.
  for (const m of value.matchAll(INTERNAL_LINK_PATTERN)) {
    const rawTarget = m[1];
    if (rawTarget === undefined || m.index === undefined) continue;
    const target = rawTarget.trim();
    if (target.length === 0) continue;
    const display = m[2]?.trim();
    const kind = UUID_V7_PATTERN.test(target) ? "id" : "title";
    const ref = refsByKey.get(refKey(kind, target));
    const resolvedNoteId = ref?.resolvedNoteId ?? null;
    // Prefer the inline display segment, then the stored ref display text,
    // and only fall back to the raw target (a bare UUID for id-kind links).
    const refDisplay = ref?.displayText?.trim();
    const label =
      display !== undefined && display.length > 0
        ? display
        : refDisplay !== undefined && refDisplay.length > 0
          ? refDisplay
          : target;
    replacements.push({
      start: m.index,
      end: m.index + m[0].length,
      html: wikilinkMarkup(label, resolvedNoteId, surface),
    });
  }

  for (const m of value.matchAll(HASHTAG_PATTERN)) {
    const tag = m[1];
    if (tag === undefined || m.index === undefined) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    // Skip hashtags overlapping an already-claimed wikilink span.
    const overlaps = replacements.some((r) => start < r.end && end > r.start);
    if (overlaps) continue;
    replacements.push({ start, end, html: hashtagMarkup(tag, surface) });
  }

  replacements.sort((a, b) => a.start - b.start);
  return replacements;
};

// Expand a text node into a mix of (escaped) plain text nodes and raw
// markup nodes for the matched tokens. Returns the original (escaped) node
// untouched when nothing matched.
const transformTextNode = (
  value: string,
  refsByKey: ReadonlyMap<string, InternalLinkRef>,
  surface: Surface,
): Node[] => {
  const replacements = collectReplacements(value, refsByKey, surface);
  if (replacements.length === 0) {
    return [textNode(value)];
  }
  const out: Node[] = [];
  let cursor = 0;
  for (const r of replacements) {
    if (r.start > cursor) {
      out.push(textNode(value.slice(cursor, r.start)));
    }
    out.push(rawHtmlNode(r.html));
    cursor = r.end;
  }
  if (cursor < value.length) {
    out.push(textNode(value.slice(cursor)));
  }
  return out;
};

// `<pre>` / `<code>` bodies hold code that may legitimately contain `#`
// or `[[`; an existing `<a>` already owns its link. Both suppress
// token markup inside their subtree (the `suppressed` flag carries the
// ancestor state down the walk).
const SUPPRESSING_TAGS = new Set(["pre", "code", "a"]);

const transformChildren = (
  nodes: readonly Node[],
  refsByKey: ReadonlyMap<string, InternalLinkRef>,
  suppressed: boolean,
  surface: Surface,
): Node[] => {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.type === TEXT_NODE) {
      if (suppressed) {
        out.push(textNode(node.value));
      } else {
        out.push(...transformTextNode(node.value, refsByKey, surface));
      }
      continue;
    }
    if (node.type === ELEMENT_NODE) {
      const el = node as ElementNode;
      const childSuppressed =
        suppressed || SUPPRESSING_TAGS.has(el.name.toLowerCase());
      out.push({
        ...el,
        children: transformChildren(
          el.children,
          refsByKey,
          childSuppressed,
          surface,
        ),
      });
      continue;
    }
    out.push(node);
  }
  return out;
};

/**
 * `ultrahtml`-backed implementation of {@link NoteBodyRenderer}.
 *
 * Walks the parsed AST and rewrites `[[wikilink]]` / `#hashtag` tokens
 * found in text nodes into pill markup, leaving `<pre>` / `<code>` /
 * `<a>` subtrees and attribute values untouched. The transformation is
 * read-path only — it never feeds back into the stored body.
 */
class UltrahtmlNoteBodyRenderer implements NoteBodyRenderer {
  renderForDisplay(
    html: ContentHtml,
    refs: readonly InternalLinkRef[],
    options?: { surface: "auth" | "public" },
  ): string {
    const surface: Surface = options?.surface ?? "auth";
    try {
      const refsByKey = new Map<string, InternalLinkRef>();
      for (const ref of refs) {
        refsByKey.set(refKey(ref.kind, ref.target), ref);
      }
      const root = parse(html as string) as Node & { children: Node[] };
      const transformed = {
        ...root,
        children: transformChildren(root.children, refsByKey, false, surface),
      };
      return renderSync(transformed);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to render note body for display",
        cause,
      );
    }
  }
}

export { UltrahtmlNoteBodyRenderer };
