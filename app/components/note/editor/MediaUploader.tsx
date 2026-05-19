"use client";

import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import {
  finalizeMediaUploadFn,
  presignMediaUploadFn,
} from "@/components/media/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { field, fieldLabel, pillBtn } from "../styles";
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
  | { kind: "uploading" }
  | { kind: "error"; error: SerializedError; lastFile: File | null };

function kindForMime(mimeType: string): "image" | "video" {
  if (mimeType.startsWith("video/")) return "video";
  return "image";
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
    setState({ kind: "uploading" });
    try {
      const presigned = await presignMediaUpload({
        data: {
          kind: kindForMime(file.type),
          mimeType: file.type,
          byteSize: file.size,
        },
      });
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed with status ${putRes.status}`);
      }
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
        <p className="text-xs text-ink-tertiary mt-2" aria-live="polite">
          アップロード中…
        </p>
      ) : null}
      {state.kind === "error" ? (
        <div
          className="text-error text-[13px] mt-2 flex flex-col gap-2"
          role="alert"
        >
          <p>アップロードに失敗: {displayError(state.error)}</p>
          {state.lastFile !== null ? (
            <button type="button" className={pillBtn} onClick={onRetry}>
              再試行
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
