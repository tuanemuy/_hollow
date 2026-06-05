"use client";

import { useEffect, useRef } from "react";

/**
 * Inline editor (Issue #233 / spec C2). Renders the saved HTML as-is
 * and makes its **text-bearing block elements** (`<p>` / `<h1-6>` /
 * `<li>` / `<td>` / `<th>` / `<blockquote>` / `<figcaption>` /
 * `<caption>` / `<dt>` / `<dd>`) contentEditable so users can edit
 * decorated text in place without losing structure (spec C2-2).
 *
 * Mirrors `HtmlEditor` / `WysiwygEditor`'s `{ value, onChange,
 * disabled }` I/O contract so `NoteEditor.tsx` can swap the rendered
 * pane based on `state.mode` without touching the surrounding
 * autosave / submit / edit-lock plumbing. The additional
 * `onInitFailed` callback lets the parent fall back to `html` mode
 * when the saved HTML is not parseable (Issue #233 ADR-002 / spec
 * acceptance criterion).
 *
 * Core invariants (Issue #233 ADR-002 / ADR-003):
 *
 * 1. **Allow-list block contentEditable.** Only the allow-listed block
 *    tags get `contentEditable=true`. Inline children (`<strong>` /
 *    `<em>` / `<a>` / `<code>` …) inherit editability from the parent
 *    so the user can edit decorated text in place. `<pre>` is on the
 *    allow-list (Issue #285): it is decorated even when it has no direct
 *    text child (the standard `<pre><code>…</code></pre>` shape), so the
 *    nested `<code>` text becomes editable via contentEditable
 *    inheritance. Tags outside the allow-list stay read-only.
 *
 * 2. **Structure rollback via MutationObserver.** A snapshot of the
 *    parsed `<body>` is kept; any structural mutation that is not a
 *    pure text edit (or an IME-in-flight mutation) triggers a rollback
 *    to the snapshot:
 *
 *    - `characterData`: always allowed (the legitimate text-edit path).
 *    - `childList`: allowed iff (a) IME is in flight OR (b) the
 *      `target` is `isContentEditable === true` AND every node in
 *      `addedNodes` / `removedNodes` is a `TEXT_NODE` (covers
 *      Backspace-merge / insertText paths that legitimately churn
 *      text nodes).
 *    - `attributes`: allowed only while IME is in flight.
 *    - On `compositionend`, run `takeRecords()` → compare structure
 *      against the snapshot → rollback if drift → finally clear
 *      `isComposingRef`. The order matters: the final input event
 *      after compositionend would otherwise be evaluated against a
 *      stale `isComposingRef === true` (or, if cleared first, would
 *      be rolled back).
 *
 * 3. **Rollback procedure.** Always `observer.disconnect()` →
 *    `observer.takeRecords()` → `host.replaceChildren()` → append a
 *    freshly cloned snapshot → re-apply contentEditable → restart
 *    `observer.observe()`. The snapshot must be cloned every rollback
 *    so multiple rollbacks within a session stay independent.
 *
 * 4. **Init-failure fallback.** Parse failure (DOMParser throws / body
 *    is null / non-empty input parses to an empty body) calls
 *    `onInitFailed` exactly once and exits; the parent should switch
 *    to `html` mode. An **empty input** (`value.trim() === ""`) is
 *    *not* a failure — the host stays an empty container and the user
 *    can keep `inline` mode for a blank note (Issue #233 ADR-002).
 *
 * 5. **External `value` sync.** A change to `value` that did not
 *    originate from the editor itself rebuilds the DOM (with a fresh
 *    snapshot) so media inserts and external edits show up.
 *    `lastEmittedHtmlRef` guards the self-emit round-trip.
 *
 * 6. **`<pre>` is an opaque, highlight-on-blur region (Issue #498).**
 *    Syntax highlighting injects display-only `<span>`s into `<pre>`,
 *    which must never reach the saved HTML. `serializeHostContent`
 *    resets every `<pre>` to its plain text, `structureSignature` stops
 *    at `<pre>`, and `classifyRecords` allows span add/remove inside
 *    `<pre>` (and any mutation while `isHighlightingRef` is set). A
 *    `<pre>` is plain while focused (focusin strips its decoration so
 *    editing happens on a single text node — caret / IME stable) and
 *    re-highlighted on focusout (caret offset saved → re-decorate →
 *    restored; suppressed during IME composition).
 *
 * 7. **Tab / Escape inside `<pre>` (Issue #498 ADR-004).** Tab inserts
 *    two spaces (text-only); Shift+Tab removes up to two leading spaces
 *    from the caret's line; Escape blurs the focused element to leave the
 *    contentEditable focus trap (and triggers focusout re-highlight).
 *    Outside `<pre>`, Tab is still prevented so focus cannot escape.
 *
 * Styling: the host element wears the existing `.note-detail-content`
 * class so the editing view reuses the read-only view's typographic
 * styles (Issue #233 ADR-007). The class is the lone documented
 * exception under `app/styles/index.css` `@layer components` because
 * descendant elements injected via DOM mutation can't carry Tailwind
 * utilities. See `.issue/70/adr.md` ADR-002.
 */
