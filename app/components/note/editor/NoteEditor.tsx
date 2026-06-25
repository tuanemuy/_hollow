"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Editor } from "@tiptap/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formError, pillBtn, pillBtnPrimary } from "@/components/common/styles";
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
import { clearNoteUnsaved, markNoteUnsaved } from "../unsavedFlag";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { DirectoryPicker } from "./DirectoryPicker";
import { EditLockBanner } from "./EditLockBanner";
import {
  EDITOR_BODY_PANEL_ID,
  EditorModeSwitch,
  editorModeTabId,
} from "./EditorModeSwitch";
import {
  createInitialEditorState,
  type EditLockState,
  type EditorMode,
  editorReducer,
  snapshotForSubmit,
} from "./editorState";
import { FrontMatterEditor } from "./FrontMatterEditor";
import { HtmlEditor } from "./HtmlEditor";
import { minifyHtml } from "./htmlFormat";
import { InlineEditor } from "./InlineEditor";
import { MediaUploader } from "./MediaUploader";
import { editorActions, editorTopbar, titleInput } from "./styles";
import { TagsInput } from "./TagsInput";
import { useAutosave } from "./useAutosave";
import { useEditLock } from "./useEditLock";
import { WysiwygEditor } from "./WysiwygEditor";
import { detectUnsupportedTags } from "./wysiwygUnsupportedTags";

