"use client";

/**
 * Client-side error boundary for a single `<Suspense>` section.
 *
 * Errors thrown inside a streamed RSC section arrive through the flight
 * stream (not the server-fn `errorResponseMiddleware`) and are redacted by
 * React in production, so the fallback shows a generic message with the
 * section name plus a retry button instead of branching on error kind
 * (`.issue/636/adr.md` ADR-003). Retry re-runs the loaders via
 * `routerInvalidate` (page sections) or `appShellInvalidate` (sections fed
 * by the `_app` shell loader, e.g. Sidebar) and then resets the boundary.
 */

import { useRouter } from "@tanstack/react-router";
import { Component, type ReactNode, useTransition } from "react";
import { appShellInvalidate, routerInvalidate } from "./routerInvalidate";
import { Spinner } from "./Spinner";
import { pillBtn } from "./styles";

type Scope = "page" | "shell";

type Props = Readonly<{
  /** Human-readable section name shown in the fallback message. */
  section: string;
  /**
   * Which loader to invalidate on retry: `"page"` (default) excludes the
   * `_app` shell, `"shell"` targets only the `_app` shell loader.
   */
  scope?: Scope;
  children: ReactNode;
}>;

type BoundaryProps = Readonly<{
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}>;

type BoundaryState = Readonly<{ hasError: boolean }>;

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) return this.props.fallback(this.reset);
    return this.props.children;
  }
}

function SectionErrorFallback({
  section,
  scope,
  onReset,
}: Readonly<{ section: string; scope: Scope; onReset: () => void }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const retry = () => {
    startTransition(async () => {
      try {
        await (scope === "shell"
          ? appShellInvalidate(router)
          : routerInvalidate(router));
      } catch {
        // Invalidation failed — keep the fallback; the user can retry again.
      }
      onReset();
    });
  };

  return (
    <div
      role="alert"
      className="my-2 rounded-lg border border-hairline bg-surface px-4 py-4"
    >
      <p className="mb-3 text-sm text-ink-secondary">
        {section}を読み込めませんでした。
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={isPending}
        className={pillBtn}
      >
        {isPending ? <Spinner /> : null}
        再読み込み
      </button>
    </div>
  );
}

export function SectionErrorBoundary({
  section,
  scope = "page",
  children,
}: Props) {
  return (
    <Boundary
      fallback={(reset) => (
        <SectionErrorFallback section={section} scope={scope} onReset={reset} />
      )}
    >
      {children}
    </Boundary>
  );
}
