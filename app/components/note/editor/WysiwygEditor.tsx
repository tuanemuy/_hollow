"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

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
 */
export type WysiwygEditorProps = Readonly<{
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  editorRef?: React.RefObject<Editor | null>;
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
}: WysiwygEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastEmittedHtmlRef = useRef<string>(value);

  const [, forceRender] = useState(0);

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
    ],
    content: value,
    editable: disabled !== true,
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
    lastEmittedHtmlRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
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

  return (
    <div className="wysiwyg-editor">
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
