"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  ALERT,
  ALERT_BODY,
  ALERT_BODY_CODE,
  ALERT_CONTENT,
  ALERT_ICON,
  ALERT_INFO,
  ALERT_TITLE,
  checkboxRow,
  field,
  fieldLabel,
  fieldTextarea,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  FORM_FOOTER,
  FORM_NOTE,
  SECTION,
  SECTION_LABEL,
  SEGMENTED,
  SEGMENTED_BTN,
} from "../styles";
import { enqueueExportFn, startExportFn } from "./action";

const SR_ONLY = "sr-only";
const PAGE_TITLE_CLASS =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-2.5 [overflow-wrap:anywhere] min-w-0";
const PAGE_SUBTITLE_CLASS = "text-[15px] text-ink-secondary mb-7 leading-snug";

type Format = "html" | "markdown" | "pdf";
type Paper = "A4" | "Letter";

/**
 * Immediate-download count ceiling. Mirrors the mock's "即時ダウンロード …
 * 最大 50 件まで" copy (`spec/design/pages/P15-export.html` L713). Above this
 * count — or whenever media is embedded — the async-job banner is recommended.
 */
const IMMEDIATE_EXPORT_LIMIT = 50;

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
        await routerInvalidate(router);
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

  // Bulk-only async-job recommendation. Count is derived from the same
  // split the submit handler uses. The banner is advisory only and never
  // blocks submit (ADR-003): show it when the selection exceeds the
  // immediate-download ceiling, or when media embedding inflates size.
  const bulkCount =
    noteId === null
      ? bulkNoteIds
          .split(/\s+|,/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0).length
      : 0;
  const showAsyncRecommendation =
    noteId === null &&
    bulkCount > 0 &&
    (bulkCount > IMMEDIATE_EXPORT_LIMIT || embedMedia);

  return (
    <section>
      <h2 className={PAGE_TITLE_CLASS}>
        {noteId === null ? "エクスポート（一括）" : "エクスポート"}
      </h2>
      <p className={PAGE_SUBTITLE_CLASS}>
        選択したノートを HTML / Markdown / PDF で書き出します。1
        件は即時ダウンロード、複数件はバックグラウンドジョブとして実行され、完了後に{" "}
        <code className="font-mono">エクスポートジョブ一覧</code>{" "}
        からダウンロードできます。
      </p>

      <fieldset className={SECTION}>
        <legend className={SECTION_LABEL}>形式</legend>
        <div className={SEGMENTED}>
          {(["html", "markdown", "pdf"] as const).map((v) => (
            <label
              key={v}
              className={SEGMENTED_BTN}
              data-active={format === v || undefined}
            >
              <input
                className={SR_ONLY}
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
        </div>
      </fieldset>

      <div className={SECTION}>
        <span className={SECTION_LABEL}>オプション</span>
        <label className={checkboxRow}>
          <input
            id={fmId}
            type="checkbox"
            checked={includeFrontMatter}
            onChange={(e) => setIncludeFrontMatter(e.target.checked)}
            disabled={isPending}
          />
          <span>FrontMatter を含める</span>
        </label>
        <label className={checkboxRow}>
          <input
            id={mediaId}
            type="checkbox"
            checked={embedMedia}
            onChange={(e) => setEmbedMedia(e.target.checked)}
            disabled={isPending}
          />
          <span>メディアを埋め込む</span>
        </label>
      </div>

      {format === "pdf" ? (
        <fieldset className={SECTION}>
          <legend className={SECTION_LABEL}>用紙サイズ</legend>
          <div className={`${SEGMENTED} max-w-[280px]`}>
            {(["A4", "Letter"] as const).map((p) => (
              <label
                key={p}
                className={SEGMENTED_BTN}
                data-active={paper === p || undefined}
              >
                <input
                  className={SR_ONLY}
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
          </div>
        </fieldset>
      ) : null}

      {noteId === null ? (
        <>
          <div className={field}>
            <label className={fieldLabel} htmlFor={bulkId}>
              対象ノート ID（改行 / カンマ区切り）
            </label>
            <textarea
              id={bulkId}
              className={fieldTextarea}
              value={bulkNoteIds}
              onChange={(e) => setBulkNoteIds(e.target.value)}
              rows={4}
              disabled={isPending}
            />
          </div>
          {showAsyncRecommendation ? (
            <div className={`${ALERT} ${ALERT_INFO} mt-4`} role="note">
              <span className={ALERT_ICON}>
                <Icon icon={Info} size={20} />
              </span>
              <div className={ALERT_CONTENT}>
                <p className={ALERT_TITLE}>非同期ジョブを推奨します</p>
                <p className={ALERT_BODY}>
                  選択中の {bulkCount} 件は即時 DL
                  可能ですが、容量が増えるため非同期ジョブを推奨します。完了したら{" "}
                  <code className={ALERT_BODY_CODE}>
                    エクスポートジョブ一覧
                  </code>{" "}
                  から確認できます。
                </p>
              </div>
            </div>
          ) : null}
          <div className={FORM_FOOTER}>
            {success !== "" ? (
              <p className={FORM_NOTE} aria-live="polite">
                {success}
              </p>
            ) : null}
            <button
              type="button"
              className={`${pillBtn} ${pillBtnPrimary}`}
              data-primary=""
              onClick={onSubmitBulk}
              disabled={isPending}
            >
              {isPending ? "登録中..." : "一括エクスポートを開始"}
            </button>
          </div>
        </>
      ) : (
        <div className={FORM_FOOTER}>
          {success !== "" ? (
            <p className={FORM_NOTE} aria-live="polite">
              {success}
            </p>
          ) : null}
          <button
            type="button"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            onClick={onSubmitSingle}
            disabled={isPending}
          >
            {isPending ? "処理中..." : "ダウンロード"}
          </button>
        </div>
      )}

      {formatFieldErrors !== undefined ? (
        <p className={formError} role="alert">
          {formatFieldErrors[0]}
        </p>
      ) : null}
      {summary !== "" ? (
        <p className={formError} role="alert">
          {summary}
        </p>
      ) : null}
    </section>
  );
}