/**
 * Note editor (P12) — orchestrator client component.
 *
 * Phase D coverage:
 * - HTML edit pane + sanitized-on-save preview (`HtmlEditor`)
 * - WYSIWYG pane backed by TipTap (`WysiwygEditor`)
 * - Generic key-value FrontMatter editor + raw-JSON toggle
 *   (`FrontMatterEditor`), permanently mounted below the body editor so
 *   metadata is editable alongside any body mode (Issue #697)
 * - Directory pick / inline new-directory creation (`DirectoryPicker`)
 * - Presigned R2 media upload + `/media/<id>` insertion (`MediaUploader`).
 *   In WYSIWYG mode the upload completion targets the current cursor via
 *   the TipTap editor command (`setImage`); in HTML mode the existing
 *   string-tail-append behaviour is preserved.
 * - Debounced autosave via `saveNoteDraft` with backoff (`useAutosave`)
 * - Best-effort edit lock with acquire / extend / release (`useEditLock`)
 *
 * Out of scope (separate issues):
 * - History / revision aggregate (spec marks "future")
 * - Real-time collision presence (no SSE/WebSocket infra yet)
 * - Raw YAML edit (JSON only here)
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

  // Seed only on first mount (lazy initializer): a loader re-run delivering
  // fresh `initial*` props must NOT reset in-progress edits.
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
  // clears on both success and failure.
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const [submitError, setSubmitError] = useState<SerializedError | null>(null);
  // Holds a deferred switch to WYSIWYG while the decoration-loss
  // confirmation dialog is open (Issue #696 ADR-002). This is a transient
  // view-only UI state — the open/close of a dialog and the tags it must
  // list — so it lives in orchestrator `useState` rather than the reducer,
  // which is reserved for model state (content / mode / autosave / dirty).
  // The actual `setMode "wysiwyg"` happens on confirm, not here.
  const [pendingWysiwygSwitch, setPendingWysiwygSwitch] = useState<{
    lostTags: readonly string[];
  } | null>(null);
  const tiptapEditorRef = useRef<Editor | null>(null);

  // `onModeChange` needs to read post-blur `dirtyKeys` / `autosave` to decide whether
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

  // Mirror `dirtyKeys` into the cross-route unsaved flag (Issue #583 ADR-002).
  // Only EDGES drive the flag: rising (0 → >0) marks unsaved, falling (>0 → 0,
  // i.e. the `autosaveSuccess` reset) clears it. `0 → 0` (unedited open, the
  // `EMPTY_DIRTY` initial state) and `>0 → >0` (ongoing edits) are no-ops, so
  // a fresh mount never clobbers a flag left by another route in the same
  // session. The dep is the Set reference: the reducer only swaps in a new Set
  // when dirty actually changes, so this fires exactly on transitions.
  const prevDirtySizeRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: edge detection keys off the `dirtyKeys` Set reference; `noteId` is stable per mount.
  useEffect(() => {
    if (noteId === null) return;
    const curr = state.dirtyKeys.size;
    const prev = prevDirtySizeRef.current;
    if (prev === 0 && curr > 0) markNoteUnsaved(noteId);
    else if (prev > 0 && curr === 0) clearNoteUnsaved(noteId);
    prevDirtySizeRef.current = curr;
  }, [state.dirtyKeys]);

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
      // On the HTML tab the in-progress truth is the formatted `htmlDraft`
      // (Issue #762): the MediaUploader appended to `htmlDraft` (its prop
      // below), so the result lands back in `htmlDraft`, not `contentHtml`
      // — save-time `minifyHtml` normalises the appended block.
      if (state.mode === "html") {
        dispatch({ type: "setHtmlDraft", value: nextHtml });
        dispatch({ type: "mediaInsertionAdded", insertion });
        return;
      }
      // `inline` keeps the string-append path on `contentHtml`. The
      // `InlineEditor`'s `useEffect([value])` resync rebuilds the DOM with
      // the newly-appended `<img>` and re-takes the MutationObserver
      // snapshot.
      dispatch({ type: "setContent", value: nextHtml });
      dispatch({ type: "mediaInsertionAdded", insertion });
    },
    [state.mode],
  );

  const surface: "new" | "edit" = props.mode === "new" ? "new" : "edit";

  const onModeChange = useCallback(
    (nextMode: EditorMode) => {
      // Force a blur on the currently focused field (title / tag draft /
      // FrontMatter KeyRow buffer) first so its pending commit (e.g. a
      // key-rename that commits on blur) is flushed before the dirty
      // re-evaluation, instead of being read stale. The blur is purely for
      // dirty freshness, not unmount safety — FrontMatter is permanently
      // mounted (Issue #697). The order is fixed as: blur → re-evaluate
      // dirty → confirm → dispatch, so any dirty flag that blur introduces
      // (e.g. a committed rename) is visible to the confirm step. The
      // latest `dirtyKeys` / `autosave` is read from `stateRef` rather than
      // the closure to capture any dispatch that blur produced.
      //
      // When the user picks "discard", call
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
      // Decoration-loss gate (Issue #696): switching to WYSIWYG flattens
      // any tag TipTap cannot round-trip. Detect against the latest
      // committed `contentHtml` (the InlineEditor `onChange` debounce may
      // not have flushed, but the unsupported-tag *set* does not change on
      // ordinary text edits, so this is an accepted approximation — see
      // ADR-002). If anything would be lost, defer the switch and open the
      // ConfirmDialog instead of dispatching `setMode` now. The order is
      // fixed: unsaved-confirm (window.confirm) → decoration-warning
      // (ConfirmDialog), and confirming the latter also acks the in-pane
      // banner so the user is never asked twice about the same loss.
      //
      // Scoped to `surface === "edit"` only: the new-note surface keeps its
      // pre-#696 behaviour (AC-6) where the in-pane WYSIWYG banner is the
      // sole decoration-loss warning, so a "HTML tab → raw <section> → WYSIWYG
      // tab" path on a new note must NOT pop this dialog.
      //
      // Issue #762: when leaving the HTML tab, `contentHtml` is stale —
      // the in-progress truth is the formatted `htmlDraft`. Detect against
      // `minifyHtml(htmlDraft)` so tags typed in the HTML tab are caught.
      // The `setMode` reducer commits the same `minifyHtml(htmlDraft)` into
      // `contentHtml` on this transition, so detection source and the body
      // the WYSIWYG pane mounts with stay in lockstep.
      if (surface === "edit" && nextMode === "wysiwyg") {
        const detectSource =
          latest.mode === "html"
            ? minifyHtml(latest.htmlDraft)
            : latest.contentHtml;
        const lostTags = detectUnsupportedTags(detectSource);
        if (lostTags.length > 0) {
          setPendingWysiwygSwitch({ lostTags });
          return;
        }
      }
      dispatch({ type: "setMode", mode: nextMode });
    },
    [abortInFlight, surface],
  );

  const confirmWysiwygSwitch = useCallback(() => {
    const pending = pendingWysiwygSwitch;
    if (pending === null) return;
    // Switch + acknowledge in one handler so the WysiwygEditor mounts with
    // the in-pane warning already accepted (Issue #696 ADR-002): the user
    // just agreed to the same loss in the dialog, so the banner must not
    // re-prompt. The ordering of these three dispatches matters because
    // `wysiwygUnsupportedDetected` resets `wysiwygUnsupportedAck` to false
    // whenever it receives a set DIFFERENT from the current one:
    //   1. seed `wysiwygUnsupportedTags` with the SAME set the dialog just
    //      listed, so the WYSIWYG pane's `onCreate` re-detection (which
    //      finds that identical set) hits the `setsEqual` short-circuit and
    //      leaves the ack untouched;
    //   2. set the ack AFTER the tags are seeded, so it is not clobbered by
    //      step 1's reset-on-change;
    //   3. switch the mode to mount the pane.
    // All three run inside one React event handler and batch into a single
    // render with the final state (tags set, ack=true, mode=wysiwyg).
    //
    // Issue #762: when the deferred switch leaves the HTML tab, the final
    // `setMode("wysiwyg")` below still sees `mode === "html"` and commits
    // `minifyHtml(htmlDraft)` into `contentHtml`, so the HTML-tab edit is
    // never dropped on this confirm path.
    dispatch({ type: "wysiwygUnsupportedDetected", tags: pending.lostTags });
    dispatch({ type: "wysiwygUnsupportedAck" });
    dispatch({ type: "setMode", mode: "wysiwyg" });
    setPendingWysiwygSwitch(null);
  }, [pendingWysiwygSwitch]);

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
    // Route the manual save through the same snapshot rule as autosave so
    // both persist a minified body (the HTML tab minifies `htmlDraft`;
    // every other mode passes `contentHtml` through) — Issue #762.
    const snap = snapshotForSubmit(state);
    const frontMatterJson = snap.frontMatterJson;
    const tagNames = snap.tagNames;
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
              contentHtml: snap.contentHtml,
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
              contentHtml: snap.contentHtml,
              tagNames,
              frontMatterJson,
            },
          });
          // Manual save does NOT reset `dirtyKeys` (only `autosaveSuccess`
          // does), so the falling-edge clear never fires here. Clear the
          // cross-route flag explicitly before navigating to detail, else the
          // publish modal would warn about a note that was just saved
          // (Issue #583 ADR-002).
          clearNoteUnsaved(props.noteId);
          // No invalidate here: the detail route uses `staleTime: 0`, so the
          // navigation below always fresh-loads the saved note.
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
    // No form `gap` on purpose: each row carries the mock's own
    // `margin-bottom` (`mb-*`) so values smaller than a uniform gap
    // (e.g. the directory row's 12px) stay reproducible.
    <form
      className="flex flex-col max-sm:pb-[env(safe-area-inset-bottom)]"
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
          <AutosaveIndicator
            status={state.autosave}
            enabled={noteId !== null}
          />
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
        variant="row"
      />

      <TagsInput
        tagNames={state.tagNames}
        draft={state.tagDraft}
        onAddTag={(value) => dispatch({ type: "addTag", value })}
        onRemoveTag={(name) => dispatch({ type: "removeTag", name })}
        onSetDraft={(value) => dispatch({ type: "setTagDraft", value })}
        disabled={isPending}
      />

      {/* Single editor-body tabpanel (Issue #776 ADR-002): the active body
          mode swaps the panel content while `aria-labelledby` points at the
          active EditorModeSwitch tab. `state.mode` is always a member of the
          surface's visible tab set, so the idref never dangles. The wrapper is
          unstyled so the body editors' own `mb-*` rhythm is unaffected; the
          panel itself needs no `tabIndex` because it always contains a
          focusable editor. */}
      <div
        role="tabpanel"
        id={EDITOR_BODY_PANEL_ID}
        aria-labelledby={editorModeTabId(state.mode)}
      >
        {state.mode === "html" ? (
          <>
            <HtmlEditor
              value={state.htmlDraft}
              onChange={(v) => dispatch({ type: "setHtmlDraft", value: v })}
              disabled={isPending}
            />
            <MediaUploader
              contentHtml={state.htmlDraft}
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
      </div>

      {/* FrontMatter is permanently mounted below the body editor (Issue
          #697) — metadata is edited in parallel with the body regardless of
          the active body mode, not as a separate exclusive tab. */}
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

      {submitError !== null ? (
        <p className={`${formError} mt-4`} role="alert">
          {displayError(submitError)}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingWysiwygSwitch !== null}
        title="WYSIWYG モードに切り替えますか？"
        description={
          pendingWysiwygSwitch !== null ? (
            <>
              <p>次の要素は WYSIWYG モードでは保持されません:</p>
              <p className="mt-2">
                {pendingWysiwygSwitch.lostTags.map((tag, i) => (
                  <Fragment key={tag}>
                    {i > 0 ? ", " : ""}
                    <code>{`<${tag}>`}</code>
                  </Fragment>
                ))}
              </p>
            </>
          ) : undefined
        }
        confirmLabel="切り替える"
        onConfirm={confirmWysiwygSwitch}
        onClose={() => setPendingWysiwygSwitch(null)}
      />
    </form>
  );
}
