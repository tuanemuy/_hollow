// `node:async_hooks` lives only here (not in `di/serverCloudflare.ts`) so
// the import does not leak into the client bundle through server-fn
// dynamic imports traced by vite.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { default as defaultEntry } from "@tanstack/react-start/server-entry";
import { installContainerStore } from "@/core/application/di/containerStore";
import {
  createRequestContainer,
  type RequestServerConfig,
  readRequestServerConfig,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import type { RequestContainer } from "@/core/application/di/types";
import type { RelayTrigger } from "@/core/application/ports/relayTrigger";
import { buildSitemapResponse } from "@/core/presentation/sitemapHandler";

// SSR and RSC are separate module graphs in the same isolate; pin the
// ALS on `globalThis` (and on `import.meta.hot.data` for HMR) so both
// resolve the same store.
const ALS_SYMBOL: unique symbol = Symbol.for("@hollow/request-als") as never;
type AlsHotData = { als?: AsyncLocalStorage<RequestContainer> };
type AlsGlobalSlot = { [ALS_SYMBOL]?: AsyncLocalStorage<RequestContainer> };
const alsHotData: AlsHotData = (import.meta.hot?.data ?? {}) as AlsHotData;
const alsGlobal = globalThis as unknown as AlsGlobalSlot;
const storage =
  alsGlobal[ALS_SYMBOL] ??
  alsHotData.als ??
  new AsyncLocalStorage<RequestContainer>();
alsGlobal[ALS_SYMBOL] = storage;
if (import.meta.hot) {
  (import.meta.hot.data as AlsHotData).als = storage;
}
installContainerStore({ getStore: () => storage.getStore() });

export type AppEnv = ServerEnv;

/**
 * Dev-only injection points for {@link createFetchHandler}. The prod
 * default export passes none of these, so its module graph never reaches
 * the dev-only adapters; the dev entry (`server.cloudflare.dev.ts`) is
 * the sole caller that supplies them.
 */
export type FetchHandlerHooks = {
  // Called inside per-request config construction. Returning a
  // `RelayTrigger` sets `relayTriggerOverride`; `undefined` keeps the
  // default Service Binding wiring. The dev entry returns an
  // `InlineRelayTrigger` when `resolveInlineRelayGate` is satisfied.
  relayTrigger?: (params: {
    env: AppEnv;
    ctx: ExecutionContext;
  }) => RelayTrigger | undefined;

  // Called inside `storage.run`, before the sitemap branch. Returning a
  // `Response` terminates early; `undefined` falls through. The dev
  // entry wires the R2 proxy (`buildDevObjectStorageResponse`) here.
  preRoute?: (params: {
    request: Request;
    env: AppEnv;
    url: URL;
    baseConfig: RequestServerConfig;
  }) => Promise<Response | undefined> | Response | undefined;
};

export function createFetchHandler(hooks?: FetchHandlerHooks): {
  fetch(
    request: Request,
    env: AppEnv,
    ctx: ExecutionContext,
  ): Promise<Response>;
} {
  return {
    async fetch(
      request: Request,
      env: AppEnv,
      ctx: ExecutionContext,
    ): Promise<Response> {
      const baseConfig = readRequestServerConfig(env, ctx);
      const override = hooks?.relayTrigger?.({ env, ctx });
      const config: RequestServerConfig = override
        ? { ...baseConfig, relayTriggerOverride: override }
        : baseConfig;
      const container = createRequestContainer(config);
      return storage.run(container, async () => {
        const url = new URL(request.url);
        const early = await hooks?.preRoute?.({
          request,
          env,
          url,
          baseConfig,
        });
        if (early) {
          return early;
        }
        // `/sitemap.xml` is intercepted here because the TanStack Start
        // server-fn pipeline serialises responses through the RSC RPC
        // layer and cannot emit a raw XML body. See ADR-010 in
        // `.issue/205/adr.md` for the rationale.
        if (
          (request.method === "GET" || request.method === "HEAD") &&
          url.pathname === "/sitemap.xml"
        ) {
          return buildSitemapResponse(container);
        }
        return defaultEntry.fetch(request);
      });
    },
  };
}

export default createFetchHandler();