export type InlineEditorProps = Readonly<{
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /**
   * Called once when init cannot produce an editable DOM — i.e. the
   * `DOMParser` throws, the parsed `body` is `null`, or a non-empty
   * input parses to an empty body. The parent is expected to
   * immediately switch the editor mode (e.g. dispatch `setMode →
   * "html"`), which causes this component to unmount. `InlineEditor`
   * does not retry init by itself; the internal once-only ref guards
   * against double-fire if the parent stalls the unmount and props
   * re-render arrives in the meantime.
   */
  onInitFailed?: () => void;
}>;

const EDITABLE_TAGS: ReadonlySet<string> = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "caption",
  "dt",
  "dd",
  "pre",
]);

const ONCHANGE_DEBOUNCE_MS = 50;

function isEditableTag(el: Element): boolean {
  return EDITABLE_TAGS.has(el.tagName.toLowerCase());
}

/** True if any of `el`'s direct children is a non-blank text node. */
function hasDirectTextChild(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim().length > 0) return true;
    }
  }
  return false;
}

/**
 * The `<pre>` ancestor of `node` (inclusive), walking up to but not past
 * `host`, or `null` if none. `node` is typically the selection's
 * `anchorNode` — a TEXT_NODE under `<pre><code>` — so `closest` is
 * unavailable; we walk `parentNode` manually. A `null` node (no
 * selection) is safely `null`.
 */
function enclosingPre(node: Node | null, host: HTMLElement): Element | null {
  let current: Node | null = node;
  while (current !== null && current !== host) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as Element).tagName.toLowerCase() === "pre"
    ) {
      return current as Element;
    }
    current = current.parentNode;
  }
  return null;
}

/** True if `node` is `<pre>` or lives inside one (see {@link enclosingPre}). */
function isWithinPre(node: Node | null, host: HTMLElement): boolean {
  return enclosingPre(node, host) !== null;
}

