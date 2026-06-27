"use client";

import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { ProgressBar } from "@/components/common/ProgressBar";
import { RetryableError } from "@/components/common/RetryableError";
import {
  ALERT,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_SUCCESS,
  ALERT_TITLE,
  ALERT_WARNING,
  DROPZONE,
} from "@/components/common/styles";
import {
  finalizeMediaUploadFn,
  presignMediaUploadFn,
} from "@/components/media/actions";
import { validateMediaFile } from "@/components/media/validation";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { insertMediaIntoHtml } from "./mediaInsert";

/**
 * Three-step media uploader: presign → PUT to R2 → finalize → insert
 * into the note HTML. The `<img src="/media/<id>">` form is mandatory
 * (ADR-009) so the orphan purger and `MediaService.reconcileRefs` keep
 * the asset alive once saved.
 *
 * Implements a selection-to-upload state machine (idle → uploading → done/error),
 * with validation-rejection feedback in the idle state (no independent confirmation
 * step). The PUT phase reports real byte progress (determinate bar).
 */
export type MediaUploaderProps = Readonly<{
  contentHtml: string;
  onInsert: (nextHtml: string, insertion: { id: string; url: string }) => void;
  disabled?: boolean;
}>;

type UploadState =
  | {
      kind: "idle";
      validationRejection?: {
        reason: "unsupported" | "oversized";
        sizeLabel: string | undefined;
        filename: string;
      };
    }
  | {
      kind: "uploading";
      file: File;
      kind_: "image" | "video";
      progress: number | null;
      thumbnailUrl: string | null;
    }
  | {
      kind: "error";
      error: SerializedError;
      lastFile: File | null;
      lastKind: "image" | "video" | null;
    }
  | {
      kind: "done";
      filename: string;
    };

