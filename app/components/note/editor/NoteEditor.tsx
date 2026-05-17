"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { createDirectoryFn } from "@/components/directory/actions";
import {
  acquireEditLockFn,
  createNoteFn,
  extendEditLockFn,
  releaseEditLockFn,
  saveNoteDraftFn,
  saveNoteFn,
} from "@/components/note/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import type { FlatDirectory } from "../loaders";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { DirectoryPicker } from "./DirectoryPicker";
import { EditLockBanner } from "./EditLockBanner";
import { EditorModeSwitch } from "./EditorModeSwitch";
import {
  createInitialEditorState,
  type EditLockState,
  editorReducer,
  parseTagInput,
} from "./editorState";
import { FrontMatterEditor } from "./FrontMatterEditor";
import { HtmlEditor } from "./HtmlEditor";
import { MediaUploader } from "./MediaUploader";
import { useAutosave } from "./useAutosave";
import { useEditLock } from "./useEditLock";
import { WysiwygEditor } from "./WysiwygEditor";

/**
 * Note editor (P12) — orchestrator client component.
 *
 * Phase D coverage:
 * - HTML edit pane + sanitized-on-save preview (`HtmlEditor`)
 * - WYSIWYG pane backed by TipTap (`WysiwygEditor`, Issue #9)
 * - Structured FrontMatter known-key UI + raw-JSON toggle (`FrontMatterEditor`)
 * - Directory pick / inline new-directory creation (`DirectoryPicker`)
 * - Presigned R2 media upload + `/media/<id>` insertion (`MediaUploader`).
 *   In WYSIWYG mode the upload completion targets the current cursor via
 *   the TipTap editor command (`setImage`); in HTML mode the existing
 *   string-tail-append behaviour is preserved (Issue #9 ADR-003).
 * - Debounced autosave via `saveNoteDraft` with backoff (`useAutosave`)
 * - Best-effort edit lock with acquire / extend / release (`useEditLock`)
 *
 * Out of scope (separate issues):
 * - History / revision aggregate (spec marks "future")
 * - Real-time collision presence (no SSE/WebSocket infra yet, ADR-006)
 * - Cross-note / tag suggest for internal links (Issue #9 ADR-002 —
 *   `@tiptap/extension-mention` will be added in a follow-up Issue)
 * - Raw YAML edit (ADR-003 — JSON only here)
 * - Single-note export from this surface (handled at `/notes/$noteId/export`)
 */

export type NoteEditorProps =
  | (Readonly<{ mode: "new" }> & SharedProps)
  | (Readonly<{
      mode: "edit";
      noteId: string;
      initialTitle: string;
      initialContentHtml: string;
      initialFrontMatter: Record<string, unknown>;
      initialTagNames: readonly string[];
      initialDirectoryId: string | null;
      initialEditLock?: EditLockState;
    }> &
      SharedProps);

type SharedProps = Readonly<{
  tree: readonly FlatDirectory[];
}>;

