// `node:async_hooks` lives only here (not in `di/serverCloudflare.ts`) so
// the import does not leak into the client bundle through server-fn
// dynamic imports traced by vite.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { default as defaultEntry } from "@tanstack/react-start/server-entry";
import { InlineRelayTrigger } from "@/core/adapters/cloudflare/inlineRelayTrigger";
import { installContainerStore } from "@/core/application/di/containerStore";
import {
  createRequestContainer,
  type RequestServerConfig,
  readRequestServerConfig,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import type { RequestContainer } from "@/core/application/di/types";
import { ConsoleLogger } from "@/core/application/ports/logger";

// SSR and RSC are separate module graphs in the same isolate; pin the
// ALS on `globalThis` (and on `import.meta.hot.data` for HMR) so both
// resolve the same store.
const ALS_SYMBOL: unique symbol = Symbol.for(
  "@tanstack-start-template/request-als",
) as never;
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
    // `import.meta.env.DEV` is inlined to `false` by `vite build`, so the
    // entire `InlineRelayTrigger` branch — including the import above —
    // is dead-code-eliminated from staging / production bundles
    // (Issue #66 / ADR-003). Under `pnpm start` (`wrangler dev` without
    // Vite) `import.meta.env` itself is `undefined`, so guard with
    // optional chaining to avoid `TypeError: Cannot read properties of
    // undefined` at boot.
    const baseConfig = readRequestServerConfig(env, ctx);
    const isDev =
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
    const config: RequestServerConfig = isDev
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
    return storage.run(container, async () => defaultEntry.fetch(request));
  },
};
