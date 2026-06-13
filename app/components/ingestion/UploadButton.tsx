"use client";

import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  IngestionQueueBadge,
  uploadButtonLabel,
  useIngestionQueueCount,
} from "./IngestionQueueBadge";

type Props = {
  className?: string;
  children: ReactNode;
};

const UPLOAD_HASH = "upload";

export function UploadButton({ className, children }: Props) {
  // Mirror the navigation `activeProps` pattern used by other sidebar
  // links: when the modal is open (`#upload`), surface that state to
  // both screen readers (`aria-current="page"`) and styling
  // (`data-active`) so the entry stays visually anchored.
  const hash = useLocation({ select: (l) => l.hash });
  const active = hash === UPLOAD_HASH;
  // `aria-label` overrides descendant text, so the unprocessed-job count
  // must live in the label itself (the visible chip is aria-hidden) —
  // otherwise SR users would never hear it. See `IngestionQueueBadge`.
  const queueCount = useIngestionQueueCount();

  return (
    <Link
      to="."
      hash={UPLOAD_HASH}
      className={`${className ?? ""} relative`}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      aria-label={uploadButtonLabel(queueCount)}
    >
      {children}
      <IngestionQueueBadge count={queueCount} />
    </Link>
  );
}
