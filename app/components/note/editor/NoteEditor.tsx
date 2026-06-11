"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Editor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
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
  type EditorMode,
  editorReducer,
  parseTagInput,
} from "./editorState";
import { FrontMatterEditor } from "./FrontMatterEditor";
import { HtmlEditor } from "./HtmlEditor";
import { InlineEditor } from "./InlineEditor";
import { MediaUploader } from "./MediaUploader";
import { editorActions, editorTopbar, titleInput } from "./styles";
import { useAutosave } from "./useAutosave";
import { useEditLock } from "./useEditLock";
import { WysiwygEditor } from "./WysiwygEditor";

/**
 * Note editor (P12) — orchestrator client component.
 *
 * Phase D coverage:
 * - HTML edit pane + sanitized-on-save preview (`HtmlEditor`)
 * - WYSIWYG pane backed by TipTap (`WysiwygEditor`, Issue #9)
 * - Generic key-value FrontMatter editor + raw-JSON toggle (`FrontMatterEditor`)
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
      surface: props.mode === "new" ? ("new" as const) : ("edit" as const),
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
  // Surfaces the inline directory-creation step that runs at save time when a
  // pending (not-yet-created) directory name is set. Reset in a `finally` so it
  // clears on both success and failure (plan B-3).
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [submitError, setSubmitError] = useState<SerializedError | null>(null);
  const tiptapEditorRef = useRef<Editor | null>(null);

  // ADR-008 (Issue #233 review-001 W-S-001 / W-F-006): `onModeChange`
  // needs to read post-blur `dirtyKeys` / `autosave` to decide whether
  // to confirm. React batches the `dispatch` triggered by
  // `active.blur()`, so the `state` closure inside the same event
  // handler is stale. Mirror the latest state into a ref via a commit-
  // phase effect so the handler can read the up-to-date snapshot
  // without resorting to `flushSync` (which would force a synchronous
  // render and risk interfering with the autosave path).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { abortInFlight } = useAutosave({
    noteId,
    state,
    dispatch,
    saveDraft,
  });
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
      // `html` and `inline` (Issue #233 ADR-005) share the string-append
      // path. For `inline`, the `InlineEditor`'s `useEffect([value])`
      // resync rebuilds the DOM with the newly-appended `<img>` and
      // re-takes the MutationObserver snapshot.
      dispatch({ type: "setContent", value: nextHtml });
      dispatch({ type: "mediaInsertionAdded", insertion });
    },
    [state.mode],
  );

  const surface: "new" | "edit" = props.mode === "new" ? "new" : "edit";

  const onModeChange = useCallback(
    (nextMode: EditorMode) => {
      // ADR-003 (Issue #230): switching editor modes unmounts the
      // currently focused FrontMatter input. Force a blur first so any
      // pending key-rename / add commits run before the row disappears,
      // instead of being silently dropped. Issue #233 ADR-004 fixes the
      // order as: blur → re-evaluate dirty → confirm → dispatch, so any
      // dirty flag that blur introduces (e.g. a committed rename) is
      // visible to the confirm step. The latest `dirtyKeys` / `autosave`
      // is read from `stateRef` rather than the closure to capture any
      // dispatch that blur produced (Issue #233 ADR-008).
      //
      // Issue #286: when the user picks "discard", call
      // `abortInFlight()` BEFORE `setMode` dispatches. The abort cancels
      // the in-flight `saveDraft` fetch via AbortController and resets
      // the autosave UI to `idle`. Doing it before `setMode` keeps the
      // abort and the post-`setMode` effect re-evaluation (which may
      // install a new controller on modes where `canFlush` flips) from
      // racing on the same `controllerRef` slot.
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      const latest = stateRef.current;
      const isDirty =
        latest.dirtyKeys.size > 0 ||
        latest.autosave.kind === "saving" ||
        latest.autosave.kind === "error";
      if (isDirty) {
        const ok = window.confirm(
          "未保存の変更があります。保存せずに切り替えますか？",
        );
        if (!ok) return;
        abortInFlight();
      }
      dispatch({ type: "setMode", mode: nextMode });
    },
    [abortInFlight],
  );

  const resolveDirectoryId = async (): Promise<string | null> => {
    if (state.pendingDirectoryName === null) return state.directoryId;
    const result = await createDirectory({
      data: { parentId: null, name: state.pendingDirectoryName },
    });
    return result.directory.id;
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
    // Set outside the transition so the「ディレクトリ作成中...」label paints
    // at high priority before the save round-trip begins.
    if (state.pendingDirectoryName !== null) setCreatingDirectory(true);
    startTransition(async () => {
      try {
        const directoryId = await resolveDirectoryId();
        setCreatingDirectory(false);
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
          await routerInvalidate(router);
          await router.navigate({
            to: "/notes/$noteId",
            params: { noteId: props.noteId },
          });
        }
      } catch (e) {
        setSubmitError(extractSerializedError(e));
      } finally {
        setCreatingDirectory(false);
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4 max-sm:pb-[env(safe-area-inset-bottom)]"
      onSubmit={onSubmit}
    >
      <EditLockBanner lock={state.editLock} />

      <div className={editorTopbar}>
        <h1 className="sr-only">
          {props.mode === "new" ? "新規ノート" : "ノートを編集"}
        </h1>
        <EditorModeSwitch
          surface={surface}
          mode={state.mode}
          onChange={onModeChange}
        />
        <span>
          <AutosaveIndicator status={state.autosave} />
        </span>
        <div className={editorActions}>
          <button
            type="submit"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={saveDisabled}
            aria-busy={isPending}
          >
            {creatingDirectory
              ? "ディレクトリ作成中..."
              : isPending
                ? "保存中..."
                : props.mode === "new"
                  ? "作成"
                  : "保存"}
          </button>
          <button
            type="button"
            className={pillBtn}
            disabled={isPending}
            onClick={() => router.history.back()}
          >
            キャンセル
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="note-editor-title" className="sr-only">
          タイトル
        </label>
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
          className={titleInput}
        />
      </div>

      <div className={field}>
        <label htmlFor="note-editor-tags" className={fieldLabel}>
          タグ（カンマ区切り）
        </label>
        <input
          id="note-editor-tags"
          type="text"
          value={state.tagInput}
          onChange={(e) =>
            dispatch({ type: "setTagInput", value: e.target.value })
          }
          placeholder="例: idea, draft"
          disabled={isPending}
          className={fieldControl}
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
        allowExistingActions
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

      {state.mode === "inline" ? (
        <>
          <InlineEditor
            value={state.contentHtml}
            onChange={(v) => dispatch({ type: "setContent", value: v })}
            disabled={isPending}
            onInitFailed={() => dispatch({ type: "setMode", mode: "html" })}
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
            unsupportedTags={state.wysiwygUnsupportedTags}
            unsupportedAck={state.wysiwygUnsupportedAck}
            onUnsupportedTagsDetected={(tags) =>
              dispatch({ type: "wysiwygUnsupportedDetected", tags })
            }
            onAcknowledge={() => dispatch({ type: "wysiwygUnsupportedAck" })}
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
          onRenameKey={(oldKey, newKey) =>
            dispatch({ type: "renameFrontMatterKey", oldKey, newKey })
          }
          onAddKey={(key) => dispatch({ type: "addFrontMatterKey", key })}
          onSetRawJson={(value) =>
            dispatch({ type: "setFrontMatterRawJson", value })
          }
          disabled={isPending}
        />
      ) : null}

      {submitError !== null ? (
        <p className={formError} role="alert">
          {displayError(submitError)}
        </p>
      ) : null}
    </form>
  );
}
