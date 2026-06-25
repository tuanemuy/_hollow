"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import { getTagMergeJobFn, mergeTagsFn } from "./actions";
import { progressBar, progressBarIndeterminate, progressTrack } from "./styles";

type Props = {
  sourceTagId: string;
  sourceName: string;
  sourceNoteCount: number;
  candidates: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  // Called once the background merge job completes. The parent reflects the
  // result (source tag disappears, references updated) via `routerInvalidate`
  // — there is no enqueue-time optimistic removal anymore (ADR-005).
  onMerged: () => void;
};

const DIALOG_DESCRIPTION = "text-sm text-ink-secondary mt-2";
const POLL_INTERVAL_MS = 1500;

export function MergeTagDialog({
  sourceTagId,
  sourceName,
  sourceNoteCount,
  candidates,
  open,
  onClose,
  onMerged,
}: Props) {
  const enqueue = useServerFn(mergeTagsFn);
  const poll = useServerFn(getTagMergeJobFn);

  const [target, setTarget] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasProgress, setHasProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetId = useId();
  const titleId = useId();

  // Keep parent callbacks in refs so the polling effect depends only on
  // `jobId` and does not restart when the parent re-renders new closures.
  const onMergedRef = useRef(onMerged);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onMergedRef.current = onMerged;
    onCloseRef.current = onClose;
  });

  const targetTag = candidates.find((c) => c.id === target);
  const isRunning = jobId !== null && errorMessage === null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === "" || isRunning) return;
    setErrorMessage(null);
    setProcessed(0);
    setTotal(0);
    setHasProgress(false);
    try {
      const { jobId: id } = await enqueue({
        data: { sourceTagId, targetTagId: target },
      });
      setJobId(id);
    } catch (err) {
      setErrorMessage(displayError(extractSerializedError(err)));
    }
  };

  // Poll the self-owned job until it completes / fails, mirroring
  // `ExportJobDetail` (interval + `visibilityState` guard + in-flight guard).
  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "hidden" && !inFlight) {
        inFlight = true;
        try {
          const { job } = await poll({ data: { jobId } });
          if (cancelled) return;
          setProcessed(job.progress.processed);
          setTotal(job.progress.total);
          setHasProgress(true);
          if (job.status === "completed") {
            cancelled = true;
            onMergedRef.current();
            onCloseRef.current();
            return;
          }
          if (job.status === "failed") {
            cancelled = true;
            setErrorMessage(job.errorReason ?? "タグの統合に失敗しました。");
            return;
          }
        } catch (err) {
          if (!cancelled) {
            cancelled = true;
            setErrorMessage(displayError(extractSerializedError(err)));
          }
          return;
        } finally {
          inFlight = false;
        }
      }
      if (cancelled) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Poll immediately on mount, then on the interval.
    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [jobId, poll]);

  const determinate = hasProgress && total > 0;
  const pct = determinate
    ? Math.min(100, Math.round((processed / total) * 100))
    : 0;

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy={titleId}>
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          タグを統合
        </h2>

        {isRunning ? (
          <div className="mt-2">
            <p className={DIALOG_DESCRIPTION}>
              #{sourceName} を
              {targetTag !== undefined ? ` #${targetTag.name} ` : ""}
              に統合しています…
            </p>
            {determinate ? (
              <>
                <span className="font-mono text-sm text-ink-secondary">
                  {processed}/{total}
                </span>
                <div
                  className={progressTrack}
                  role="progressbar"
                  aria-label="統合の進捗"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={processed}
                >
                  <div className={progressBar} style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <div
                className={progressTrack}
                role="progressbar"
                aria-label="統合の進捗"
                aria-busy={true}
              >
                <div className={progressBarIndeterminate} />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              <label htmlFor={targetId} className={fieldLabel}>
                統合先タグ
              </label>
              <select
                id={targetId}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                className={fieldControl}
              >
                <option value="">— 選択してください —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
            {targetTag !== undefined ? (
              <p className={DIALOG_DESCRIPTION}>
                #{sourceName} を #{targetTag.name} に統合します。
                {sourceNoteCount > 0 ? (
                  <>
                    {" "}
                    <strong>対象ノート: {sourceNoteCount} 件</strong>。
                  </>
                ) : null}{" "}
                #{sourceName} は削除され、参照ノートは #{targetTag.name}{" "}
                を持つよう更新されます。
              </p>
            ) : null}
          </>
        )}

        {errorMessage !== null ? (
          <p className={`${formError} mt-3`} role="alert" aria-live="polite">
            {errorMessage}
          </p>
        ) : null}

        <div className={dialogActions}>
          <button type="button" className={pillBtn} onClick={onClose}>
            {isRunning ? "閉じる" : "キャンセル"}
          </button>
          {isRunning ? null : (
            <button
              type="submit"
              className={`${pillBtn} ${pillBtnPrimary}`}
              data-primary=""
              disabled={target === ""}
            >
              統合
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
