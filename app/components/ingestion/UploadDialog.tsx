"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { Icon } from "@/components/common/Icon";
import { ProgressBar } from "@/components/common/ProgressBar";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { Skeleton } from "@/components/common/Skeleton";
import {
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  pillBtn,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR } from "../layout/styles";
import { AudioRecorder } from "./AudioRecorder";
import {
  type EffectiveIngestionPromptsWire,
  getEffectiveIngestionPromptsFn,
  uploadFileFn,
} from "./actions";
import { notifyIngestionQueueChanged } from "./queueBadgeBus";
import {
  type FileValidationResult,
  UploadValidationBanners,
  validateUploadFiles,
} from "./UploadForm";

/**
 * Fire-and-forget upload modal (Issue #538): files are enqueued and the
 * dialog lands on the `queued` confirmation immediately — preview editing
 * and saving happen on the `/upload` queue page (`IngestionJobEditDialog`).
 */
type View =
  | { kind: "select" }
  | { kind: "uploading"; total: number; done: number }
  | {
      kind: "queued";
      total: number;
      succeeded: number;
      failedNames: readonly string[];
    };

type Props = {
  open: boolean;
  onClose: () => void;
};

const DROPZONE =
  "block border-2 border-dashed border-hairline-strong rounded-xl px-6 py-12 text-center text-ink-secondary bg-surface-elevated transition-all motion-reduce:transition-none cursor-pointer hover:border-accent hover:bg-accent-surface data-[dragover]:border-accent data-[dragover]:bg-accent-surface [&_input[type=file]]:hidden";

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
        : `${view.total} 件中 ${view.done} 件をアップロード`;
    case "queued": {
      const base = `${view.total} 件中 ${view.succeeded} 件をキューに追加しました`;
      return view.failedNames.length > 0
        ? `${base}（${view.failedNames.length} 件失敗）`
        : base;
    }
    default:
      throw new Error(`unreachable view kind: ${JSON.stringify(view)}`);
  }
}

