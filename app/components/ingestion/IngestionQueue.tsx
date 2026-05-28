"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import { EMPTY_STATE, FORM_ERROR } from "../layout/styles";
import { getIngestionJobsFn, type IngestionJobWire } from "./actions";
import { IngestionJobRow } from "./IngestionJobRow";

const POLL_INTERVAL_MS = 4000;
const POLL_BACKOFF_MS = 12000;
const POLL_IDLE_MS = 16000;

const ACTIVE_STATUSES: ReadonlySet<IngestionJobWire["status"]> = new Set([
  "pending",
  "processing",
]);

type Props = Readonly<{
  initialJobs: readonly IngestionJobWire[];
}>;

export function IngestionQueue({ initialJobs }: Props) {
  const fetchJobs = useServerFn(getIngestionJobsFn);
  const [jobs, setJobs] = useState<readonly IngestionJobWire[]>(initialJobs);
  const [pollErrorMessage, setPollErrorMessage] = useState<string | null>(null);

  // jobsRef holds the latest jobs so the polling tick can compute the
  // next interval without needing `jobs` in the effect's dependency
  // array — that would cause cleanup+re-run on every state update.
  const jobsRef = useRef<readonly IngestionJobWire[]>(initialJobs);
  jobsRef.current = jobs;

  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const fatalRef = useRef(false);

  useEffect(() => {
    // Re-runs (e.g. fast-refresh) must not revive polling after a fatal kind.
    if (fatalRef.current) return;
    cancelledRef.current = false;

    const computeInterval = () => {
      const activeCount = jobsRef.current.filter((j) =>
        ACTIVE_STATUSES.has(j.status),
      ).length;
      if (activeCount > 0) {
        return failuresRef.current > 0 ? POLL_BACKOFF_MS : POLL_INTERVAL_MS;
      }
      return POLL_IDLE_MS;
    };

    const schedule = (delayMs: number) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelledRef.current || fatalRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        schedule(POLL_IDLE_MS);
        return;
      }
      try {
        const { jobs: nextJobs } = await fetchJobs({ data: { limit: 50 } });
        if (cancelledRef.current || fatalRef.current) return;
        setJobs(nextJobs);
        setPollErrorMessage(null);
        failuresRef.current = 0;
      } catch (e) {
        if (cancelledRef.current || fatalRef.current) return;
        // extractSerializedError is used purely to classify the kind —
        // display text is built via displayError(e).
        const err = extractSerializedError(e);
        if (
          err.kind === "unauthorized" ||
          err.kind === "forbidden" ||
          err.kind === "notFound"
        ) {
          fatalRef.current = true;
          setPollErrorMessage(displayError(e));
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          return;
        }
        failuresRef.current += 1;
        if (failuresRef.current >= 3) setPollErrorMessage(displayError(e));
      }
      if (cancelledRef.current || fatalRef.current) return;
      schedule(computeInterval());
    };

    const onVisibility = () => {
      if (cancelledRef.current || fatalRef.current) return;
      if (document.visibilityState === "visible") {
        schedule(0);
      }
    };

    schedule(POLL_INTERVAL_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchJobs]);

  return (
    <>
      {pollErrorMessage !== null ? (
        <p className={FORM_ERROR} role="status" aria-live="polite">
          進捗の自動更新に失敗しました: {pollErrorMessage}
        </p>
      ) : null}
      {jobs.length === 0 ? (
        <div className={EMPTY_STATE}>
          <h2 className="text-xl font-medium text-ink mb-2">
            まだジョブがありません
          </h2>
          <p className="text-sm">
            ファイルをアップロードすると、ここに進行状況が表示されます。
          </p>
        </div>
      ) : (
        <div aria-live="polite">
          {jobs.map((job) => (
            <IngestionJobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}
