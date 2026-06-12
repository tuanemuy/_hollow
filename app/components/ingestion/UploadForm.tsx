"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { RetryableError } from "@/components/common/RetryableError";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  ALERT,
  ALERT_BODY,
  ALERT_BODY_CODE,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_TITLE,
  ALERT_WARNING,
} from "@/components/common/styles";
import { IngestionService } from "@/core/domain/ingestion/service";
import { DEFAULT_MAX_INGESTION_BYTES } from "@/core/domain/ingestion/valueObject";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { uploadFileFn } from "./actions";

const DROPZONE =
  "block border-2 border-dashed border-hairline-strong rounded-xl px-6 py-12 text-center text-ink-secondary bg-surface-elevated transition-all motion-reduce:transition-none cursor-pointer hover:border-accent hover:bg-accent-surface data-[dragover]:border-accent data-[dragover]:bg-accent-surface [&_input[type=file]]:hidden";

/**
 * Human-readable enumeration of the supported formats for the unsupported-format
 * alert body. Kept inline (not derived from `format-chips`) so the alert is
 * self-contained — see `.issue/541/plan.md` scope note.
 */
export const SUPPORTED_FORMATS_LABEL =
  "HTML / Markdown / Word / Excel / PowerPoint / PDF / 画像 / 音声 / テキスト";

export type FileValidationResult = {
  /** Files whose format `detectKind` could not classify. */
  readonly unsupported: readonly string[];
  /** Files exceeding the default upload byte cap. */
  readonly oversized: readonly { name: string; sizeLabel: string }[];
  /** Files that passed both checks, in input order. */
  readonly accepted: readonly File[];
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side UX guard mirroring the server's two-tier check: rejects
 * obviously unsupported formats (via the pure domain `detectKind`) and
 * obvious size overflows (via `DEFAULT_MAX_INGESTION_BYTES`) before submit.
 * The authoritative validation still runs server-side; this only spares the
 * user a round trip for clear-cut failures.
 */
export function validateUploadFiles(
  files: FileList | readonly File[],
): FileValidationResult {
  const list: File[] = [];
  if (Array.isArray(files)) {
    list.push(...files);
  } else {
    const fileList = files as FileList;
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList.item(i);
      if (f !== null) list.push(f);
    }
  }

  const unsupported: string[] = [];
  const oversized: { name: string; sizeLabel: string }[] = [];
  const accepted: File[] = [];

  for (const file of list) {
    try {
      IngestionService.detectKind(file.type, file.name);
    } catch {
      unsupported.push(file.name);
      continue;
    }
    if (file.size > DEFAULT_MAX_INGESTION_BYTES) {
      oversized.push({
        name: file.name,
        sizeLabel: formatMegabytes(file.size),
      });
      continue;
    }
    accepted.push(file);
  }

  return { unsupported, oversized, accepted };
}

/**
 * Renders the unsupported-format (`.alert-error`) and size-over
 * (`.alert-warning`) banners from a validation result. Shared by the
 * upload page (`UploadForm`) and the header modal (`UploadDialog`) so the
 * client-guard feedback is identical in both places (ADR-004).
 */
export function UploadValidationBanners({
  result,
}: Readonly<{ result: FileValidationResult | null }>) {
  if (result === null) return null;
  const { unsupported, oversized } = result;
  return (
    <>
      {unsupported.length > 0 ? (
        <div className={`${ALERT} ${ALERT_ERROR} mt-4`} role="alert">
          <span className={ALERT_ICON}>
            <Icon icon={AlertCircle} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>対応外の形式が含まれています</p>
            <p className={ALERT_BODY}>
              次のファイルはアップロードできません:{" "}
              {unsupported.map((name, i) => (
                <span key={name}>
                  {i > 0 ? ", " : null}
                  <code className={ALERT_BODY_CODE}>{name}</code>
                </span>
              ))}
              。対応形式 ({SUPPORTED_FORMATS_LABEL}) のみ取り込めます。
            </p>
          </div>
        </div>
      ) : null}
      {oversized.length > 0 ? (
        <div className={`${ALERT} ${ALERT_WARNING} mt-4`} role="alert">
          <span className={ALERT_ICON}>
            <Icon icon={AlertTriangle} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>サイズ超過のファイル</p>
            <p className={ALERT_BODY}>
              次のファイルは上限 50 MB を超えています:{" "}
              {oversized.map(({ name, sizeLabel }, i) => (
                <span key={name}>
                  {i > 0 ? ", " : null}
                  <code className={ALERT_BODY_CODE}>
                    {name} ({sizeLabel})
                  </code>
                </span>
              ))}
              。分割するか、個別にアップロードしてください。
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function UploadForm() {
  const router = useRouter();
  const upload = useServerFn(uploadFileFn);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validation, setValidation] = useState<FileValidationResult | null>(
    null,
  );
  // The accepted files of the last submission, so a failed upload can be
  // re-submitted as-is via the inline retry affordance.
  const lastAcceptedRef = useRef<readonly File[]>([]);

  const inputId = useId();

  const uploadAccepted = (accepted: readonly File[]) => {
    if (accepted.length === 0) return;
    lastAcceptedRef.current = accepted;
    setError(null);
    startTransition(async () => {
      try {
        for (const file of accepted) {
          const formData = new FormData();
          formData.append("file", file);
          await upload({ data: formData });
        }
        await routerInvalidate(router);
        if (fileInputRef.current !== null) {
          fileInputRef.current.value = "";
        }
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const submitFiles = (files: FileList | null) => {
    if (files === null || files.length === 0) return;
    setError(null);
    const result = validateUploadFiles(files);
    setValidation(result);
    uploadAccepted(result.accepted);
  };

  return (
    <>
      <label
        htmlFor={inputId}
        className={DROPZONE}
        data-dragover={isDragOver ? "" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          submitFiles(e.dataTransfer.files);
        }}
      >
        <p>
          <strong className="text-ink">ファイルをドラッグ&ドロップ</strong>{" "}
          またはクリックして選択
        </p>
        <p className="text-sm mt-2 text-ink-tertiary">
          {isPending ? "アップロード中..." : "複数選択にも対応"}
        </p>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          onChange={(e) => submitFiles(e.target.files)}
          disabled={isPending}
        />
      </label>
      <UploadValidationBanners result={validation} />
      {error !== null ? (
        <RetryableError
          className="mt-2"
          error={error}
          onRetry={() => uploadAccepted(lastAcceptedRef.current)}
          isRetrying={isPending}
        />
      ) : null}
    </>
  );
}
