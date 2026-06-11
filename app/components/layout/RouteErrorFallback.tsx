"use client";

import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

/**
 * Shared `errorComponent` for `_app` *leaf* routes.
 *
 * Replaces the formerly-bare per-route fallbacks
 * (`<div role="alert"><h1>…</h1><pre>…</pre></div>` with no retry) with one
 * consistent panel that carries a 「再読み込み」retry affordance, so route-level
 * failures look and behave the same across the authenticated app (DoD#4).
 *
 * Retry uses `routerInvalidate(router)`, which **excludes** the `_app` shell
 * route — re-evaluating the failed leaf without bouncing the AppShell loader
 * (`staleTime: Infinity`). The shell's own boundary
 * (`_app/route.tsx` `AppErrorFallback`) is a *separate* component that uses
 * `appShellInvalidate`; the two are intentionally distinct (see
 * `.issue/637/adr.md` ADR-002).
 */
export function RouteErrorFallback({ error }: Readonly<{ error: unknown }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleRetry = () => {
    startTransition(async () => {
      await routerInvalidate(router);
    });
  };
  return (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap mb-4">
        {sanitizeRouteError(error)}
      </pre>
      <button
        type="button"
        onClick={handleRetry}
        disabled={isPending}
        aria-busy={isPending}
        data-primary=""
        className={`${pillBtn} ${pillBtnPrimary}`}
      >
        再読み込み
      </button>
    </div>
  );
}
