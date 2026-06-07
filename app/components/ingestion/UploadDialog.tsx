"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  pillBtn,
} from "@/components/common/styles";
import {
  displayError,
  displayJobErrorCode,
} from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR } from "../layout/styles";
import { getDirectoryTreeFn } from "../note/actions";
import type { FlatDirectory } from "../note/loaders";
import {
  discardIngestionPreviewFn,
  type EffectiveIngestionPromptsWire,
  getEffectiveIngestionPromptsFn,
  getIngestionJobFn,
  type IngestionJobWire,
  ownerRetryIngestionJobFn,
  uploadFileFn,
} from "./actions";
import { IngestionPreviewForm } from "./IngestionPreviewForm";
import {
  type FileValidationResult,
  UploadValidationBanners,
  validateUploadFiles,
} from "./UploadForm";

type View =
  | { kind: "select" }
  | { kind: "uploading"; total: number }
  | {
      kind: "waiting";
      jobId: string;
      startedAt: number;
      // Where this waiting session was entered from. Decides where a
      // terminal poll failure (fatal error or transient cap) lands:
      // `upload` (first-time upload) falls back to `select`; `existingJob`
      // (regenerate / failed-retry of a persisted job) keeps the editing
      // context by routing to `queueGuidance` instead. See .issue/319/adr.md.
      origin: "upload" | "existingJob";
    }
  | {
      kind: "editing";
      job: IngestionJobWire;
    }
  | {
      kind: "failed";
      job: IngestionJobWire;
    }
  | {
      kind: "multiResult";
      total: number;
      succeeded: number;
      failedNames: readonly string[];
    }
  | {
      kind: "timedOut";
      jobId: string;
    }
  | {
      // Successful commit. The note is persisted; instead of immediately
      // navigating away we keep the user in the modal with a success
      // confirmation and an explicit link to the new note.
      // `title` is the user's edited title, threaded up from the form
      // since the commit server-fn only returns `{ noteId }`.
      kind: "committed";
      noteId: string;
      title: string;
    }
  | {
      // Terminal poll failure for an `existingJob`-origin waiting session.
      // The job is persisted in the queue, so instead of dumping the user
      // back to the dropzone (`select`) we keep them oriented toward the
      // job via the queue. The triggering error is surfaced from the
      // `error` state. See .issue/319/adr.md.
      kind: "queueGuidance";
    };

type Props = {
  open: boolean;
  onClose: () => void;
};

const DROPZONE =
  "block border-2 border-dashed border-hairline-strong rounded-xl px-6 py-12 text-center text-ink-secondary bg-surface-elevated transition-all motion-reduce:transition-none cursor-pointer hover:border-accent hover:bg-accent-surface data-[dragover]:border-accent data-[dragover]:bg-accent-surface [&_input[type=file]]:hidden";

const POLL_INTERVAL_MS = 1800;
const POLL_TIMEOUT_MS = 180_000;
const POLL_MAX_TRANSIENT_FAILURES = 3;

/**
 * Business-kind errors (`notFound`, `forbidden`, `validation`,
 * `business`) imply the job is unrecoverable from the modal's POV —
 * stop polling immediately. `secretBox` (missing / wrong master key) is
 * an operator-config precondition that retrying won't heal, so it is
 * fatal too. `system` / `unknown` are treated as transient and counted
 * toward the retry cap.
 */
function isPollFatalError(err: SerializedError): boolean {
  switch (err.kind) {
    case "notFound":
    case "forbidden":
    case "business":
    case "unauthorized":
    case "validation":
    case "conflict":
    case "secretBox":
      return true;
    case "system":
    case "unknown":
      return false;
  }
}

/**
 * Pure derivation of the SR status text for the current view. Used inside
 * the always-mounted `role="status" aria-live="polite"` region so view
 * transitions are announced once, in a single place. `select` returns an
 * empty string so the polite region stays silent while errors are handled
 * by the inline `role="alert"` region (avoids double-announce).
 */
