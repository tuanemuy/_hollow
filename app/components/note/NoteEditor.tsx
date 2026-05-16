"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { createNoteFn, saveNoteFn } from "./actions";

// Minimal editor: title + HTML textarea + tag list. WYSIWYG / TipTap are
// out of scope for this milestone — see spec/pages/index.md P12 for the
// full target spec. Existing markup is round-tripped as-is through the
// sanitizer-on-save path inside `SaveNote` / `CreateNote`.

type Props =
  | {
      mode: "new";
    }
  | {
      mode: "edit";
      noteId: string;
      initialTitle: string;
      initialContentHtml: string;
      initialTagNames: readonly string[];
    };

export function NoteEditor(props: Props) {
  const router = useRouter();
  const createNote = useServerFn(createNoteFn);
  const saveNote = useServerFn(saveNoteFn);

  const [title, setTitle] = useState(
    props.mode === "edit" ? props.initialTitle : "",
  );
  const [content, setContent] = useState(
    props.mode === "edit" ? props.initialContentHtml : "",
  );
  const [tagInput, setTagInput] = useState(
    props.mode === "edit" ? props.initialTagNames.join(", ") : "",
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const titleId = useId();
  const contentId = useId();
  const tagsId = useId();

  const parseTags = (raw: string): readonly string[] =>
    raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tagNames = parseTags(tagInput);
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "new") {
          const result = await createNote({
            data: {
              title,
              contentHtml: content,
              directoryId: null,
              tagNames,
            },
          });
          await router.navigate({
            to: "/notes/$noteId",
            params: { noteId: result.noteId },
          });
        } else {
          await saveNote({
            data: {
              noteId: props.noteId,
              title,
              contentHtml: content,
              tagNames,
            },
          });
          await router.invalidate();
          await router.navigate({
            to: "/notes/$noteId",
            params: { noteId: props.noteId },
          });
        }
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <h1 className="page-title">
        {props.mode === "new" ? "新規ノート" : "ノートを編集"}
      </h1>
      <div className="field">
        <label htmlFor={titleId}>タイトル</label>
        <input
          id={titleId}
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="無題のノート"
          maxLength={200}
          disabled={isPending}
        />
      </div>
      <div className="field">
        <label htmlFor={tagsId}>タグ（カンマ区切り）</label>
        <input
          id={tagsId}
          name="tags"
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="例: idea, draft"
          disabled={isPending}
        />
      </div>
      <div className="field">
        <label htmlFor={contentId}>本文（HTML）</label>
        <textarea
          id={contentId}
          name="contentHtml"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="<p>ここに本文を書きます…</p>"
          disabled={isPending}
        />
      </div>
      {error !== null ? (
        <p className="form-error" role="alert">
          {displayError(error)}
        </p>
      ) : null}
      <div
        style={{
          display: "inline-flex",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
        }}
      >
        <button type="submit" className="pill-btn primary" disabled={isPending}>
          {isPending ? "保存中..." : props.mode === "new" ? "作成" : "保存"}
        </button>
        <button
          type="button"
          className="pill-btn"
          disabled={isPending}
          onClick={() => router.history.back()}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