/** Insert `text` as a literal text node at the current caret position. */
function insertTextAtCaret(host: HTMLElement, text: string): void {
  const selection = host.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = host.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Remove up to two leading spaces from the start of the caret's current
 * line inside `<pre>` (Shift+Tab dedent, Issue #498 ADR-004). Operates on
 * the whole code block's text via document-order offsets, so a prior
 * `Tab`/`Enter` that split the text into several nodes does not hide the
 * line start. Text-only in effect (it rewrites the
 * block's text and restores the caret); no-op when the line has no leading
 * space or the selection is unavailable.
 */
function dedentAtCaret(host: HTMLElement): void {
  const selection = host.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const pre = enclosingPre(range.startContainer, host);
  if (pre === null) return;
  const target = highlightTarget(pre);
  const caret = caretOffsetWithin(target);
  if (caret === null) return;
  const text = target.textContent ?? "";
  // Start of the caret's line. `slice(0, caret)` avoids `lastIndexOf`'s
  // negative-fromIndex clamp, which would wrongly return 0 (→ lineStart 1)
  // when `caret === 0` and the block begins with a newline.
  const lineStart = text.slice(0, caret).lastIndexOf("\n") + 1;
  let removable = 0;
  while (removable < 2 && text[lineStart + removable] === " ") removable += 1;
  if (removable === 0) return;
  const removedBeforeCaret = Math.min(
    removable,
    Math.max(0, caret - lineStart),
  );
  target.textContent =
    text.slice(0, lineStart) + text.slice(lineStart + removable);
  restoreCaretWithin(target, caret - removedBeforeCaret);
}

/** Resolve the `<code>` (if any) else the `<pre>` itself — the element
 * whose text is the source of truth for highlighting (Issue #498). */
function highlightTarget(pre: Element): Element {
  return pre.querySelector("code") ?? pre;
}

/**
 * Caret offset within `root`'s text content, counting characters in
 * document order. Returns `null` when the selection is outside `root`.
 * Used to restore the caret after the highlighter rebuilds a `<pre>`'s
 * descendants into spans (Issue #498).
 */
function caretOffsetWithin(root: Element): number | null {
  const selection = root.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const measure = root.ownerDocument.createRange();
  measure.selectNodeContents(root);
  measure.setEnd(range.startContainer, range.startOffset);
  return measure.toString().length;
}

/**
 * Place the caret at character `offset` within `root` (counting text in
 * document order). Falls back to the end of `root` when the offset cannot
 * be resolved (Issue #498 ADR-002).
 */
function restoreCaretWithin(root: Element, offset: number): void {
  const doc = root.ownerDocument;
  const selection = doc.getSelection();
  if (selection === null) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  const range = doc.createRange();
  while (node !== null) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  // Fallback: caret at the end of the target.
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function applyEditable(host: HTMLElement, enabled: boolean): void {
  const stack: Element[] = [host];
  while (stack.length > 0) {
    const el = stack.pop();
    if (el === undefined) break;
    for (const child of el.children) stack.push(child);
    if (el === host) continue;
    if (!isEditableTag(el)) continue;
    // Decorate the block when it has at least one direct text child;
    // a pure container of editable blocks (e.g. `<ul>` → `<li>`) needs
    // no decoration on itself because its descendants will be decorated
    // individually. The mixed case (text + nested editable block) is
    // covered by HTML5's contentEditable semantics — both can carry
    // `true` without conflict, and the outer text becomes editable.
    //
    // `<pre>` is the lone exception (Issue #285 ADR-001): the standard
    // `<pre><code>…</code></pre>` shape has no direct text child, so we
    // bypass the gate and always decorate `<pre>` — its nested `<code>`
    // text becomes editable via contentEditable inheritance.
    const isPre = el.tagName.toLowerCase() === "pre";
    if (!isPre && !hasDirectTextChild(el)) continue;
    if (enabled) {
      el.setAttribute("contenteditable", "true");
    } else {
      el.setAttribute("contenteditable", "false");
    }
  }
  // A second pass for purely-nested-block parents (e.g. `<blockquote>`
  // containing `<p>foo</p>` only) is intentionally omitted: the inner
  // `<p>` already gets editable on the first pass.
}

/** Strip every editable attribute we may have set, for a clean rebuild. */
function clearEditable(host: HTMLElement): void {
  const stack: Element[] = [host];
  while (stack.length > 0) {
    const el = stack.pop();
    if (el === undefined) break;
    for (const child of el.children) stack.push(child);
    if (el === host) continue;
    if (el.hasAttribute("contenteditable")) {
      el.removeAttribute("contenteditable");
    }
  }
}

/**
 * Serialize the host's current content for the `onChange` boundary,
 * stripped of `contenteditable` attributes we added at runtime. This
 * is the value that crosses into `state.contentHtml` and ultimately
 * the DB / read-only render — so the editor-only attribute must not
 * leak (W-F-003 from PR #282 review-001).
 */
function serializeHostContent(host: HTMLElement): string {
  const clone = host.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll("[contenteditable]")) {
    el.removeAttribute("contenteditable");
  }
  // `<pre>` is an opaque region (Issue #498 ADR-002): the highlighter
  // injects display-only `<span>`s that must never leak into the saved
  // HTML. Reset each `<pre>` to its plain text so the persisted form is
  // always a clean `<pre><code>text</code></pre>` / `<pre>text</pre>`.
  // `querySelectorAll("pre")` (not `pre code`) covers the bare-`<pre>`
  // shape too (#285 ADR-001).
  for (const pre of clone.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    const target = code ?? pre;
    target.textContent = target.textContent ?? "";
  }
  return clone.innerHTML;
}

/**
 * Build a deterministic tag-tree signature for structural comparison
 * (used by `compositionend` to detect drift). Comparison-only — the
 * returned string MUST NOT be re-injected as innerHTML, since attribute
 * values are not escaped here.
 */
function structureSignature(root: Element | DocumentFragment): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      parts.push(`<${tag}`);
      // Sort attributes for deterministic comparison; skip contenteditable
      // since we add/remove it dynamically.
      const attrs = Array.from(el.attributes)
        .filter((a) => a.name !== "contenteditable")
        .map((a) => `${a.name}="${a.value}"`)
        .sort();
      for (const a of attrs) parts.push(` ${a}`);
      parts.push(">");
      // `<pre>` is opaque (Issue #498 ADR-002): the highlighter mutates
      // its descendants (span add/remove), so do not descend — otherwise
      // the signature would drift purely from decoration and fire a false
      // compositionend rollback.
      if (tag !== "pre") {
        for (const child of el.childNodes) walk(child);
      }
      parts.push(`</${tag}>`);
    }
  };
  for (const child of root.childNodes) walk(child);
  return parts.join("");
}

