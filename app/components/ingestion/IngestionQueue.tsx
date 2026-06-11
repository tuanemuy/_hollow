"use client";

import { useServerFn } from "@tanstack/react-start";
import { Inbox } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { RetryableError } from "@/components/common/RetryableError";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { EMPTY_STATE, EMPTY_STATE_ICON } from "../layout/styles";
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
  /**
   * Mirrors the upload page's "show discarded" toggle. Forwarded to every
   * poll so a tick re-fetches with the same filter the server-rendered
   * `initialJobs` used. Toggling the URL remounts this component (keyed in
   * `UploadPage`), so in practice this value never changes within a mount;
   * it is still listed in the polling effect's deps (the effect reads it via
   * the `tick` closure) so the dependency is honest and lint-clean.
   */
  includeDiscarded: boolean;
}>;

export function IngestionQueue({ initialJobs, includeDiscarded }: Props) {
  const fetchJobs = useServerFn(getIngestionJobsFn);
  const [jobs, setJobs] = useState<readonly IngestionJobWire[]>(initialJobs);
  const [pollError, setPollError] = useState<SerializedError | null>(null);
  // `true` once a fatal kind (unauthorized / forbidden) stops polling — the
  // retry affordance is suppressed because re-fetching cannot recover it.
  const [pollFatal, setPollFatal] = useState(false);

  // jobsRef holds the latest jobs so the polling tick can compute the
  // next interval without needing `jobs` in the effect's dependency
  // array — that would cause cleanup+re-run on every state update.
  const jobsRef = useRef<readonly IngestionJobWire[]>(initialJobs);
  jobsRef.current = jobs;

  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const fatalRef = useRef(false);
  const inflightRef = useRef(false);
  // Lets the manual "今すぐ再取得" retry kick an immediate tick without
  // duplicating the polling state machine. Populated by the polling effect.
  const scheduleNowRef = useRef<(() => void) | null>(null);

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
      // Guard against `schedule(0)` from `visibilitychange` racing with an
      // in-flight tick: a second tick is suppressed entirely (no re-schedule)
      // because the currently in-flight call will re-schedule itself on
      // completion via the `finally` block below.
      if (inflightRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        schedule(POLL_IDLE_MS);
        return;
      }
      inflightRef.current = true;
      try {
        try {
          const { jobs: nextJobs } = await fetchJobs({
            data: {
              limit: 50,
              ...(includeDiscarded ? { includeDiscarded: true } : {}),
            },
          });
          if (cancelledRef.current || fatalRef.current) return;
          setJobs(nextJobs);
          setPollError(null);
          failuresRef.current = 0;
        } catch (e) {
          if (cancelledRef.current || fatalRef.current) return;
          const err = extractSerializedError(e);
          if (err.kind === "unauthorized" || err.kind === "forbidden") {
            fatalRef.current = true;
            setPollError(err);
            setPollFatal(true);
            if (timerRef.current !== null) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            return;
          }
          failuresRef.current += 1;
          if (failuresRef.current >= 3) setPollError(err);
        }
        if (cancelledRef.current || fatalRef.current) return;
        schedule(computeInterval());
      } finally {
        inflightRef.current = false;
      }
    };

    const onVisibility = () => {
      if (cancelledRef.current || fatalRef.current) return;
      if (document.visibilityState === "visible") {
        schedule(0);
      }
    };

    schedule(POLL_INTERVAL_MS);
    // Expose an immediate-tick trigger for the manual retry button. Reuses the
    // same `tick` (guarded by `inflightRef`) so the state machine is not
    // duplicated.
    scheduleNowRef.current = () => schedule(0);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelledRef.current = true;
      scheduleNowRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchJobs, includeDiscarded]);

  // Manual "今すぐ再取得" — kicks an immediate tick. No-op once polling has
  // stopped on a fatal kind (the button is suppressed in that case anyway).
  const retryNow = useCallback(() => {
    if (fatalRef.current) return;
    setPollError(null);
    failuresRef.current = 0;
    scheduleNowRef.current?.();
  }, []);

  return (
    <>
      {pollError !== null ? (
        <RetryableError
          className="mb-4"
          error={pollError}
          onRetry={pollFatal ? undefined : retryNow}
          retryLabel="今すぐ再取得"
        />
      ) : null}
      {jobs.length === 0 ? (
        <div className={EMPTY_STATE}>
          <Icon icon={Inbox} size={24} className={EMPTY_STATE_ICON} />
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
