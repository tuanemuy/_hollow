"use client";

import { useServerFn } from "@tanstack/react-start";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import {
  type Editor,
  EditorContent,
  ReactRenderer,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { searchInternalLinkTargetsFn } from "@/components/note/actions";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import { InternalLinkSuggestPopup } from "./InternalLinkSuggestPopup";
import { buildInternalLinkMention } from "./internalLinkExtension";
import { nextSuggestionIndex } from "./internalLinkSuggest";
import { detectUnsupportedTags } from "./wysiwygUnsupportedTags";

/**
 * WYSIWYG pane backed by TipTap (P12 / Issue #9). Mirrors `HtmlEditor`'s
 * `{ value, onChange, disabled }` I/O contract so `NoteEditor.tsx` can
 * swap the rendered pane based on `state.mode` without touching the
 * surrounding autosave / submit / edit-lock plumbing.
 *
 * Important constraints:
 *
 * - `immediatelyRender: false` is mandatory under React 19 / RSC to
 *   avoid hydration mismatches — `<EditorContent />` SSRs an empty
 *   `<div>` and the editor mounts on the client only.
 * - `onChange` is dispatched through a `useRef` "latest-ref" because
 *   TipTap's `useEditor` captures the initial closure for `onUpdate`.
 *   Calling props.onChange directly from `onUpdate` would freeze callers
 *   that read other state.
 * - `lastEmittedHtmlRef` filters `onUpdate` events whose payload equals
 *   the most recent value we've either emitted or accepted from the
 *   parent. This guards against two real failure modes: (a) the initial
 *   parse-normalisation tick fires `onUpdate` even though the user
 *   hasn't typed, and (b) our own `setContent` round-trips bouncing
 *   back as fresh `onChange` calls.
 * - External `value` changes are mirrored back into the editor via
 *   `editor.commands.setContent(value, { emitUpdate: false })`. The
 *   `emitUpdate: false` flag is essential: without it the `onUpdate`
 *   callback would re-fire `onChange(value)` and create an infinite
 *   loop. The `editor.getHTML() !== value` guard skips the round-trip
 *   when the editor is already in sync.
 * - `editorRef` exposes the live `Editor` instance to the parent so
 *   media insertion can target the current selection (ADR-003). The
 *   ref is cleared on unmount to prevent stale-pointer dispatch.
 *
 * StarterKit (v3) bundles Link by default; we disable that and add the
 * Link extension explicitly to control `openOnClick`, `autolink`,
 * `isAllowedUri` (matches the server-side `SAFE_URL_SCHEMES` so the
 * editor cannot display URLs that the sanitiser would strip), and the
 * `rel="noopener noreferrer"` attribute. Image lives in a separate
 * package (`@tiptap/extension-image`) and is configured to reject base64
 * payloads so only `/media/<id>` URLs make it into the document
 * (ADR-009 carry-over).
 *
 * The four unsupported-tag props (`unsupportedTags`, `unsupportedAck`,
 * `onUnsupportedTagsDetected`, `onAcknowledge`) form one cohesive
 * feature contract (Issue #37). They are individually optional only so
 * callers that do not opt into the warning UI can omit the whole set;
 * pass them as a group or not at all. Partial wiring (e.g. omitting
 * `onAcknowledge`) leaves the "了解した" button as a no-op and stalls
 * autosave indefinitely.
 */
export type WysiwygEditorProps = Readonly<{
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  editorRef?: React.RefObject<Editor | null>;
  /**
   * Names of element tags present in `value` that fall outside the
   * TipTap-supported set (Issue #37). Drives the inline warning banner.
   */
  unsupportedTags?: readonly string[];
  /** Whether the user has acknowledged the unsupported-tag warning. */
  unsupportedAck?: boolean;
  /**
   * Fired once on initial mount with the tags `detectUnsupportedTags`
   * found in the *original* `value`. Detection deliberately runs only
   * inside `onCreate` — see ADR-005 for why later re-detection (against
   * a `value` that TipTap may already have flattened) is unsafe.
   *
   * The reducer compares incoming sets with `setsEqual`, so dispatching
   * the same tag set after an `unsupportedAck` toggle preserves the ack
   * state (ADR-003). This lets the WYSIWYG editor remount-and-redetect
   * without spuriously resetting acknowledgement.
   */
  onUnsupportedTagsDetected?: (tags: readonly string[]) => void;
  /** Acknowledge callback for the "了解した" button. */
  onAcknowledge?: () => void;
}>;

const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto"]);

function isAllowedLinkUri(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return ALLOWED_LINK_SCHEMES.has(parsed.protocol.replace(/:$/, ""));
  } catch {
    return false;
  }
}

