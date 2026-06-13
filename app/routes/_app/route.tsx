import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { useTransition } from "react";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { appShellInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { SettingsSidebarNav } from "@/components/identity/SettingsSidebarNav";
import { AppShellFrame } from "@/components/layout/AppShellFrame";
import type { UserDTO } from "@/core/application/dto/identity";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

// Pull server-fn provider modules into the server graph so the RSC
// manifest registers them before the client build phase. Auth-related
// actions are registered in `__root.tsx` and intentionally not duplicated
// here; this layout only registers actions reachable from authenticated
// pages mounted under `_app`. `ingestion/actions` is registered inside
// `AppShellFrame.tsx` because `UploadDialogMount` lives there.
import "@/components/note/actions";
import "@/components/directory/actions";
import "@/components/tag/actions";
import "@/components/view/actions";
import "@/components/media/actions";
import "@/components/publication/PublishSettings/action";
// `logOutFn` is reached only through the dynamically-imported
// `Sidebar` → `UserMenu` (client) chain below, which the RSC build does
// not traverse statically, so it must be registered here too (#718).
import "@/components/layout/logOutAction";

// `/` is the only authenticated route that also serves a landing page to
// unauthenticated visitors. Normalising the pathname keeps that exception
// robust against trailing slashes / case differences.
function normalizeAuthGuardPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return (trimmed === "" ? "/" : trimmed).toLowerCase();
}

// Combined auth + chrome loader. `beforeLoad` is intentionally a sync
// client-side helper that only computes `isLandingPath`, so the single
// RPC below covers both the auth gate and the AppShell RSC payload.
// With `staleTime: Infinity` this loader does not re-run on leaf
// navigations, so subsequent SPA transitions cost zero RPCs.
//
// `beforeLoad` / `loader` run on both server and client. Server-only
// imports must stay inside this `createServerFn` handler — direct
// `await import("@/lib/server/currentUser")` from `beforeLoad` would
// resolve to a stub on the client.
const loadAppShell = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ isLandingPath: z.boolean() })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
      if (!data.isLandingPath) {
        throw redirect({ to: "/", search: HOME_SEARCH });
      }
      return {
        userDto: null as UserDTO | null,
        header: null,
        sidebar: null,
      };
    }
    const [{ toUserDTO }, { Header }, { Sidebar }] = await Promise.all([
      import("@/core/application/dto/identity"),
      import("@/components/layout/Header"),
      import("@/components/layout/Sidebar"),
    ]);
    const userDto = toUserDTO(user);
    const [header, sidebar] = await Promise.all([
      renderServerComponent(<Header />),
      renderServerComponent(<Sidebar user={userDto} />),
    ]);
    return { userDto: userDto as UserDTO | null, header, sidebar };
  });

export const Route = createFileRoute("/_app")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  beforeLoad: ({ location }) => ({
    isLandingPath: normalizeAuthGuardPathname(location.pathname) === "/",
  }),
  loader: ({ context }) =>
    loadAppShell({ data: { isLandingPath: context.isLandingPath } }),
  component: AppLayout,
  errorComponent: AppErrorFallback,
});

export function AppErrorFallback({ error }: { error: unknown }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const handleRetry = () => {
    startTransition(async () => {
      await appShellInvalidate(router);
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

function AppLayout() {
  const { userDto, header, sidebar } = Route.useLoaderData();
  if (userDto === null) {
    return <Outlet />;
  }
  return (
    <AppShellFrame
      header={header}
      sidebar={sidebar}
      settingsSidebar={<SettingsSidebarNav />}
    >
      <Outlet />
    </AppShellFrame>
  );
}
