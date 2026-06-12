"use client";

import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { ProgressBar } from "@/components/common/ProgressBar";
import { RetryableError } from "@/components/common/RetryableError";
import { field, fieldLabel } from "@/components/common/styles";
import {
  finalizeMediaUploadFn,
  presignMediaUploadFn,
} from "@/components/media/actions";
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
 * Uploads run independently per file. The progress placeholder is
 * intentionally simple: showing "uploading" / "failed" inline below the
 * picker rather than draggable inline progress bars.
 */
export type MediaUploaderProps = Readonly<{
  contentHtml: string;
  onInsert: (nextHtml: string, insertion: { id: string; url: string }) => void;
  disabled?: boolean;
}>;

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number | null }
  | { kind: "error"; error: SerializedError; lastFile: File | null };

function kindForMime(mimeType: string): "image" | "video" {
  if (mimeType.startsWith("video/")) return "video";
  return "image";
}

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

export function MediaUploader({
  contentHtml,
  onInsert,
  disabled,
}: MediaUploaderProps) {
  const inputId = useId();
  const presignMediaUpload = useServerFn(presignMediaUploadFn);
  const finalizeMediaUpload = useServerFn(finalizeMediaUploadFn);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  const runUpload = async (file: File) => {
    setState({ kind: "uploading", progress: null });
    try {
      const presigned = await presignMediaUpload({
        data: {
          kind: kindForMime(file.type),
          mimeType: file.type,
          byteSize: file.size,
        },
      });
      await putWithProgress(presigned.uploadUrl, file, (percent) => {
        setState({ kind: "uploading", progress: percent });
      });
      const finalized = await finalizeMediaUpload({
        data: { mediaId: presigned.mediaId },
      });
      const nextHtml = insertMediaIntoHtml(contentHtml, {
        id: finalized.mediaId,
      });
      onInsert(nextHtml, { id: finalized.mediaId, url: finalized.url });
      setState({ kind: "idle" });
    } catch (e) {
      setState({
        kind: "error",
        error: extractSerializedError(e),
        lastFile: file,
      });
    }
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

  return (
    <div className="mt-4">
      <div className={field}>
        <label htmlFor={inputId} className={fieldLabel}>
          メディアを追加
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*,video/*"
          onChange={onPick}
          disabled={disabled === true || state.kind === "uploading"}
          className="text-sm text-ink"
        />
      </div>
      {state.kind === "uploading" ? (
        <div className="mt-2">
          <p className="text-xs text-ink-tertiary">
            <span aria-live="polite">アップロード中…</span>
            {state.progress !== null ? (
              <span aria-hidden="true">（{state.progress}%）</span>
            ) : null}
          </p>
          {state.progress !== null ? (
            <ProgressBar value={state.progress} decorative className="mt-1" />
          ) : (
            <ProgressBar decorative className="mt-1" />
          )}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <RetryableError
          error={state.error}
          onRetry={state.lastFile !== null ? onRetry : undefined}
        />
      ) : null}
    </div>
  );
}