function viewStatusText(view: View): string {
  switch (view.kind) {
    case "select":
      return "";
    case "uploading":
      return view.total === 1
        ? "アップロード中"
        : `${view.total} 件のファイルをアップロード中`;
    case "waiting":
      return "LLM がタイトルとメタデータを提案中";
    case "editing":
      return "プレビュー編集に進みました";
    case "failed":
      return "取り込みに失敗しました";
    case "multiResult": {
      const base = `${view.total} 件中 ${view.succeeded} 件をキューに追加しました`;
      return view.failedNames.length > 0
        ? `${base}（${view.failedNames.length} 件失敗）`
        : base;
    }
    case "timedOut":
      return "推論の完了を待ちきれませんでした";
    case "committed":
      return "ノートを登録しました";
    case "queueGuidance":
      // The error itself is announced via the inline `role="alert"` region;
      // the polite region carries only the non-duplicate guidance so the
      // user is not double-announced (same rationale as `select`).
      return "ジョブはキューに残っています";
    default:
      throw new Error(`unreachable view kind: ${JSON.stringify(view)}`);
  }
}

export function UploadDialog({ open, onClose }: Props) {
  const router = useRouter();
  const upload = useServerFn(uploadFileFn);
  const getJob = useServerFn(getIngestionJobFn);
  const getTree = useServerFn(getDirectoryTreeFn);
  const getEffectivePrompts = useServerFn(getEffectiveIngestionPromptsFn);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>({ kind: "select" });
  const [error, setError] = useState<SerializedError | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Client-side validation result for the most recent file selection, shown
  // as `.alert-error` / `.alert-warning` banners in the `select` view. `null`
  // means no selection has been validated yet.
  const [validation, setValidation] = useState<FileValidationResult | null>(
    null,
  );

  const [tree, setTree] = useState<readonly FlatDirectory[]>([]);
  const [isTreeLoading, setIsTreeLoading] = useState(false);

  // Per-upload custom prompts entered in the `select` view's "advanced
  // options" accordion. Applied to every file of the current submission
  // (single or batch) and reset when the dialog re-opens. See #228.
  const [structurePrompt, setStructurePrompt] = useState("");
  const [metadataPrompt, setMetadataPrompt] = useState("");

  // The resolved per-purpose default prompts (what ingestion applies when
  // the override is left blank). Lazily fetched the first time the user
  // opens the custom-prompt accordion (see `onAdvancedToggle`) — most
  // uploads never open it, so we avoid a request until it is needed.
  // A fetch failure leaves this `null`, which simply suppresses the
  // default hints; the upload itself is never blocked. See #358.
  const [resolvedDefaults, setResolvedDefaults] =
    useState<EffectiveIngestionPromptsWire | null>(null);
  const promptsFetchedRef = useRef(false);

  const inputId = useId();
  const titleId = useId();

  // Move focus to the title input when the view transitions into `editing`.
  // `Dialog.initialFocusRef` is intentionally not used here because the dialog
  // always opens in the `select` view (the rAF initial-focus effect has long
  // since fired by the time we reach editing). See ADR-004.
  useEffect(() => {
    if (view.kind === "editing") {
      titleInputRef.current?.focus();
    }
  }, [view.kind]);

  // Flag flipped by the `open` cleanup so in-flight `submitFiles`
  // callbacks know to skip their post-await `setView`. Without this
  // a slow upload that resolves after the modal has been dismissed
  // would silently transition the next-opened dialog into `waiting`
  // for a job the user never started.
  const cancelledRef = useRef(false);

  // Reset to the select state whenever the dialog opens. The cleanup
  // raises `cancelledRef` so any in-flight submitFiles promise (its
  // network call still resolves) does not push state into a stale
  // closure.
  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      setView({ kind: "select" });
      setError(null);
      setIsDragOver(false);
      setValidation(null);
      setStructurePrompt("");
      setMetadataPrompt("");
      setResolvedDefaults(null);
      promptsFetchedRef.current = false;
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [open]);

  // Lazy-load the directory tree the first time we enter the `editing`
  // view. Depends on the `isEditing` boolean — not the whole `view`
  // object — so a `setView` that keeps `kind === "editing"` never
  // re-runs the load (same scalar-dependency pattern as the polling
  // effect below; see .issue/258/adr.md).
  const isEditing = view.kind === "editing";
  useEffect(() => {
    if (!isEditing) return;
    if (tree.length > 0) return;
    let cancelled = false;
    setIsTreeLoading(true);
    void (async () => {
      try {
        const { flat } = await getTree();
        if (!cancelled) setTree(flat);
      } catch {
        // Tree load failure leaves the picker empty — the user can
        // still type a new directory name. Silent recovery is preferable
        // to blocking the editing UX with a banner.
      } finally {
        if (!cancelled) setIsTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing, tree.length, getTree]);

  // Transient (system / unknown) poll-failure counter for the current
  // `waiting` session. Held on a ref — not in the `view` discriminant —
  // so incrementing it never changes `view`'s identity and never
  // re-runs the polling effect. Reset to 0 at each entry into `waiting`
  // (see `submitFiles` / `onRegenerated`). See .issue/258/adr.md.
  const transientFailuresRef = useRef(0);

  // Polling loop driven by the `waiting` view. The effect depends only on
  // the scalars that identify a `waiting` session (`jobId` / `startedAt`),
  // so it mounts exactly once per session and stays mounted through
  // transient failures — those reschedule the next tick inline rather than
  // re-creating the `view` object. The recursive `setTimeout` is tracked on
  // a ref so the effect cleanup can `clearTimeout` whichever timer is
  // currently outstanding; without that ref a tick scheduled mid-flight
  // would survive a view change / unmount.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingJobId = view.kind === "waiting" ? view.jobId : null;
  const waitingStartedAt = view.kind === "waiting" ? view.startedAt : null;
  const waitingOrigin = view.kind === "waiting" ? view.origin : null;
  useEffect(() => {
    if (
      waitingJobId === null ||
      waitingStartedAt === null ||
      waitingOrigin === null
    )
      return;
    let cancelled = false;
    // A terminal poll failure (fatal error or transient cap) abandons the
    // waiting session. `upload`-origin sessions fall back to the dropzone;
    // `existingJob`-origin sessions keep the user oriented toward the
    // persisted job via the queue instead. See .issue/319/adr.md.
    const failWaiting = (serialized: SerializedError) => {
      setError(serialized);
      setView(
        waitingOrigin === "existingJob"
          ? { kind: "queueGuidance" }
          : { kind: "select" },
      );
    };
    const tick = async () => {
      if (cancelled) return;
      try {
        const { job } = await getJob({ data: { jobId: waitingJobId } });
        if (cancelled) return;
        if (job.status === "previewing") {
          setView({ kind: "editing", job });
          return;
        }
        if (job.status === "failed") {
          setView({ kind: "failed", job });
          return;
        }
        if (job.status === "saved" || job.status === "discarded") {
          // Edge: the job moved past previewing between two polls (e.g.
          // a parallel tab acted on it). Close the modal so the user is
          // not stuck on a stale state.
          onClose();
          return;
        }
        // Still pending / processing — schedule the next poll if we
        // have not run out of time.
        if (Date.now() - waitingStartedAt > POLL_TIMEOUT_MS) {
          setView({ kind: "timedOut", jobId: waitingJobId });
          return;
        }
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        const serialized = extractSerializedError(e);
        if (isPollFatalError(serialized)) {
          failWaiting(serialized);
          return;
        }
        transientFailuresRef.current += 1;
        if (transientFailuresRef.current >= POLL_MAX_TRANSIENT_FAILURES) {
          failWaiting(serialized);
          return;
        }
        // Transient failure under the cap: keep the same `waiting` session
        // and reschedule the next tick at the regular interval — same path
        // as the pending branch, so the cadence stays at POLL_INTERVAL_MS.
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [waitingJobId, waitingStartedAt, waitingOrigin, getJob, onClose]);

  const submitFiles = useCallback(
    (files: FileList | null) => {
      if (files === null || files.length === 0) return;
      setError(null);
      const result = validateUploadFiles(files);
      setValidation(result);
      // Only the files that passed the client guard proceed; if everything
      // was rejected, stay in `select` and let the banners explain why.
      const list: File[] = [...result.accepted];
      if (list.length === 0) return;

      // Snapshot the override inputs at submit time so the same prompt
      // applies to every file of this submission. Non-empty (trimmed)
      // values only — blanks fall back to the resolver server-side.
      const trimmedStructure = structurePrompt.trim();
      const trimmedMetadata = metadataPrompt.trim();
      const appendOverride = (formData: FormData) => {
        if (trimmedStructure.length > 0) {
          formData.append("structurePrompt", trimmedStructure);
        }
        if (trimmedMetadata.length > 0) {
          formData.append("metadataPrompt", trimmedMetadata);
        }
      };

      if (list.length === 1) {
        const file = list[0];
        if (file === undefined) return;
        setView({ kind: "uploading", total: 1 });
        void (async () => {
          try {
            const formData = new FormData();
            formData.append("file", file);
            appendOverride(formData);
            const { jobId } = await upload({ data: formData });
            if (cancelledRef.current) return;
            transientFailuresRef.current = 0;
            setView({
              kind: "waiting",
              jobId,
              startedAt: Date.now(),
              origin: "upload",
            });
          } catch (e) {
            if (cancelledRef.current) return;
            setError(extractSerializedError(e));
            setView({ kind: "select" });
          }
        })();
        return;
      }

      // Multiple files: enqueue all, surface aggregate result.
      setView({ kind: "uploading", total: list.length });
      void (async () => {
        let succeeded = 0;
        const failedNames: string[] = [];
        for (const f of list) {
          try {
            const formData = new FormData();
            formData.append("file", f);
            appendOverride(formData);
            await upload({ data: formData });
            if (cancelledRef.current) return;
            succeeded += 1;
          } catch {
            if (cancelledRef.current) return;
            failedNames.push(f.name);
          }
        }
        await routerInvalidate(router);
        if (cancelledRef.current) return;
        setView({
          kind: "multiResult",
          total: list.length,
          succeeded,
          failedNames,
        });
      })();
    },
    [upload, router, structurePrompt, metadataPrompt],
  );

  // Lazily fetch the resolved default prompts the first time the
  // custom-prompt accordion is opened. Fired from the `details` `onToggle`
  // (open only). A failure is swallowed — the default hints simply stay
  // hidden and the upload flow is unaffected (same philosophy as the
  // directory-tree lazy load). See #358.
  const onAdvancedToggle = useCallback(
    (open: boolean) => {
      if (!open || promptsFetchedRef.current) return;
      promptsFetchedRef.current = true;
      void (async () => {
        try {
          const result = await getEffectivePrompts();
          if (!cancelledRef.current) setResolvedDefaults(result);
        } catch {
          // Silent: leave `resolvedDefaults` null so no default hint is
          // shown. The user can still type an override and upload.
        }
      })();
    },
    [getEffectivePrompts],
  );

  // Successful commit lands on the `committed` view (instead of an
  // immediate navigate) so the user gets an explicit success confirmation
  // and a link to the new note.
  const onCommitted = useCallback((noteId: string, title: string) => {
    setView({ kind: "committed", noteId, title });
  }, []);

  const onDiscarded = useCallback(() => {
    onClose();
  }, [onClose]);

  // Regeneration returns the job to `pending` and re-drives the LLM
  // asynchronously. Re-enter the `waiting` view so the existing polling
  // loop tracks `pending → processing → previewing` and lands back in
  // `editing` with the fresh preview (see .issue/253/adr.md ADR-003).
  const onRegenerated = useCallback((jobId: string) => {
    transientFailuresRef.current = 0;
    setView({
      kind: "waiting",
      jobId,
      startedAt: Date.now(),
      // Both regenerate (editing view) and failed-retry (failed view) reach
      // this handler — they act on a job already persisted in the queue, so
      // a terminal poll failure should route to `queueGuidance`, not `select`.
      origin: "existingJob",
    });
  }, []);

  // While the user has a single job mid-flight, the dialog must keep
  // its body content laid out responsively — the inner stack scrolls
  // and the action bar inside `IngestionPreviewForm` sticks.
  const isPending =
    view.kind === "uploading" ||
    view.kind === "waiting" ||
    view.kind === "editing";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closeOnBackdropClick={!isPending}
      showCloseButton
      closable={view.kind !== "uploading"}
    >
      <h2 id={titleId} className={dialogTitle}>
        アップロード
      </h2>
      <div role="status" aria-live="polite" className="sr-only">
        {viewStatusText(view)}
      </div>

      {view.kind === "select" ? (
        <SelectView
          inputId={inputId}
          fileInputRef={fileInputRef}
          isDragOver={isDragOver}
          onDragOver={() => setIsDragOver(true)}
          onDragLeave={() => setIsDragOver(false)}
          onFiles={submitFiles}
          error={error}
          validation={validation}
          structurePrompt={structurePrompt}
          metadataPrompt={metadataPrompt}
          onStructurePromptChange={setStructurePrompt}
          onMetadataPromptChange={setMetadataPrompt}
          resolvedDefaults={resolvedDefaults}
          onAdvancedToggle={onAdvancedToggle}
        />
      ) : null}

      {view.kind === "uploading" ? <UploadingView total={view.total} /> : null}

      {view.kind === "waiting" ? <WaitingView /> : null}

      {view.kind === "editing" ? (
        <IngestionPreviewForm
          job={view.job}
          tree={tree}
          isTreeLoading={isTreeLoading}
          titleInputRef={titleInputRef}
          onCommitted={onCommitted}
          onDiscarded={onDiscarded}
          onRegenerated={onRegenerated}
          onCancel={onClose}
        />
      ) : null}

      {view.kind === "failed" ? (
        <FailedView
          job={view.job}
          onClose={onClose}
          onRetried={onRegenerated}
        />
      ) : null}

      {view.kind === "multiResult" ? (
        <MultiResultView
          total={view.total}
          succeeded={view.succeeded}
          failedNames={view.failedNames}
          onClose={onClose}
        />
      ) : null}

      {view.kind === "committed" ? (
        <CommittedView
          noteId={view.noteId}
          title={view.title}
          onClose={onClose}
        />
      ) : null}

      {view.kind === "timedOut" ? <TimedOutView onClose={onClose} /> : null}

      {view.kind === "queueGuidance" ? (
        <QueueGuidanceView error={error} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function SelectView({
  inputId,
  fileInputRef,
  isDragOver,
  onDragOver,
  onDragLeave,
  onFiles,
  error,
  validation,
  structurePrompt,
  metadataPrompt,
  onStructurePromptChange,
  onMetadataPromptChange,
  resolvedDefaults,
  onAdvancedToggle,
}: Readonly<{
  inputId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isDragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onFiles: (files: FileList | null) => void;
  error: SerializedError | null;
  validation: FileValidationResult | null;
  structurePrompt: string;
  metadataPrompt: string;
  onStructurePromptChange: (value: string) => void;
  onMetadataPromptChange: (value: string) => void;
  resolvedDefaults: EffectiveIngestionPromptsWire | null;
  onAdvancedToggle: (open: boolean) => void;
}>) {
  return (
    <>
      <p className="text-sm text-ink-secondary mb-4">
        ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF /
        画像 / 音声に対応しています。
      </p>
      <label
        htmlFor={inputId}
        className={DROPZONE}
        data-dragover={isDragOver ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDragLeave();
          onFiles(e.dataTransfer.files);
        }}
      >
        <p>
          <strong className="text-ink">ファイルをドラッグ&ドロップ</strong>{" "}
          またはクリックして選択
        </p>
        <p className="text-xs mt-2 text-ink-tertiary">複数選択にも対応</p>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      <details
        className="mt-4 rounded-md border border-hairline bg-surface-elevated"
        onToggle={(e) => onAdvancedToggle(e.currentTarget.open)}
      >
        <summary className="cursor-pointer select-none px-4 py-3 text-sm text-ink-secondary list-none [&::-webkit-details-marker]:hidden">
          詳細オプション（カスタムプロンプト）
        </summary>
        <div className="px-4 pb-4">
          <p className="text-xs text-ink-tertiary mb-3">
            このアップロードだけに適用するプロンプトを指定できます。空欄の場合は下記の既定プロンプトが使われます。
          </p>
          <PromptOverrideField
            label="構造化プロンプト"
            value={structurePrompt}
            onChange={onStructurePromptChange}
            resolved={resolvedDefaults?.structure ?? null}
          />
          <PromptOverrideField
            label="メタデータ抽出プロンプト"
            value={metadataPrompt}
            onChange={onMetadataPromptChange}
            resolved={resolvedDefaults?.metadata ?? null}
          />
        </div>
      </details>
      <UploadValidationBanners result={validation} />
      {error !== null ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(error)}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end">
        <Link to="/upload" hash={() => ""} className={pillBtn}>
          取り込みキューを見る
        </Link>
      </div>
    </>
  );
}

// Canonical UI copy for the empty-resolved-default case. When the
// resolver returns an empty string (no instance default + no user
// override — the most common standard state), ingestion uses the system
// default behaviour only (fixed role declaration + output contract, with no
// additional operator intent). The wording is the SSOT defined in
// `app/core/domain/adminSettings/defaults.ts` JSDoc (Issue #396 ADR-002).
const SYSTEM_DEFAULT_PROMPT_COPY = "システム既定の動作を使用";

// Placeholder shows the leading slice of the resolved default so the user
// sees "what gets used when blank" without the textarea ballooning on a
// 16 KiB default. The full text stays available in the details below.
const PLACEHOLDER_MAX_CHARS = 140;

// Per-purpose override field: a textarea whose placeholder previews the
// resolved default, a state badge ("既定を使用中" vs "この回だけ上書き")
// driven by whether the user has typed anything, and a collapsible full
// default body that also names the source layer (user override vs
// instance default). Empty resolved text surfaces the system-default copy
// as the primary hint. See #358.
function PromptOverrideField({
  label,
  value,
  onChange,
  resolved,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  resolved: { text: string; isUserOverride: boolean } | null;
}>) {
  const fieldId = useId();
  const badgeId = useId();
  const sourceId = useId();
  const isOverriding = value.trim().length > 0;
  const defaultText = resolved?.text ?? "";
  const hasDefaultText = defaultText.length > 0;
  const placeholder =
    resolved === null
      ? undefined
      : hasDefaultText
        ? defaultText.length > PLACEHOLDER_MAX_CHARS
          ? `${defaultText.slice(0, PLACEHOLDER_MAX_CHARS)}…`
          : defaultText
        : SYSTEM_DEFAULT_PROMPT_COPY;
  // Source-layer label. `isUserOverride === true` implies non-empty resolved
  // text — the usecase derives `isUserOverride` with the same predicate the
  // resolver uses to adopt the override (`entry.text.length > 0`), so the
  // "ユーザー設定で上書き中" branch never coexists with empty `defaultText`.
  const sourceLabel = resolved?.isUserOverride
    ? "ユーザー設定で上書き中"
    : hasDefaultText
      ? "インスタンス既定"
      : "システム既定";
  return (
    <div className={field}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className={fieldLabel}>
          {label}
        </label>
        <span
          id={badgeId}
          className="text-[11px] rounded-pill px-2 py-[2px] bg-surface text-ink-tertiary data-[overriding]:bg-accent-surface data-[overriding]:text-accent"
          data-overriding={isOverriding || undefined}
        >
          {isOverriding ? "この回だけ上書き" : "既定を使用中"}
        </span>
      </div>
      <textarea
        id={fieldId}
        className={`${fieldControl} min-h-[96px] resize-y`}
        maxLength={16 * 1024}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={
          resolved === null ? badgeId : `${badgeId} ${sourceId}`
        }
      />
      {resolved !== null ? (
        <div id={sourceId} className="text-xs text-ink-tertiary">
          <p>
            既定の出所:{" "}
            <span className="text-ink-secondary">{sourceLabel}</span>
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer select-none text-ink-secondary list-none [&::-webkit-details-marker]:hidden">
              既定値を表示
            </summary>
            {hasDefaultText ? (
              <pre className="mt-2 whitespace-pre-wrap break-words text-ink-secondary font-mono text-mono">
                {defaultText}
              </pre>
            ) : (
              <p className="mt-2 text-ink-secondary">
                {SYSTEM_DEFAULT_PROMPT_COPY}
              </p>
            )}
          </details>
        </div>
      ) : null}
    </div>
  );
}

function UploadingView({ total }: Readonly<{ total: number }>) {
  return (
    <div className="py-8 text-center text-sm text-ink-secondary">
      <SkeletonBlock />
      <p className="mt-4">
        {total === 1
          ? "アップロード中..."
          : `${total} 件のファイルをアップロード中...`}
      </p>
    </div>
  );
}

function WaitingView() {
  return (
    <div className="py-8 text-center text-sm text-ink-secondary">
      <SkeletonBlock />
      <p className="mt-4">LLM がタイトルとメタデータを提案中...</p>
      <p className="mt-1 text-xs text-ink-tertiary">
        この処理には数十秒かかることがあります
      </p>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-3 bg-surface rounded-md w-3/4 mx-auto motion-safe:animate-pulse" />
      <div className="h-3 bg-surface rounded-md w-1/2 mx-auto motion-safe:animate-pulse" />
      <div className="h-3 bg-surface rounded-md w-2/3 mx-auto motion-safe:animate-pulse" />
    </div>
  );
}

function FailedView({
  job,
  onClose,
  onRetried,
}: Readonly<{
  job: IngestionJobWire;
  onClose: () => void;
  onRetried: (jobId: string) => void;
}>) {
  const router = useRouter();
  const discard = useServerFn(discardIngestionPreviewFn);
  const retry = useServerFn(ownerRetryIngestionJobFn);
  const [isPending, setIsPending] = useState(false);
  const [err, setErr] = useState<SerializedError | null>(null);
  const onDiscard = () => {
    setIsPending(true);
    void (async () => {
      try {
        await discard({ data: { jobId: job.id } });
        await routerInvalidate(router);
        onClose();
      } catch (e) {
        setErr(extractSerializedError(e));
        setIsPending(false);
      }
    })();
  };
  // Retry returns the job to `pending` and re-drives the LLM. Hand off to
  // `onRetried` (same handler as regeneration) so the dialog re-enters the
  // `waiting` view and the polling loop tracks it back to `editing`.
  const onRetry = () => {
    setIsPending(true);
    void (async () => {
      try {
        await retry({ data: { jobId: job.id } });
        onRetried(job.id);
      } catch (e) {
        setErr(extractSerializedError(e));
        setIsPending(false);
      }
    })();
  };
  return (
    <div className="py-4">
      <p className="text-sm text-ink mb-2">
        取り込みに失敗しました: {job.originalFileName}
      </p>
      {(() => {
        const msg = displayJobErrorCode(job.errorCode);
        return msg !== null ? (
          <p className="text-sm text-ink-secondary mb-4" role="alert">
            {msg}
          </p>
        ) : null;
      })()}
      {err !== null ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(err)}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          type="button"
          className={pillBtn}
          onClick={onRetry}
          disabled={isPending}
        >
          再試行
        </button>
        <Link
          to="/upload"
          hash={() => ""}
          className={`${pillBtn} aria-disabled:pointer-events-none`}
          aria-disabled={isPending || undefined}
          tabIndex={isPending ? -1 : undefined}
        >
          キュー画面で詳細を見る
        </Link>
        <button
          type="button"
          className={pillBtn}
          data-danger=""
          onClick={onDiscard}
          disabled={isPending}
        >
          破棄
        </button>
      </div>
    </div>
  );
}

function MultiResultView({
  total,
  succeeded,
  failedNames,
  onClose,
}: Readonly<{
  total: number;
  succeeded: number;
  failedNames: readonly string[];
  onClose: () => void;
}>) {
  const failed = failedNames.length;
  return (
    <div className="py-2">
      <p className="text-sm text-ink mb-2">
        {total} 件中 {succeeded} 件をキューに追加しました
        {failed > 0 ? `（${failed} 件失敗）` : ""}。
      </p>
      <p className="text-sm text-ink-secondary">
        各ジョブのプレビューはキュー画面から順次操作できます。
      </p>
      {failedNames.length > 0 ? (
        <ul className="mt-3 text-xs text-ink-tertiary list-disc pl-5">
          {failedNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" className={pillBtn} onClick={onClose}>
          閉じる
        </button>
        <Link to="/upload" hash={() => ""} className={pillBtn} data-primary="">
          キュー画面を開く
        </Link>
      </div>
    </div>
  );
}

function QueueGuidanceView({
  error,
  onClose,
}: Readonly<{
  error: SerializedError | null;
  onClose: () => void;
}>) {
  return (
    <div className="py-2">
      <p className="text-sm text-ink mb-2">待機中にエラーが発生しました。</p>
      {error !== null ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(error)}
        </p>
      ) : null}
      <p className="text-sm text-ink-secondary">
        ジョブはキューに残っています。キュー画面から続きを操作できます。
      </p>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" className={pillBtn} onClick={onClose}>
          閉じる
        </button>
        <Link to="/upload" hash={() => ""} className={pillBtn} data-primary="">
          キュー画面を開く
        </Link>
      </div>
    </div>
  );
}

function CommittedView({
  noteId,
  title,
  onClose,
}: Readonly<{
  noteId: string;
  title: string;
  onClose: () => void;
}>) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 text-success mb-2">
        <span className="inline-flex motion-safe:animate-pulse">
          <Icon icon={CheckCircle2} size={20} />
        </span>
        <p className="text-sm font-medium text-ink">ノートを登録しました</p>
      </div>
      <p className="text-sm text-ink-secondary break-words">
        「{title.length > 0 ? title : "無題のノート"}」を作成しました。
      </p>
      <div className="flex flex-wrap justify-end gap-2 mt-6">
        <button type="button" className={pillBtn} onClick={onClose}>
          閉じる
        </button>
        {/* No onClick={onClose} here: onClose runs router.navigate({to:"."})
            + replaceState, which would race the Link's own navigation to
            the note. Navigating to /notes/$noteId drops the #upload hash,
            so `open` flips false and the dialog closes on its own — same
            convention as the other views' Links. */}
        <Link
          to="/notes/$noteId"
          params={{ noteId }}
          className={pillBtn}
          data-primary=""
        >
          ノートを開く
        </Link>
      </div>
    </div>
  );
}

function TimedOutView({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
    <div className="py-2">
      <p className="text-sm text-ink mb-2">
        推論の完了を待ちきれませんでした。
      </p>
      <p className="text-sm text-ink-secondary">
        ジョブはキューに残っています。キュー画面から続きを操作できます。
      </p>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" className={pillBtn} onClick={onClose}>
          閉じる
        </button>
        <Link to="/upload" hash={() => ""} className={pillBtn} data-primary="">
          キュー画面を開く
        </Link>
      </div>
    </div>
  );
}