// fetch does not expose upload progress events, so the presigned PUT —
// the only phase with a real byte ratio — goes through XHR.
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(file);
  });
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUploader({
  contentHtml,
  onInsert,
  disabled,
}: MediaUploaderProps) {
  const inputId = useId();
  const presignMediaUpload = useServerFn(presignMediaUploadFn);
  const finalizeMediaUpload = useServerFn(finalizeMediaUploadFn);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);

  // Cleanup ObjectURL on state change (state.thumbnailUrl cleanup on each transition).
  useEffect(() => {
    if (state.kind !== "uploading") return;
    if (state.thumbnailUrl === null) return;
    const url = state.thumbnailUrl;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [state]);

  const runUpload = async (file: File) => {
    // Guard: only accept if not currently uploading.
    if (state.kind === "uploading") return;

    // Validate the file.
    const validation = validateMediaFile(file);
    if (!validation.ok) {
      setState({
        kind: "idle",
        validationRejection: {
          reason: validation.reason,
          sizeLabel: validation.sizeLabel,
          filename: file.name,
        },
      });
      return;
    }

    // Create thumbnail URL for preview (image only).
    let thumbnailUrl: string | null = null;
    if (validation.kind === "image") {
      thumbnailUrl = URL.createObjectURL(file);
    }

    setState({
      kind: "uploading",
      file,
      kind_: validation.kind,
      progress: null,
      thumbnailUrl,
    });

    try {
      const presigned = await presignMediaUpload({
        data: {
          kind: validation.kind,
          mimeType: file.type,
          byteSize: file.size,
        },
      });
      await putWithProgress(presigned.uploadUrl, file, (percent) => {
        setState((prev) => {
          if (prev.kind !== "uploading") return prev;
          return { ...prev, progress: percent };
        });
      });
      const finalized = await finalizeMediaUpload({
        data: { mediaId: presigned.mediaId },
      });
      const nextHtml = insertMediaIntoHtml(contentHtml, {
        id: finalized.mediaId,
      });
      onInsert(nextHtml, { id: finalized.mediaId, url: finalized.url });
      setState({ kind: "done", filename: file.name });
    } catch (e) {
      setState({
        kind: "error",
        error: extractSerializedError(e),
        lastFile: file,
        lastKind: validation.kind,
      });
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    if (state.kind === "uploading") return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    if (state.kind === "uploading") return;
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    if (state.kind === "uploading") return;
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file === undefined) return;
    void runUpload(file);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    void runUpload(file);
  };

  const onRetry = () => {
    if (state.kind !== "error" || state.lastFile === null) return;
    void runUpload(state.lastFile);
  };

  // The dropzone stays available in every non-uploading state (idle, after a
  // validation rejection, after an error, after a successful insert) so media
  // can be added repeatedly — mirroring the original always-present input.
  const dropzone = (
    <label
      htmlFor={inputId}
      className={DROPZONE}
      data-dragover={isDragOver ? "" : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="text-center">
        <p className="text-sm text-ink-secondary mb-3">
          <strong className="text-ink">画像・動画をドラッグ&ドロップ</strong>{" "}
          またはクリックして選択
        </p>
        <p className="text-xs text-ink-tertiary">
          対応形式: 画像・動画 / 1ファイルずつ
        </p>
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*,video/*"
        onChange={onPick}
        disabled={disabled === true}
        aria-label="メディアを挿入"
      />
    </label>
  );

  return (
    <div className="mt-4">
      {state.kind === "idle" && state.validationRejection ? (
        <div
          className={`${ALERT} ${
            state.validationRejection.reason === "unsupported"
              ? ALERT_ERROR
              : ALERT_WARNING
          } mb-4`}
          role="alert"
        >
          <span className={ALERT_ICON}>
            <Icon
              icon={
                state.validationRejection.reason === "unsupported"
                  ? AlertCircle
                  : AlertTriangle
              }
              size={20}
            />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>
              {state.validationRejection.reason === "unsupported"
                ? "対応していない形式です"
                : "ファイルサイズが大きすぎます"}
            </p>
            <p className="text-sm text-ink-secondary">
              {state.validationRejection.reason === "unsupported" ? (
                <>
                  <code className="font-mono text-xs">
                    {state.validationRejection.filename}
                  </code>{" "}
                  はアップロードできません。画像・動画ファイルのみ追加できます。
                </>
              ) : (
                <>
                  <code className="font-mono text-xs">
                    {state.validationRejection.filename} (
                    {state.validationRejection.sizeLabel})
                  </code>{" "}
                  は上限 5 GB を超えています。
                </>
              )}
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <RetryableError
          className="mb-4"
          error={state.error}
          onRetry={state.lastFile !== null ? onRetry : undefined}
        />
      ) : null}

      {state.kind === "done" ? (
        <div
          className={`${ALERT} ${ALERT_SUCCESS} mb-4`}
          role="status"
          aria-live="polite"
        >
          <span className={ALERT_ICON}>
            <Icon icon={CheckCircle2} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>ノートに挿入しました</p>
            <p className="text-sm text-ink-secondary">
              <code className="font-mono text-xs">{state.filename}</code>{" "}
              を本文に追加しました。
            </p>
          </div>
        </div>
      ) : null}

      {state.kind === "uploading" ? (
        <div className="flex gap-3">
          <div className="shrink-0">
            {state.kind_ === "image" && state.thumbnailUrl ? (
              <img
                src={state.thumbnailUrl}
                alt=""
                className="w-12 h-12 rounded-md object-cover bg-surface"
              />
            ) : (
              <div className="w-12 h-12 rounded-md bg-surface flex items-center justify-center text-ink-tertiary">
                <Icon icon={Play} size={20} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink truncate">
              {state.file.name}
            </div>
            <div className="text-xs text-ink-tertiary">
              {formatMegabytes(state.file.size)}
            </div>
            <div className="mt-2">
              <ProgressBar
                {...(state.progress !== null ? { value: state.progress } : {})}
                decorative
                ariaLabel="アップロード進捗"
              />
            </div>
            <div className="mt-1 text-xs text-ink-tertiary">
              <span aria-live="polite">アップロード中…</span>
              {state.progress !== null ? (
                <span aria-hidden="true"> ({state.progress}%)</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        dropzone
      )}
    </div>
  );
}
