"use client";

/**
 * Client-side error boundary for a single `<Suspense>` section.
 *
 * Errors thrown inside a streamed RSC section arrive through the flight
 * stream (not the server-fn `errorResponseMiddleware`) and are redacted by
 * React in production, so the fallback shows a generic message with the
 * section name plus a retry button instead of branching on error kind. Retry re-runs the loaders via
 * `routerInvalidate` (page sections) or `appShellInvalidate` (sections fed
 * by the `_app` shell loader, e.g. Sidebar) and then resets the boundary.
 */

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useRef,
  useTransition,
} from "react";
import { appShellInvalidate, routerInvalidate } from "./routerInvalidate";
import { Spinner } from "./Spinner";
import { reportSectionFailure } from "./sectionFailureReport";
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
  /**
   * When this value changes (e.g. on navigation that produces new search
   * params), the boundary clears a sticky error state so the freshly
   * streamed children render instead of a stale fallback.
   */
  resetKey?: string | number;
  /**
   * Rendered above the alert in the error fallback. Used when the section
   * owns a page-level landmark (e.g. the home toolbar boundary contains the
   * page's only `<h1>`) that must survive an error so the heading structure
   * never disappears (`.issue/649/adr.md` ADR-009).
   */
  fallbackHeading?: ReactNode;
  children: ReactNode;
}>;

type BoundaryProps = Readonly<{
  fallback: (reset: () => void) => ReactNode;
  resetKey?: string | number;
  /**
   * Side-effect-only callback invoked from `componentDidCatch`. Kept
   * observation-agnostic so the class never knows about section / scope /
   * path / reporting; the function component injects the fire-and-forget
   * reporter.
   */
  onCatch?: () => void;
  children: ReactNode;
}>;

type BoundaryState = Readonly<{
  hasError: boolean;
  prevResetKey: string | number | undefined;
}>;

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { hasError: false, prevResetKey: undefined };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { hasError: false, prevResetKey: props.resetKey };
    }
    return null;
  }

  // `error` / `info` are received but deliberately NOT forwarded: in
  // production they are redacted by React, and sending them would leak
  // detail. Reporting is fire-and-forget inside `onCatch` and never blocks
  // render.
  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onCatch?.();
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
        {/* The enclosing role="alert" already announces; keep the spinner visual-only. */}
        {isPending ? <Spinner decorative /> : null}
        再読み込み
      </button>
    </div>
  );
}

export function SectionErrorBoundary({
  section,
  scope = "page",
  resetKey,
  fallbackHeading,
  children,
}: Props) {
  const report = useServerFn(reportSectionFailure);
  // `count` is the boundary instance's cumulative catch count (incremented
  // on every catch, even when the send is deduped) — NOT the number of
  // actual sends.
  const catchCount = useRef(0);
  // The last reported `section` + `resetKey` pair; identical consecutive
  // catches (StrictMode double-mount, retry-then-rethrow) are rolled up to
  // a single send. Independent of the `count` increment above.
  const lastReportedKey = useRef<string | undefined>(undefined);

  const onCatch = useCallback(() => {
    catchCount.current += 1;
    // `JSON.stringify` over the tuple avoids cross-type / delimiter
    // collisions a plain string join would have (e.g. resetKey `12` vs
    // `"12"`, or a `section` containing the separator).
    const dedupeKey = JSON.stringify([section, resetKey ?? null]);
    if (lastReportedKey.current === dedupeKey) return;
    lastReportedKey.current = dedupeKey;
    // `scope` is default-resolved here so undefined never reaches the
    // `z.enum` validator through the injection path. `section` / `path` are
    // clamped to the schema's max length so an over-long input is reported
    // (truncated) rather than silently dropped by the `validateInput` reject
    // in this fire-and-forget path.
    const payload = {
      section: section.slice(0, 100),
      scope,
      path: window.location.pathname.slice(0, 2048),
      count: catchCount.current,
    };
    void report({ data: payload }).catch(() => {});
  }, [section, scope, resetKey, report]);

  return (
    <Boundary
      {...(resetKey !== undefined ? { resetKey } : {})}
      onCatch={onCatch}
      fallback={(reset) => (
        <>
          {fallbackHeading}
          <SectionErrorFallback
            section={section}
            scope={scope}
            onReset={reset}
          />
        </>
      )}
    >
      {children}
    </Boundary>
  );
}
