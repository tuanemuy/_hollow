"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { enqueueExportFn, startExportFn } from "./action";

type Format = "html" | "markdown" | "pdf";
type Paper = "A4" | "Letter";

type Props = {
  /** `null` ⇒ bulk export (no preset target); string ⇒ single-note export */
  noteId: string | null;
};

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportForm({ noteId }: Props) {
  const router = useRouter();
  const startExport = useServerFn(startExportFn);
  const enqueueExport = useServerFn(enqueueExportFn);

  const [format, setFormat] = useState<Format>("html");
  const [includeFrontMatter, setIncludeFrontMatter] = useState(true);
  const [embedMedia, setEmbedMedia] = useState(true);
  const [paper, setPaper] = useState<Paper>("A4");
  const [bulkNoteIds, setBulkNoteIds] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [success, setSuccess] = useState<string>("");

  const formatId = useId();
  const fmId = useId();
  const mediaId = useId();
  const paperId = useId();
  const bulkId = useId();

  const onSubmitSingle = () => {
    if (noteId === null) return;
    startTransition(async () => {
      setError(null);
      setSuccess("");
      try {
        const { base64, mimeType, fileName } = await startExport({
          data: {
            noteId,
            format,
            options: {
              includeFrontMatter,
              embedMedia,
              pdfPaperSize: format === "pdf" ? paper : null,
            },
          },
        });
        triggerDownload(base64ToBlob(base64, mimeType), fileName);
        setSuccess(`${fileName} をダウンロードしました`);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onSubmitBulk = () => {
    const ids = bulkNoteIds
      .split(/\s+|,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0) {
      setError({
        kind: "validation",
        code: "INVALID_INPUT",
        message: "対象ノートを 1 件以上指定してください",
      });
      return;
    }
    startTransition(async () => {
      setError(null);
      setSuccess("");
      try {
        const { job } = await enqueueExport({
          data: {
            format,
            scope: "multiple",
            noteIds: ids,
            options: {
              includeFrontMatter,
              embedMedia,
              pdfPaperSize: format === "pdf" ? paper : null,
            },
          },
        });
        await router.invalidate();
        setSuccess(`ジョブを開始しました (id=${job.id})`);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const formatFieldErrors =
    error?.kind === "validation"
      ? error.fieldErrors?.["options.pdfPaperSize"]
      : undefined;
  const summary =
    error !== null && formatFieldErrors === undefined
      ? displayError(error)
      : "";

  return (
    <section>
      <h2>{noteId === null ? "エクスポート（一括）" : "エクスポート"}</h2>

      <fieldset>
        <legend>形式</legend>
        {(["html", "markdown", "pdf"] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name={formatId}
              value={v}
              checked={format === v}
              onChange={() => setFormat(v)}
              disabled={isPending}
            />
            {v.toUpperCase()}
          </label>
        ))}
      </fieldset>

      <label>
        <input
          id={fmId}
          type="checkbox"
          checked={includeFrontMatter}
          onChange={(e) => setIncludeFrontMatter(e.target.checked)}
          disabled={isPending}
        />
        <span>FrontMatter を含める</span>
      </label>
      <label>
        <input
          id={mediaId}
          type="checkbox"
          checked={embedMedia}
          onChange={(e) => setEmbedMedia(e.target.checked)}
          disabled={isPending}
        />
        <span>メディアを埋め込む</span>
      </label>

      {format === "pdf" ? (
        <fieldset>
          <legend>用紙サイズ</legend>
          {(["A4", "Letter"] as const).map((p) => (
            <label key={p}>
              <input
                type="radio"
                name={paperId}
                value={p}
                checked={paper === p}
                onChange={() => setPaper(p)}
                disabled={isPending}
              />
              {p}
            </label>
          ))}
        </fieldset>
      ) : null}

      {noteId === null ? (
        <>
          <label htmlFor={bulkId}>対象ノート ID（改行 / カンマ区切り）</label>
          <textarea
            id={bulkId}
            value={bulkNoteIds}
            onChange={(e) => setBulkNoteIds(e.target.value)}
            rows={4}
            disabled={isPending}
          />
          <button type="button" onClick={onSubmitBulk} disabled={isPending}>
            {isPending ? "登録中..." : "一括エクスポートを開始"}
          </button>
        </>
      ) : (
        <button type="button" onClick={onSubmitSingle} disabled={isPending}>
          {isPending ? "処理中..." : "ダウンロード"}
        </button>
      )}

      {formatFieldErrors !== undefined ? (
        <p role="alert">{formatFieldErrors[0]}</p>
      ) : null}
      {summary !== "" ? <p role="alert">{summary}</p> : null}
      {success !== "" ? <p aria-live="polite">{success}</p> : null}
    </section>
  );
}
