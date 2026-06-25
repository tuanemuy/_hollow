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
// Give-up ceiling for a job stuck in `processing` (worker異常 / 再配信されない)
// so the dialog does not poll forever (W-003). The worker may still finish the
// job afterwards; we therefore stop with a *non-error* "taking long" notice
// rather than a failure. 2 minutes ≈ 80 ticks at the 1.5s interval — generous
// for a normal short merge yet bounded.
const POLL_GIVE_UP_MS = 120_000;
// Consecutive transient (non-fatal) poll failures tolerated before surfacing an
// error (W-002), mirroring `IngestionQueue`'s `failuresRef >= 3` budget. A
// single network blip must not stop polling / show a false failure while the
// background job is completing.
const MAX_TRANSIENT_FAILURES = 3;

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
  // Set once polling gives up on a long-running job (W-003). Not an error: the
  // worker may still finish; we just stop polling and tell the user the result
  // will appear later.
  const [gaveUp, setGaveUp] = useState(false);

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

  // W-001: closing mid-flight stops polling, so the completion-driven
  // `onMerged` (ADR-005's reflection point) would never fire and the
  // already-deleted source tag would linger in the list. Best-effort re-fetch
  // the loader on close while a job is in flight so a job that finished (or is
  // finishing) is reflected. Limit: a completion landing *after* this close is
  // still missed until the next navigation (see ADR-009).
  const handleClose = () => {
    if (isRunning) onMergedRef.current();
    onClose();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === "" || isRunning) return;
    setErrorMessage(null);
    setProcessed(0);
    setTotal(0);
    setHasProgress(false);
    setGaveUp(false);
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
    // Transient-failure budget (W-002): only a fatal kind or `MAX_TRANSIENT_
    // FAILURES` consecutive blips stop polling. A success resets the count.
    let failures = 0;
    // Give-up clock (W-003): elapsed from job acceptance, checked every tick.
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_GIVE_UP_MS) {
        cancelled = true;
        setGaveUp(true);
        return;
      }
      if (document.visibilityState !== "hidden" && !inFlight) {
        inFlight = true;
        try {
          const { job } = await poll({ data: { jobId } });
          if (cancelled) return;
          failures = 0;
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
          if (cancelled) return;
          const serialized = extractSerializedError(err);
          // Fatal kinds (auth) can never recover by retrying — surface and stop
          // immediately, matching `IngestionQueue`. Transient kinds get the
          // retry budget so one blip doesn't abort a job that will complete.
          const fatal =
            serialized.kind === "unauthorized" ||
            serialized.kind === "forbidden";
          failures += 1;
          if (fatal || failures >= MAX_TRANSIENT_FAILURES) {
            cancelled = true;
            setErrorMessage(displayError(serialized));
            return;
          }
          // Below budget: fall through to re-schedule and try again.
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
    <Dialog open={open} onClose={handleClose} ariaLabelledBy={titleId}>
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          タグを統合
        </h2>

        {isRunning ? (
          <div className="mt-2">
            {gaveUp ? (
              <p className={DIALOG_DESCRIPTION}>
                統合に時間がかかっています。バックグラウンドで処理が続いている可能性があります。閉じても問題ありません。完了すると一覧に反映されます。
              </p>
            ) : (
              <p className={DIALOG_DESCRIPTION}>
                #{sourceName} を
                {targetTag !== undefined ? ` #${targetTag.name} ` : ""}
                に統合しています…
              </p>
            )}
            {gaveUp ? null : determinate ? (
              <>
                <span className="tabular-nums text-sm text-ink-secondary">
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
          <button type="button" className={pillBtn} onClick={handleClose}>
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
