"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { bulkExportNotesFn } from "../actions";
import {
  checkboxRow,
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
  radioRow,
} from "../styles";
import { useSelection } from "./SelectionContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ExportFormat = "html" | "markdown" | "pdf";

export function BulkExportDialog({ open, onClose }: Props) {
  const router = useRouter();
  const enqueue = useServerFn(bulkExportNotesFn);
  const { state, dispatch } = useSelection();
  const [format, setFormat] = useState<ExportFormat>("html");
  const [includeFrontMatter, setIncludeFrontMatter] = useState(true);
  const [embedMedia, setEmbedMedia] = useState(false);
  const [pdfPaperSize, setPdfPaperSize] = useState<"A4" | "Letter">("A4");
  const [error, setError] = useState<SerializedError | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const radioName = useId();

  if (!open) return null;

  const ids = [...state.ids];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ids.length === 0) return;
    setError(null);
    setBatchError(null);
    startTransition(async () => {
      try {
        const result = await enqueue({
          data: {
            noteIds: ids,
            format,
            options: {
              includeFrontMatter,
              embedMedia,
              pdfPaperSize: format === "pdf" ? pdfPaperSize : null,
            },
          },
        });
        void result;
        dispatch({ type: "clear" });
        onClose();
        await router.navigate({ to: "/exports", search: { offset: 0 } });
      } catch (e) {
        const err = extractSerializedError(e);
        if (
          err.kind === "validation" &&
          err.fieldErrors?.noteIds !== undefined
        ) {
          setBatchError("一度にエクスポートできるのは 100 件までです");
        } else {
          setError(err);
        }
      }
    });
  };

  return (
    <div
      className={dialogBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="一括エクスポート"
    >
      <form className={dialog} onSubmit={submit}>
        <h2 className={dialogTitle}>{ids.length} 件のノートをエクスポート</h2>
        <fieldset className={field}>
          <legend className={fieldLabel}>形式</legend>
          {(["html", "markdown", "pdf"] as const).map((f) => (
            <label key={f} className={radioRow}>
              <input
                type="radio"
                name={radioName}
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              <span>
                {f === "html" ? "HTML" : f === "markdown" ? "Markdown" : "PDF"}
              </span>
            </label>
          ))}
        </fieldset>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={includeFrontMatter}
            onChange={(e) => setIncludeFrontMatter(e.target.checked)}
          />
          FrontMatter を含める
        </label>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={embedMedia}
            onChange={(e) => setEmbedMedia(e.target.checked)}
          />
          メディアを埋め込む
        </label>
        {format === "pdf" ? (
          <div className={field}>
            <span className="text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em]">
              用紙
            </span>
            <select
              value={pdfPaperSize}
              onChange={(e) =>
                setPdfPaperSize(e.target.value as "A4" | "Letter")
              }
              className={fieldControl}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </select>
          </div>
        ) : null}
        {error !== null ? (
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        {batchError !== null ? (
          <p className={formError} role="alert">
            {batchError}
          </p>
        ) : null}
        <div className={dialogActions}>
          <button
            type="button"
            className={pillBtn}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={isPending}
          >
            {isPending ? "実行中..." : "実行"}
          </button>
        </div>
      </form>
    </div>
  );
}