export function NoteEditor(props: NoteEditorProps) {
  const router = useRouter();
  const createNote = useServerFn(createNoteFn);
  const saveNote = useServerFn(saveNoteFn);
  const createDirectory = useServerFn(createDirectoryFn);
  const saveDraft = useServerFn(saveNoteDraftFn);
  const acquireLock = useServerFn(acquireEditLockFn);
  const extendLock = useServerFn(extendEditLockFn);
  const releaseLock = useServerFn(releaseEditLockFn);

  const noteId = props.mode === "edit" ? props.noteId : null;

  const [state, dispatch] = useReducer(editorReducer, undefined, () => {
    const base = {
      title: props.mode === "edit" ? props.initialTitle : "",
      contentHtml: props.mode === "edit" ? props.initialContentHtml : "",
      frontMatter:
        props.mode === "edit"
          ? props.initialFrontMatter
          : ({} as Record<string, unknown>),
      directoryId: props.mode === "edit" ? props.initialDirectoryId : null,
      tagNames: props.mode === "edit" ? props.initialTagNames : [],
    } as const;
    const lock = props.mode === "edit" ? props.initialEditLock : undefined;
    return createInitialEditorState(
      lock === undefined ? base : { ...base, editLock: lock },
    );
  });

  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<SerializedError | null>(null);
  const tiptapEditorRef = useRef<Editor | null>(null);

  useAutosave({ noteId, state, dispatch, saveDraft });
  useEditLock({
    noteId,
    dispatch,
    acquireLock,
    extendLock,
    releaseLock,
  });

  const onMediaInsert = useCallback(
    (nextHtml: string, insertion: { id: string; url: string }) => {
      if (state.mode === "wysiwyg" && tiptapEditorRef.current !== null) {
        tiptapEditorRef.current
          .chain()
          .focus()
          .setImage({ src: `/media/${insertion.id}`, alt: "" })
          .run();
        dispatch({ type: "mediaInsertionAdded", insertion });
        return;
      }
      dispatch({ type: "setContent", value: nextHtml });
      dispatch({ type: "mediaInsertionAdded", insertion });
    },
    [state.mode],
  );

  const resolveDirectoryId = async (): Promise<string | null> => {
    if (state.pendingDirectoryName === null) return state.directoryId;
    const result = await createDirectory({
      data: { parentId: null, name: state.pendingDirectoryName },
    });
    return result.directory.id as unknown as string;
  };

  const saveDisabled =
    isPending ||
    state.frontMatterJsonError !== null ||
    state.title.trim().length === 0;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    const frontMatterJson = JSON.stringify(state.frontMatter);
    const tagNames = parseTagInput(state.tagInput);
    startTransition(async () => {
      try {
        const directoryId = await resolveDirectoryId();
        if (props.mode === "new") {
          const result = await createNote({
            data: {
              title: state.title,
              contentHtml: state.contentHtml,
              directoryId,
              tagNames,
              frontMatterJson,
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
              title: state.title,
              contentHtml: state.contentHtml,
              tagNames,
              frontMatterJson,
            },
          });
          await router.invalidate();
          await router.navigate({
            to: "/notes/$noteId",
            params: { noteId: props.noteId },
          });
        }
      } catch (e) {
        setSubmitError(extractSerializedError(e));
      }
    });
  };

  return (
    <form className="note-editor" onSubmit={onSubmit}>
      <header className="note-editor-header">
        <h1 className="page-title">
          {props.mode === "new" ? "新規ノート" : "ノートを編集"}
        </h1>
        <AutosaveIndicator status={state.autosave} />
      </header>

      <EditLockBanner lock={state.editLock} />

      <div className="field">
        <label htmlFor="note-editor-title">タイトル</label>
        <input
          id="note-editor-title"
          type="text"
          value={state.title}
          onChange={(e) =>
            dispatch({ type: "setTitle", value: e.target.value })
          }
          placeholder="無題のノート"
          maxLength={200}
          disabled={isPending}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="note-editor-tags">タグ（カンマ区切り）</label>
        <input
          id="note-editor-tags"
          type="text"
          value={state.tagInput}
          onChange={(e) =>
            dispatch({ type: "setTagInput", value: e.target.value })
          }
          placeholder="例: idea, draft"
          disabled={isPending}
        />
      </div>

      <DirectoryPicker
        tree={props.tree}
        directoryId={state.directoryId}
        pendingDirectoryName={state.pendingDirectoryName}
        onSelectExisting={(id) =>
          dispatch({ type: "setDirectory", directoryId: id })
        }
        onSetPendingName={(name) =>
          dispatch({ type: "setPendingDirectoryName", value: name })
        }
        disabled={isPending}
      />

      <EditorModeSwitch
        mode={state.mode}
        onChange={(mode) => dispatch({ type: "setMode", mode })}
      />

      {state.mode === "html" ? (
        <>
          <HtmlEditor
            value={state.contentHtml}
            onChange={(v) => dispatch({ type: "setContent", value: v })}
            disabled={isPending}
          />
          <MediaUploader
            contentHtml={state.contentHtml}
            onInsert={onMediaInsert}
            disabled={isPending}
          />
        </>
      ) : null}

      {state.mode === "wysiwyg" ? (
        <>
          <WysiwygEditor
            value={state.contentHtml}
            onChange={(v) => dispatch({ type: "setContent", value: v })}
            disabled={isPending}
            editorRef={tiptapEditorRef}
          />
          <MediaUploader
            contentHtml={state.contentHtml}
            onInsert={onMediaInsert}
            disabled={isPending}
          />
        </>
      ) : null}

      {state.mode === "frontMatter" ? (
        <FrontMatterEditor
          mode={state.frontMatterMode}
          parsed={state.frontMatter}
          rawJson={state.frontMatterRawJson}
          parseError={state.frontMatterJsonError}
          onToggleMode={() => dispatch({ type: "toggleFrontMatterMode" })}
          onSetField={(key, value) =>
            dispatch({ type: "setFrontMatterField", key, value })
          }
          onSetRawJson={(value) =>
            dispatch({ type: "setFrontMatterRawJson", value })
          }
          disabled={isPending}
        />
      ) : null}

      {submitError !== null ? (
        <p className="form-error" role="alert">
          {displayError(submitError)}
        </p>
      ) : null}

      <div
        style={{
          display: "inline-flex",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
        }}
      >
        <button
          type="submit"
          className="pill-btn primary"
          disabled={saveDisabled}
        >
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
