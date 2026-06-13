"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getIngestionQueueCountFn } from "./actions";
import { subscribeIngestionQueueChanged } from "./queueBadgeBus";

const BADGE_CHIP =
  "absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-pill px-1 text-[11px] font-medium leading-none bg-ink text-bg pointer-events-none";

/**
 * Live count of the actor's unprocessed (pending / processing / previewing)
 * ingestion jobs for the header badge. Re-fetches on mount, on visibility
 * restore, and on `notifyIngestionQueueChanged()` — no standing poll
 * (`.issue/538/adr.md` ADR-002). A fetch failure resolves to 0 — even when a
 * previous fetch succeeded — so the badge silently disappears instead of
 * blocking the CTA or showing a stale count.
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
          if (!cancelled && mySeq === seq) setCount(0);
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
 * Count chip overlaid on the upload CTA. Renders nothing at 0. The chip is
 * `aria-hidden` — the count is carried by the CTA's accessible name (see
 * `uploadButtonLabel`), so SR users are not double-announced.
 */
export function IngestionQueueBadge({ count }: Readonly<{ count: number }>) {
  if (count === 0) return null;
  return (
    <span className={BADGE_CHIP} data-queue-badge="" aria-hidden="true">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Derives the upload CTA's accessible name from the badge count. Kept next
 * to the chip so the visual count and the SR label stay in lockstep.
 */
export function uploadButtonLabel(count: number): string {
  return count > 0 ? `アップロード（未処理 ${count} 件）` : "アップロード";
}
