"use client";

import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
  // Forwarded to the anchor so the icon-only (mobile) variant keeps an
  // accessible name when the visible label is hidden.
  "aria-label"?: string;
};

const UPLOAD_HASH = "upload";

export function UploadButton({
  className,
  children,
  "aria-label": ariaLabel,
}: Props) {
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
      className={className}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
