"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

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
 * Link extension explicitly to control `openOnClick`, `autolink`, and
 * the `rel="noopener noreferrer"` attribute. Image lives in a separate
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

export function WysiwygEditor({
  value,
  onChange,
  disabled,
  editorRef,
}: WysiwygEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value,
    editable: disabled !== true,
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor === null) return;
    if (editor.getHTML() === value) return;
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
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="wysiwyg-editor">
      <div className="wysiwyg-toolbar" role="toolbar" aria-label="書式">
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          Strike
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          H3
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          UL
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          OL
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isDisabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          Code
        </button>
        <button
          type="button"
          className="pill-btn"
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
