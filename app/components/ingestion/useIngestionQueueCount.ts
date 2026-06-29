"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getIngestionQueueCountFn } from "./actions";
import { subscribeIngestionQueueChanged } from "./queueBadgeBus";

/**
 * Live count of the actor's unprocessed (pending / processing / previewing)
 * ingestion jobs for the sidebar upload nav item. Re-fetches on mount, on
 * visibility restore, and on `notifyIngestionQueueChanged()` — no standing
 * poll (`.issue/538/adr.md` ADR-002). A fetch failure leaves the current
 * count untouched: a transient error (network blip, server restart) during a
 * notify / visibility refresh must not flash the count away from a value that
 * was correct. The initial state is 0, so a first-mount failure keeps the
 * count hidden until the first successful fetch.
 */
export function useIngestionQueueCount(): number {
  const getCount = useServerFn(getIngestionQueueCountFn);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Monotonic generation counter: rapid notifies (batch upload, queue-row
    // actions) can make an earlier response arrive after a later one — only
    // the latest in-flight request may write, or a stale count would stick
    // until the next notify / visibility restore.
    let seq = 0;
    const refresh = () => {
      seq += 1;
      const mySeq = seq;
      void (async () => {
        try {
          const { count: next } = await getCount();
          if (!cancelled && mySeq === seq) setCount(next);
        } catch {
          // Hold the previous count: a transient failure must not flash away
          // an already-correct count (initial state 0 keeps first-mount hidden).
        }
      })();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const unsubscribe = subscribeIngestionQueueChanged(refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [getCount]);

  return count;
}

/**
 * Derives the upload nav item's accessible name from the queue count. Kept
 * next to the hook so the visible count and the SR label stay in lockstep.
 */
export function uploadQueueLabel(count: number): string {
  return count > 0 ? `アップロード（未処理 ${count} 件）` : "アップロード";
}
