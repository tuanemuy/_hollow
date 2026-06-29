"use client";

import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

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

  return (
    <Link
      to="."
      hash={UPLOAD_HASH}
      className={className ?? ""}
      // Upload is the primary header action — statically-on so the
      // `data-[primary]:` accent-fill variants in `pillBtnPrimary` apply.
      data-primary=""
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      // The unprocessed-job count now lives on the sidebar upload nav item
      // (#790); this CTA is a static "start upload" button.
      aria-label="アップロード"
    >
      {children}
    </Link>
  );
}
