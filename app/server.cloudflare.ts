// `node:async_hooks` lives only here (not in `di/serverCloudflare.ts`) so
// the import does not leak into the client bundle through server-fn
// dynamic imports traced by vite.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { default as defaultEntry } from "@tanstack/react-start/server-entry";
import {
  buildDevObjectStorageResponse,
  resolveDevObjectStorageGate,
} from "@/core/adapters/cloudflare/devObjectStorageHandler";
import {
  InlineRelayTrigger,
  resolveInlineRelayGate,
} from "@/core/adapters/cloudflare/inlineRelayTrigger";
import { installContainerStore } from "@/core/application/di/containerStore";
import {
  createRequestContainer,
  type RequestServerConfig,
  readRequestServerConfig,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import type { RequestContainer } from "@/core/application/di/types";
import { ConsoleLogger } from "@/core/application/ports/logger";
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

export default {
  async fetch(
    request: Request,
    env: AppEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // `import.meta.env.MODE` is inlined to `"production"` by `vite build`,
    // turning the `&&` left-hand side into a constant `false` — so the
    // entire `InlineRelayTrigger` branch, including the import above and
    // the `resolveInlineRelayGate` call, is dead-code-eliminated from
    // staging / production bundles (Issue #66 / ADR-003, Issue #663).
    // The constant condition must stay on the left of the short-circuit
    // `&&` (outside the function call): Rollup does not fold constants
    // across call boundaries. Under `pnpm start` (`wrangler dev` without
    // Vite) `import.meta.env` is `undefined`, so guard with optional
    // chaining; the runtime gate then relies on the local-only
    // `DEV_INLINE_RELAY` var.
    // `import.meta` must be referenced inline (not via an intermediate
    // variable) or Vite's define replacement does not apply.
    const baseConfig = readRequestServerConfig(env, ctx);
    const inlineRelay =
      (import.meta as { env?: { MODE?: string } }).env?.MODE !== "production" &&
      resolveInlineRelayGate({
        viteDev: (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true,
        flag: env.DEV_INLINE_RELAY,
      });
    const config: RequestServerConfig = inlineRelay
      ? {
          ...baseConfig,
          relayTriggerOverride: new InlineRelayTrigger(
            env,
            (promise) => ctx.waitUntil(promise),
            ConsoleLogger,
          ),
        }
      : baseConfig;
    const container = createRequestContainer(config);
    return storage.run(container, async () => {
      // `/sitemap.xml` is intercepted here because the TanStack Start
      // server-fn pipeline serialises responses through the RSC RPC
      // layer and cannot emit a raw XML body. See ADR-010 in
      // `.issue/205/adr.md` for the rationale.
      const url = new URL(request.url);
      // LOCAL DEV ONLY: same-origin terminator for presigned
      // R2 URLs. `R2_DEV_OBJECT_PROXY` is set solely in the local
      // `wrangler.toml [vars]`, so staging / production never enter this
      // branch. Missing binding / presign config → 404 rather than crash.
      const { objectStorageBucket, r2PresignConfig } = baseConfig;
      const devProxyGate = resolveDevObjectStorageGate({
        flag: env.R2_DEV_OBJECT_PROXY,
        pathname: url.pathname,
        hasBucket: objectStorageBucket !== undefined,
        hasPresignConfig: r2PresignConfig !== undefined,
      });
      if (devProxyGate === "not_found") {
        return new Response("Not Found", { status: 404 });
      }
      if (devProxyGate === "handle" && objectStorageBucket && r2PresignConfig) {
        return buildDevObjectStorageResponse({
          request,
          bucket: objectStorageBucket,
          bucketName: r2PresignConfig.bucketName,
          presignConfig: r2PresignConfig,
        });
      }
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