export function UploadDialog({ open, onClose }: Props) {
  const router = useRouter();
  const upload = useServerFn(uploadFileFn);
  const getEffectivePrompts = useServerFn(getEffectiveIngestionPromptsFn);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>({ kind: "select" });
  const [error, setError] = useState<SerializedError | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Client-side validation result for the most recent file selection, shown
  // as `.alert-error` / `.alert-warning` banners in the `select` view. `null`
  // means no selection has been validated yet.
  const [validation, setValidation] = useState<FileValidationResult | null>(
    null,
  );

  // Per-upload custom prompts entered in the `select` view's "advanced
  // options" accordion. Applied to every file of the current submission
  // (single or batch) and reset when the dialog re-opens.
  const [structurePrompt, setStructurePrompt] = useState("");
  const [metadataPrompt, setMetadataPrompt] = useState("");

  // The resolved per-purpose default prompts (what ingestion applies when
  // the override is left blank). Lazily fetched the first time the user
  // opens the custom-prompt accordion (see `onAdvancedToggle`) — most
  // uploads never open it, so we avoid a request until it is needed.
  // A fetch failure leaves this `null`, which simply suppresses the
  // default hints; the upload itself is never blocked.
  const [resolvedDefaults, setResolvedDefaults] =
    useState<EffectiveIngestionPromptsWire | null>(null);
  const promptsFetchedRef = useRef(false);

  const inputId = useId();
  const titleId = useId();

  // Focus management across view transitions: when a view swap unmounts
  // the focused element, focus falls to document.body
  // and keyboard users lose their place in the dialog. Land focus on the
  // primary action of the `queued` result, and back on the dropzone when
  // returning to `select` ("続けてアップロード"). The initial `select` on
  // open is excluded — the Dialog's own initial-focus handling owns that.
  const dropzoneRef = useRef<HTMLLabelElement>(null);
  const queuedPrimaryRef = useRef<HTMLAnchorElement>(null);
  const prevViewKindRef = useRef<View["kind"]>("select");
  useEffect(() => {
    const prev = prevViewKindRef.current;
    prevViewKindRef.current = view.kind;
    if (view.kind === prev) return;
    if (view.kind === "queued") queuedPrimaryRef.current?.focus();
    else if (view.kind === "select") dropzoneRef.current?.focus();
  }, [view.kind]);

  // Flag flipped by the `open` cleanup so in-flight `submitFiles`
  // callbacks know to skip their post-await `setView`. Without this
  // a slow upload that resolves after the modal has been dismissed
  // would silently transition the next-opened dialog into `queued`
  // for a submission the user never started.
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
      prevViewKindRef.current = "select";
      if (fileInputRef.current !== null) fileInputRef.current.value = "";
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [open]);

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
        setView({ kind: "uploading", total: 1, done: 0 });
        void (async () => {
          try {
            const formData = new FormData();
            formData.append("file", file);
            appendOverride(formData);
            await upload({ data: formData });
            // The job is enqueued at this point — notify the badge and land
            // on the `queued` view even when the dialog was dismissed
            // mid-flight, and never let a loader failure during invalidate
            // masquerade as an upload failure.
            notifyIngestionQueueChanged();
            if (!cancelledRef.current) {
              setView({
                kind: "queued",
                total: 1,
                succeeded: 1,
                failedNames: [],
              });
            }
            try {
              await routerInvalidate(router);
            } catch {
              // A leaf-loader failure must not regress the (already
              // truthful) queued result view.
            }
          } catch (e) {
            if (cancelledRef.current) return;
            setError(extractSerializedError(e));
            setView({ kind: "select" });
          }
        })();
        return;
      }

      // Multiple files: enqueue all, surface aggregate result.
      setView({ kind: "uploading", total: list.length, done: 0 });
      void (async () => {
        let succeeded = 0;
        let done = 0;
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
          done += 1;
          // Reflect the count progress live as each file settles. Guarded so a
          // dismissed dialog does not write into a stale closure.
          if (cancelledRef.current) return;
          setView({ kind: "uploading", total: list.length, done });
        }
        notifyIngestionQueueChanged();
        if (!cancelledRef.current) {
          setView({
            kind: "queued",
            total: list.length,
            succeeded,
            failedNames,
          });
        }
        try {
          await routerInvalidate(router);
        } catch {
          // A leaf-loader failure must not regress the (already truthful)
          // queued result view, nor become an unhandled rejection.
        }
      })();
    },
    [upload, router, structurePrompt, metadataPrompt],
  );

  // Lazily fetch the resolved default prompts the first time the
  // custom-prompt accordion is opened. Fired from the `details` `onToggle`
  // (open only). A failure is swallowed — the default hints simply stay
  // hidden and the upload flow is unaffected (same philosophy as the
  // directory-tree lazy load).
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

  // "続けてアップロード": return to a clean dropzone, preserving the
  // user-entered custom prompts for the next submission.
  const onUploadMore = useCallback(() => {
    setView({ kind: "select" });
    setError(null);
    setValidation(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closeOnBackdropClick={view.kind !== "uploading"}
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
          dropzoneRef={dropzoneRef}
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

      {view.kind === "uploading" ? (
        <UploadingView total={view.total} done={view.done} />
      ) : null}

      {view.kind === "queued" ? (
        <QueuedView
          total={view.total}
          succeeded={view.succeeded}
          failedNames={view.failedNames}
          primaryActionRef={queuedPrimaryRef}
          onUploadMore={onUploadMore}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function SelectView({
  inputId,
  dropzoneRef,
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
  dropzoneRef: React.RefObject<HTMLLabelElement | null>;
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
        ref={dropzoneRef}
        htmlFor={inputId}
        // Programmatic focus target only ("続けてアップロード" returns here);
        // not in the Tab order — the nested file input owns keyboard access.
        tabIndex={-1}
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
      <div className="mt-4">
        <AudioRecorder />
      </div>
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
// `app/core/domain/adminSettings/defaults.ts` JSDoc.
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
// as the primary hint.
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

const UPLOAD_SKELETON_BARS = ["w-3/4", "w-1/2", "w-2/3"] as const;

function UploadingView({
  total,
  done,
}: Readonly<{ total: number; done: number }>) {
  // Multi-file uploads run as a client-side sequential loop, so the count
  // (`done / total`) is a real, determinate progress signal — show a
  // determinate `ProgressBar`. A single file has no meaningful intra-file
  // progress (the server-fn POST does not expose upload bytes), so it stays
  // on the skeleton placeholder.
  if (total === 1) {
    return (
      <div className="py-8 text-center">
        <Skeleton
          bars={UPLOAD_SKELETON_BARS}
          align="center"
          label="アップロード中..."
        />
      </div>
    );
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="py-8">
      <p className="mb-3 text-center text-sm text-ink-secondary">
        {total} 件中 {done} 件をアップロード...
      </p>
      {/* Decorative: the always-mounted `aria-live` region above announces the
          `done / total` progress, so the bar must not double-announce. */}
      <ProgressBar value={percent} decorative />
    </div>
  );
}

function QueuedView({
  total,
  succeeded,
  failedNames,
  primaryActionRef,
  onUploadMore,
  onClose,
}: Readonly<{
  total: number;
  succeeded: number;
  failedNames: readonly string[];
  primaryActionRef: React.RefObject<HTMLAnchorElement | null>;
  onUploadMore: () => void;
  onClose: () => void;
}>) {
  const failed = failedNames.length;
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 mb-2">
        {failed === 0 ? (
          <span className="inline-flex text-success">
            <Icon icon={CheckCircle2} size={20} />
          </span>
        ) : null}
        <p className="text-sm font-medium text-ink">
          {total} 件中 {succeeded} 件をキューに追加しました
          {failed > 0 ? `（${failed} 件失敗）` : ""}。
        </p>
      </div>
      <p className="text-sm text-ink-secondary">
        タイトルやタグの編集・ノートとしての保存は、キュー画面から行えます。
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
        <button type="button" className={pillBtn} onClick={onUploadMore}>
          続けてアップロード
        </button>
        <Link
          ref={primaryActionRef}
          to="/upload"
          hash={() => ""}
          className={pillBtn}
          data-primary=""
        >
          キュー画面を開く
        </Link>
      </div>
    </div>
  );
}
