import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { AppShellFrame } from "@/components/layout/AppShellFrame";
import type { UserDTO } from "@/core/application/dto/identity";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

// Pull server-fn provider modules into the server graph so the RSC
// manifest registers them before the client build phase. Auth-related
// actions are registered in `__root.tsx` and intentionally not duplicated
// here; this layout only registers actions reachable from authenticated
// pages mounted under `_app`.
import "@/components/note/actions";
import "@/components/directory/actions";
import "@/components/tag/actions";
import "@/components/view/actions";
import "@/components/media/actions";
import "@/components/publication/PublishSettings/action";
import "@/components/ingestion/actions";

// `/` is the only authenticated route that also serves a landing page to
// unauthenticated visitors. Normalising the pathname keeps that exception
// robust against trailing slashes / case differences.
function normalizeAuthGuardPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return (trimmed === "" ? "/" : trimmed).toLowerCase();
}

// `beforeLoad` runs on the server during SSR and on the client during SPA
// navigation. `@/lib/server/currentUser` is `server-only` and resolves to a
// stub on the client, so the auth check must be wrapped in a server fn that
// runs as an RPC from both contexts.
const resolveAppAuth = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ pathname: z.string() })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    return {
      isAuthenticated: user !== null,
      normalized: normalizeAuthGuardPathname(data.pathname),
    };
  });

const loadAppShellChrome = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
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
      renderServerComponent(<Header user={userDto} />),
      renderServerComponent(<Sidebar user={userDto} />),
    ]);
    return { userDto: userDto as UserDTO | null, header, sidebar };
  });

export const Route = createFileRoute("/_app")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  beforeLoad: async ({ location }) => {
    const { isAuthenticated, normalized } = await resolveAppAuth({
      data: { pathname: location.pathname },
    });
    // `/` is allowed for unauthenticated visitors so the landing page can
    // render through the same `_app` tree without remounting AppShell.
    if (normalized !== "/" && !isAuthenticated) {
      throw redirect({ to: "/", search: HOME_SEARCH });
    }
  },
  loader: () => loadAppShellChrome(),
  component: AppLayout,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function AppLayout() {
  const { userDto, header, sidebar } = Route.useLoaderData();
  if (userDto === null) {
    return <Outlet />;
  }
  return (
    <AppShellFrame header={header} sidebar={sidebar}>
      <Outlet />
    </AppShellFrame>
  );
}
