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
 *    so the user can edit decorated text in place. Tags outside the
 *    allow-list (notably `<pre>`) stay read-only — code-block editing
 *    is delegated to the `html` mode.
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
    if (!hasDirectTextChild(el)) continue;
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

/** Quick structural signature: tag tree, ignoring text content. */
function structureSignature(root: Element | DocumentFragment): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      parts.push(`<${el.tagName.toLowerCase()}`);
      // Sort attributes for deterministic comparison; skip contenteditable
      // since we add/remove it dynamically.
      const attrs = Array.from(el.attributes)
        .filter((a) => a.name !== "contenteditable")
        .map((a) => `${a.name}="${a.value}"`)
        .sort();
      for (const a of attrs) parts.push(` ${a}`);
      parts.push(">");
      for (const child of el.childNodes) walk(child);
      parts.push(`</${el.tagName.toLowerCase()}>`);
    }
  };
  for (const child of root.childNodes) walk(child);
  return parts.join("");
}

type Mutability = { kind: "allowed" } | { kind: "rollback" };

function classifyRecords(
  records: readonly MutationRecord[],
  isComposing: boolean,
): Mutability {
  for (const r of records) {
    if (r.type === "characterData") continue;
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<HTMLBodyElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const isComposingRef = useRef(false);
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
    lastEmittedHtmlRef.current = host.innerHTML;

    const emit = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (isComposingRef.current) return;
        const next = host.innerHTML;
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
      lastEmittedHtmlRef.current = host.innerHTML;
      if (obs !== null) {
        obs.observe(host, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
      }
    };

    const observer = new MutationObserver((records) => {
      const verdict = classifyRecords(records, isComposingRef.current);
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
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text.length === 0) return;
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
          const verdict = classifyRecords(pending, true);
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

    host.addEventListener("keydown", onKeyDown);
    host.addEventListener("paste", onPaste);
    host.addEventListener("compositionstart", onCompositionStart);
    host.addEventListener("compositionend", onCompositionEnd);
    host.addEventListener("input", onInput);

    return () => {
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("paste", onPaste);
      host.removeEventListener("compositionstart", onCompositionStart);
      host.removeEventListener("compositionend", onCompositionEnd);
      host.removeEventListener("input", onInput);
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment
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
    lastEmittedHtmlRef.current = host.innerHTML;
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
      <div
        ref={hostRef}
        data-disabled={disabled === true || undefined}
        className="note-detail-content min-h-[320px] rounded-md border border-hairline bg-bg p-4 text-base leading-relaxed focus-within:border-accent data-[disabled]:opacity-60 data-[disabled]:cursor-not-allowed"
      />
    </div>
  );
}