type Mutability = { kind: "allowed" } | { kind: "rollback" };

function classifyRecords(
  records: readonly MutationRecord[],
  isComposing: boolean,
  host: HTMLElement,
  isHighlighting: boolean,
): Mutability {
  // While we are re-highlighting a `<pre>` (Issue #498), the span churn
  // we inject is self-driven and always allowed.
  if (isHighlighting) return { kind: "allowed" };
  for (const r of records) {
    if (r.type === "characterData") continue;
    // `<pre>` is an opaque region (Issue #498 ADR-002): the highlighter's
    // span add/remove inside a `<pre>` is display-only and never reaches
    // the saved HTML (serialize normalizes it), so allow it. The
    // exception is confined to within `<pre>`; structure protection
    // outside `<pre>` is unchanged.
    if (isWithinPre(r.target, host)) continue;
    if (r.type === "childList") {
      if (isComposing) continue;
      const target = r.target;
      if (target.nodeType !== Node.ELEMENT_NODE) return { kind: "rollback" };
      const targetEl = target as HTMLElement;
      if (!targetEl.isContentEditable) return { kind: "rollback" };
      const onlyText = (list: NodeList) => {
        for (const n of list) {
          if (n.nodeType !== Node.TEXT_NODE) return false;
        }
        return true;
      };
      if (!onlyText(r.addedNodes)) return { kind: "rollback" };
      if (!onlyText(r.removedNodes)) return { kind: "rollback" };
      continue;
    }
    if (r.type === "attributes") {
      if (isComposing) continue;
      return { kind: "rollback" };
    }
  }
  return { kind: "allowed" };
}