export function WysiwygEditor({
  value,
  onChange,
  disabled,
  editorRef,
  unsupportedTags,
  unsupportedAck,
  onUnsupportedTagsDetected,
  onAcknowledge,
}: WysiwygEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastEmittedHtmlRef = useRef<string>(value);

  const [, forceRender] = useState(0);

  // The `[[` internal-link suggest plugin is wired through the Mention
  // extension's Suggestion host. Two cross-cutting concerns are handled
  // here so the rest of the editor stays untouched:
  //
  // 1. The `searchSuggestions` server-fn reference must be re-read on
  //    every invocation. `useEditor` with no `deps` argument does not
  //    re-create the editor on `extensions` identity change, but it does
  //    call `setOptions` on every render — that path re-evaluates each
  //    extension's `configure()` and re-instantiates ProseMirror plugins.
  //    More importantly, the closure inside the `useMemo([])` block
  //    below would freeze on the first `searchSuggestions` reference and
  //    silently miss future server-fn refreshes. We pin the latest fn in
  //    a ref and read it from the items callback so the memoised glue
  //    keeps working with a stable identity (Issue #36 P-004).
  // 2. The popup is rendered through `ReactRenderer` + a manual
  //    `document.body.appendChild` (ADR-003) so we avoid pulling in
  //    `tippy.js` as an extra dependency.
  const searchSuggestions = useServerFn(searchInternalLinkTargetsFn);
  const searchSuggestionsRef = useRef(searchSuggestions);
  useEffect(() => {
    searchSuggestionsRef.current = searchSuggestions;
  }, [searchSuggestions]);

  const suggestionGlue = useMemo(() => {
    // Single-flight debounce: a fresh keypress cancels the pending
    // timer and aborts any in-flight request before scheduling the
    // next one. 100ms keeps perceived latency low while suppressing
    // the high-frequency D1 LIKE queries that naive per-keystroke
    // dispatch would produce (Issue #36 S-003).
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingAbort: AbortController | null = null;
    return {
      items: ({ query }: { query: string }) =>
        new Promise<InternalLinkSuggestion[]>((resolve) => {
          if (pendingTimeout !== null) clearTimeout(pendingTimeout);
          if (pendingAbort !== null) pendingAbort.abort();
          const trimmed = query.trim();
          if (trimmed.length === 0) {
            resolve([]);
            return;
          }
          const ctrl = new AbortController();
          pendingAbort = ctrl;
          pendingTimeout = setTimeout(async () => {
            try {
              const { suggestions } = await searchSuggestionsRef.current({
                data: { query: trimmed, limit: 8 },
                signal: ctrl.signal,
              });
              if (!ctrl.signal.aborted) {
                resolve([...suggestions] as InternalLinkSuggestion[]);
              }
            } catch {
              if (!ctrl.signal.aborted) resolve([]);
            }
          }, 100);
        }),
      render: () => {
        let renderer: ReactRenderer | null = null;
        let selectedIndex = 0;
        let items: readonly InternalLinkSuggestion[] = [];
        let clientRect: (() => DOMRect | null) | null | undefined = null;
        let commandRef: ((item: InternalLinkSuggestion) => void) | null = null;
        const computePos = () => {
          const rect = clientRect?.() ?? null;
          if (rect === null) return { left: 0, top: 0 };
          return {
            left: rect.left + window.scrollX,
            top: rect.bottom + window.scrollY + 4,
          };
        };
        const buildProps = () => ({
          items,
          selectedIndex,
          onSelect: (item: InternalLinkSuggestion) => commandRef?.(item),
          onHover: (idx: number) => {
            selectedIndex = idx;
            renderer?.updateProps(buildProps());
          },
          position: computePos(),
        });
        const teardown = () => {
          if (renderer === null) return;
          renderer.element.remove();
          renderer.destroy();
          renderer = null;
        };
        return {
          onStart: (
            props: SuggestionProps<
              InternalLinkSuggestion,
              InternalLinkSuggestion
            >,
          ) => {
            items = props.items;
            selectedIndex = 0;
            clientRect = props.clientRect;
            commandRef = props.command;
            renderer = new ReactRenderer(InternalLinkSuggestPopup, {
              props: buildProps(),
              editor: props.editor,
            });
            document.body.appendChild(renderer.element);
          },
          onUpdate: (
            props: SuggestionProps<
              InternalLinkSuggestion,
              InternalLinkSuggestion
            >,
          ) => {
            items = props.items;
            clientRect = props.clientRect;
            commandRef = props.command;
            if (selectedIndex >= items.length) selectedIndex = 0;
            renderer?.updateProps(buildProps());
          },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (event.key === "ArrowDown") {
              selectedIndex = nextSuggestionIndex(
                selectedIndex,
                "down",
                items.length,
              );
              renderer?.updateProps(buildProps());
              return true;
            }
            if (event.key === "ArrowUp") {
              selectedIndex = nextSuggestionIndex(
                selectedIndex,
                "up",
                items.length,
              );
              renderer?.updateProps(buildProps());
              return true;
            }
            if (event.key === "Enter") {
              const item = items[selectedIndex];
              if (item !== undefined) commandRef?.(item);
              return true;
            }
            if (event.key === "Escape") {
              teardown();
              return true;
            }
            return false;
          },
          onExit: () => {
            teardown();
          },
        };
      },
    };
    // Initialise once — `searchSuggestionsRef` keeps the latest server-fn
    // reachable without making `extensions` reference-unstable. See the
    // header comment for the editor-recreation rationale.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
        isAllowedUri: (url) => isAllowedLinkUri(url),
      }),
      Image.configure({ inline: false, allowBase64: false }),
      buildInternalLinkMention(suggestionGlue),
    ],
    content: value,
    editable: disabled !== true,
    onCreate: ({ editor: instance }) => {
      // TipTap normalises content through the ProseMirror schema
      // ("" → "<p></p>", "<P>X</P>" → "<p>X</p>", …). Seed the guard
      // with the canonical post-parse HTML so the very first onUpdate
      // — fired on initial render in some TipTap builds — does not
      // mis-classify the normalisation as user input.
      lastEmittedHtmlRef.current = instance.getHTML();
      // Detect unsupported tags against the *original* `value` captured
      // by this closure on mount — `instance.getHTML()` is already the
      // post-parse (lossy) form. Detection runs exactly here so that
      // user keystrokes flowing through `onUpdate` cannot retroactively
      // erase the warning (ADR-005).
      const lost = detectUnsupportedTags(value);
      if (lost.length > 0) {
        onUnsupportedTagsDetected?.(lost);
      }
    },
    onUpdate: ({ editor: instance }) => {
      const next = instance.getHTML();
      if (lastEmittedHtmlRef.current === next) return;
      lastEmittedHtmlRef.current = next;
      onChangeRef.current(next);
    },
    onSelectionUpdate: () => {
      forceRender((n) => n + 1);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor === null) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
    // `setContent` may normalise the incoming HTML through the
    // ProseMirror schema, so the editor's canonical form can differ
    // from `value`. Pin the guard to the post-parse HTML so any later
    // `onUpdate` that fires with the normalised form is filtered out
    // as a self-emit rather than mis-routed to `onChange`.
    lastEmittedHtmlRef.current = editor.getHTML();
  }, [editor, value]);

  useEffect(() => {
    if (editor === null) return;
    editor.setEditable(disabled !== true);
  }, [editor, disabled]);

  useEffect(() => {
    if (editorRef === undefined) return;
    editorRef.current = editor ?? null;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  const isReady = editor !== null;
  const isDisabled = disabled === true || !isReady;

  const onAddLink = () => {
    if (editor === null) return;
    const previousHref = editor.getAttributes("link").href as
      | string
      | undefined;
    const url = window.prompt("リンク URL", previousHref ?? "https://");
    if (url === null) return;
    if (url.length === 0) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!isAllowedLinkUri(url)) {
      window.alert(
        "対応していない URL スキームです (http / https / mailto / 相対 URL のみ)",
      );
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  type FormatButton = Readonly<{
    label: string;
    ariaLabel: string;
    isActive: () => boolean;
    onClick: () => void;
  }>;

  const buttons: readonly FormatButton[] =
    editor === null
      ? []
      : [
          {
            label: "Bold",
            ariaLabel: "太字",
            isActive: () => editor.isActive("bold"),
            onClick: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            ariaLabel: "斜体",
            isActive: () => editor.isActive("italic"),
            onClick: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: "Strike",
            ariaLabel: "取り消し線",
            isActive: () => editor.isActive("strike"),
            onClick: () => editor.chain().focus().toggleStrike().run(),
          },
          {
            label: "H2",
            ariaLabel: "見出し 2",
            isActive: () => editor.isActive("heading", { level: 2 }),
            onClick: () =>
              editor.chain().focus().toggleHeading({ level: 2 }).run(),
          },
          {
            label: "H3",
            ariaLabel: "見出し 3",
            isActive: () => editor.isActive("heading", { level: 3 }),
            onClick: () =>
              editor.chain().focus().toggleHeading({ level: 3 }).run(),
          },
          {
            label: "UL",
            ariaLabel: "箇条書き",
            isActive: () => editor.isActive("bulletList"),
            onClick: () => editor.chain().focus().toggleBulletList().run(),
          },
          {
            label: "OL",
            ariaLabel: "番号付きリスト",
            isActive: () => editor.isActive("orderedList"),
            onClick: () => editor.chain().focus().toggleOrderedList().run(),
          },
          {
            label: "Quote",
            ariaLabel: "引用",
            isActive: () => editor.isActive("blockquote"),
            onClick: () => editor.chain().focus().toggleBlockquote().run(),
          },
          {
            label: "Code",
            ariaLabel: "インラインコード",
            isActive: () => editor.isActive("code"),
            onClick: () => editor.chain().focus().toggleCode().run(),
          },
        ];

  const lostTags = unsupportedTags ?? [];
  const hasUnsupported = lostTags.length > 0;
  const isAcked = unsupportedAck === true;

  const renderTagList = () =>
    lostTags.map((t, i) => (
      <Fragment key={t}>
        {i > 0 ? ", " : ""}
        <code>{`<${t}>`}</code>
      </Fragment>
    ));

  return (
    <div className="wysiwyg-editor">
      {hasUnsupported ? (
        <div
          className={
            isAcked
              ? "wysiwyg-unsupported-notice"
              : "wysiwyg-unsupported-banner"
          }
          role={isAcked ? "note" : "alert"}
        >
          {isAcked ? (
            <p>
              以下の要素は WYSIWYG モードでは保持されません: {renderTagList()}
            </p>
          ) : (
            <>
              <p>
                この本文には WYSIWYG モードで編集できない要素 ({renderTagList()}
                ) が含まれています。WYSIWYG
                モードで編集を加えると失われます。確認するまで自動保存は一時停止します。
              </p>
              <button
                type="button"
                className="pill-btn primary"
                onClick={() => {
                  onAcknowledge?.();
                  editor?.commands.focus();
                }}
              >
                了解した
              </button>
            </>
          )}
        </div>
      ) : null}
      <div className="wysiwyg-toolbar" role="toolbar" aria-label="書式">
        {buttons.map((btn) => {
          const active = btn.isActive();
          return (
            <button
              key={btn.label}
              type="button"
              aria-label={btn.ariaLabel}
              aria-pressed={active}
              className={`pill-btn${active ? " primary" : ""}`}
              disabled={isDisabled}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="リンク"
          aria-pressed={editor?.isActive("link") ?? false}
          className={`pill-btn${editor?.isActive("link") === true ? " primary" : ""}`}
          disabled={isDisabled}
          onClick={onAddLink}
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
