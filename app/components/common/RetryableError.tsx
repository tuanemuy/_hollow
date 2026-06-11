"use client";

import { RefreshCw } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnSm } from "@/components/common/styles";
import { FORM_ERROR } from "@/components/layout/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";

/**
 * Inline mutation-failure notice with a consistent retry affordance.
 *
 * Renders `displayError(error)` inside a `role="alert"` region (matching the
 * existing inline `FORM_ERROR` language) and, when retrying makes sense, a
 * 「再試行」pill button that re-runs the caller-supplied `onRetry`.
 *
 * Button visibility is gated on **both** conditions:
 *   - `onRetry` is provided (the caller owns *what* to re-run), and
 *   - `error.retryable !== false` — `fatal` errors (unauthorized / forbidden
 *     etc. carry `retryable: false`) never show a retry button even if a
 *     handler is passed. Centralising this guard here keeps every call site
 *     consistent without each one re-deriving the fatal check.
 *
 * While `isRetrying` is true the button is `disabled` + `aria-busy` so a
 * second click cannot stack another in-flight attempt.
 */
export function RetryableError({
  error,
  onRetry,
  isRetrying = false,
  retryLabel = "再試行",
  className,
}: Readonly<{
  error: SerializedError;
  onRetry?: (() => void) | undefined;
  isRetrying?: boolean;
  retryLabel?: string;
  className?: string | undefined;
}>) {
  const showRetry = onRetry !== undefined && error.retryable !== false;
  return (
    <div className={className} role="alert">
      <p className={FORM_ERROR}>{displayError(error)}</p>
      {showRetry ? (
        <button
          type="button"
          className={`${pillBtn} ${pillBtnSm} mt-2`}
          data-sm=""
          onClick={onRetry}
          disabled={isRetrying}
          aria-busy={isRetrying}
        >
          <Icon icon={RefreshCw} />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