export function InlineEditor({
  value,
  onChange,
  disabled,
  onInitFailed,
}: InlineEditorProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const snapshotRef = useRef<HTMLBodyElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const isComposingRef = useRef(false);
  // True while we re-decorate a `<pre>` so the observer ignores the
  // self-driven span churn (Issue #498).
  const isHighlightingRef = useRef(false);
  const lastEmittedHtmlRef = useRef<string>(value);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initFailedFiredRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onInitFailedRef = useRef(onInitFailed);
  const disabledRef = useRef(disabled === true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInitFailedRef.current = onInitFailed;
  }, [onInitFailed]);

  useEffect(() => {
    disabledRef.current = disabled === true;
  }, [disabled]);

  // Single effect owns the DOM lifecycle: mount, value-resync, and
  // teardown. `disabled` is handled in its own effect that toggles the
  // contenteditable attributes in place — no rebuild needed.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    if (value === lastEmittedHtmlRef.current && host.childNodes.length > 0) {
      // Self-emit round-trip; nothing to do.
      return;
    }

    // Tear down any prior observer / DOM before rebuilding.
    if (observerRef.current !== null) {
      observerRef.current.disconnect();
      observerRef.current.takeRecords();
      observerRef.current = null;
    }
    host.replaceChildren();

    // Parse the saved HTML. Failure → onInitFailed exactly once.
    let body: HTMLBodyElement | null = null;
    try {
      const parsed = new DOMParser().parseFromString(value, "text/html");
      body = parsed.body as HTMLBodyElement | null;
    } catch {
      if (!initFailedFiredRef.current) {
        initFailedFiredRef.current = true;
        onInitFailedRef.current?.();
      }
      return;
    }
    if (body === null) {
      if (!initFailedFiredRef.current) {
        initFailedFiredRef.current = true;
        onInitFailedRef.current?.();
      }
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 && body.childNodes.length === 0) {
      // Empty note: keep an empty host but stay in inline mode (ADR-002).
      lastEmittedHtmlRef.current = value;
      return;
    }
    if (trimmed.length > 0 && body.childNodes.length === 0) {
      if (!initFailedFiredRef.current) {
        initFailedFiredRef.current = true;
        onInitFailedRef.current?.();
      }
      return;
    }

    snapshotRef.current = body.cloneNode(true) as HTMLBodyElement;
    host.replaceChildren(...Array.from(body.childNodes));
    applyEditable(host, !disabledRef.current);
    lastEmittedHtmlRef.current = serializeHostContent(host);

    const emit = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (isComposingRef.current) return;
        const next = serializeHostContent(host);
        if (next === lastEmittedHtmlRef.current) return;
        lastEmittedHtmlRef.current = next;
        onChangeRef.current(next);
      }, ONCHANGE_DEBOUNCE_MS);
    };

    const rollback = () => {
      const snap = snapshotRef.current;
      if (snap === null) return;
      const obs = observerRef.current;
      if (obs !== null) {
        obs.disconnect();
        obs.takeRecords();
      }
      host.replaceChildren();
      const fresh = snap.cloneNode(true) as HTMLBodyElement;
      host.replaceChildren(...Array.from(fresh.childNodes));
      applyEditable(host, !disabledRef.current);
      lastEmittedHtmlRef.current = serializeHostContent(host);
      if (obs !== null) {
        obs.observe(host, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
      }
      // Re-decorate after restoring the plain snapshot (Issue #498).
      highlightAll();
    };

    // Re-decorate one `<pre>` (Issue #498). Highlighting is display-only;
    // editing always happens on plain text, so this runs on mount /
    // resync / focusout, never while the block is focused.
    // `isHighlightingRef` suppresses the observer's self-trigger. The
    // caret offset (relative to the block's text) is saved before and
    // restored after so a focus move between blocks keeps the caret.
    const highlightPre = async (pre: Element) => {
      // Keep shiki out of the Workers (SSR/RSC) bundle — Vite tree-shakes
      // this branch for the SSR targets so the dynamic import and its
      // chunks never reach `dist/server` (Issue #498 ADR-005).
      if (import.meta.env.SSR) return;
      if (disabledRef.current) return;
      if (isComposingRef.current) return;
      const target = highlightTarget(pre);
      const caretOffset = caretOffsetWithin(target);
      isHighlightingRef.current = true;
      try {
        const { highlightCodeElement } = await import(
          "@/components/note/content/highlighter"
        );
        await highlightCodeElement(target);
      } catch {
        // best-effort: a load failure leaves the block plain.
      } finally {
        if (observerRef.current !== null) observerRef.current.takeRecords();
        isHighlightingRef.current = false;
      }
      // Only restore the caret while this block still holds focus. On the
      // focusout path (Esc / click away) the user has intentionally left,
      // so re-adding a selection here would steal focus / scroll the block
      // back into view.
      if (
        caretOffset !== null &&
        target.contains(host.ownerDocument.activeElement)
      ) {
        restoreCaretWithin(target, caretOffset);
      }
    };

    const highlightAll = () => {
      for (const pre of host.querySelectorAll("pre")) void highlightPre(pre);
    };

    const observer = new MutationObserver((records) => {
      const verdict = classifyRecords(
        records,
        isComposingRef.current,
        host,
        isHighlightingRef.current,
      );
      if (verdict.kind === "rollback") {
        rollback();
        return;
      }
      emit();
    });
    observerRef.current = observer;
    observer.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        // Always prevent the browser default so it cannot grow new
        // blocks (`<br>` / `<div>`) that would be rolled back as
        // structural drift. Inside `<pre>` we substitute a literal `\n`
        // text node so the change stays text-only (Issue #285 ADR-002).
        e.preventDefault();
        const anchor = host.ownerDocument.getSelection()?.anchorNode ?? null;
        if (isWithinPre(anchor, host)) {
          insertTextAtCaret(host, "\n");
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const anchor = host.ownerDocument.getSelection()?.anchorNode ?? null;
        if (!isWithinPre(anchor, host)) {
          // Outside `<pre>`: keep focus from escaping to the next block
          // (Issue #285 ADR-003).
          return;
        }
        if (e.shiftKey) {
          dedentAtCaret(host);
        } else {
          // Indent with two spaces (Issue #498 ADR-004). Text-only so the
          // structure-rollback invariant holds.
          insertTextAtCaret(host, "  ");
        }
        return;
      }
      if (e.key === "Escape") {
        // Escape the contentEditable focus trap from inside `<pre>`
        // (Issue #498 ADR-004). `blur()` fires focusout → re-highlight.
        const anchor = host.ownerDocument.getSelection()?.anchorNode ?? null;
        if (isWithinPre(anchor, host)) {
          e.preventDefault();
          const active = host.ownerDocument.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          } else {
            host.blur();
          }
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text.length === 0) return;
      insertTextAtCaret(host, text);
    };

    const onCompositionStart = () => {
      isComposingRef.current = true;
    };

    const onCompositionEnd = () => {
      // Order matters (ADR-003 / step 4-3): flush observer records,
      // compare structure, rollback if needed, *then* clear the
      // composing flag so the trailing `input` event that fires right
      // after compositionend is still evaluated under "composing=true"
      // semantics for the classification of that very batch.
      if (observerRef.current !== null) {
        const pending = observerRef.current.takeRecords();
        if (pending.length > 0) {
          const verdict = classifyRecords(
            pending,
            true,
            host,
            isHighlightingRef.current,
          );
          if (verdict.kind === "rollback") {
            rollback();
            isComposingRef.current = false;
            return;
          }
        }
      }
      const snap = snapshotRef.current;
      if (snap !== null) {
        const currentSig = structureSignature(host);
        const snapSig = structureSignature(snap);
        if (currentSig !== snapSig) {
          rollback();
          isComposingRef.current = false;
          return;
        }
      }
      isComposingRef.current = false;
      emit();
    };

    const onInput = () => {
      // MutationObserver drives the emit path; the explicit `input`
      // listener exists so future browsers that batch DOM mutations
      // differently still trigger debounced onChange. The classifier
      // already filters out structural changes.
      emit();
    };

    // Issue #498: a `<pre>` is plain while focused and highlighted while
    // not. On focusin, strip the decoration of the focused block back to
    // plain text so editing happens on a single text node (caret / IME
    // stable). On focusout, re-highlight that block.
    const preOf = (node: EventTarget | null): Element | null => {
      let current = node instanceof Node ? node : null;
      while (current !== null && current !== host) {
        if (
          current.nodeType === Node.ELEMENT_NODE &&
          (current as Element).tagName.toLowerCase() === "pre"
        ) {
          return current as Element;
        }
        current = current.parentNode;
      }
      return null;
    };

    const onFocusIn = (e: FocusEvent) => {
      const pre = preOf(e.target);
      if (pre === null) return;
      const target = highlightTarget(pre);
      if (target.querySelector("span") === null) return;
      // Preserve the click/caret position: stripping the spans destroys
      // the text node the caret sits in, so save its offset and restore
      // it on the rebuilt single text node (Issue #498).
      const caretOffset = caretOffsetWithin(target);
      const plain = target.textContent ?? "";
      isHighlightingRef.current = true;
      target.textContent = plain;
      if (observerRef.current !== null) observerRef.current.takeRecords();
      isHighlightingRef.current = false;
      if (caretOffset !== null) restoreCaretWithin(target, caretOffset);
    };

    const onFocusOut = (e: FocusEvent) => {
      const pre = preOf(e.target);
      if (pre === null) return;
      // Skip when focus moved to another node within the same `<pre>`.
      const next = e.relatedTarget;
      if (next instanceof Node && pre.contains(next)) return;
      void highlightPre(pre);
    };

    host.addEventListener("keydown", onKeyDown);
    host.addEventListener("paste", onPaste);
    host.addEventListener("compositionstart", onCompositionStart);
    host.addEventListener("compositionend", onCompositionEnd);
    host.addEventListener("input", onInput);
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);

    // Decorate all code blocks once the DOM is in place.
    highlightAll();

    return () => {
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("paste", onPaste);
      host.removeEventListener("compositionstart", onCompositionStart);
      host.removeEventListener("compositionend", onCompositionEnd);
      host.removeEventListener("input", onInput);
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
      if (observerRef.current !== null) {
        observerRef.current.disconnect();
        observerRef.current.takeRecords();
        observerRef.current = null;
      }
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      host.replaceChildren();
    };
    // `disabled` is intentionally NOT in the dep list: it is handled by
    // the dedicated effect below to avoid a full rebuild on toggle.
  }, [value]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const obs = observerRef.current;
    // Pause the observer while we flip `contenteditable` on the
    // existing nodes — otherwise the `attributes` mutation would be
    // classified as "structural drift" and trigger a rollback that
    // immediately re-applies the previous editable state.
    if (obs !== null) {
      obs.disconnect();
      obs.takeRecords();
    }
    if (disabled === true) {
      clearEditable(host);
    } else {
      applyEditable(host, true);
    }
    lastEmittedHtmlRef.current = serializeHostContent(host);
    if (obs !== null) {
      obs.observe(host, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
  }, [disabled]);

  return (
    <div className="mt-4">
      <section
        ref={hostRef}
        aria-label="ノート本文"
        data-disabled={disabled === true || undefined}
        className="note-detail-content min-h-[320px] rounded-md border border-hairline bg-bg p-4 text-base leading-relaxed focus-within:border-accent data-[disabled]:opacity-disabled data-[disabled]:cursor-not-allowed"
      />
    </div>
  );
}
