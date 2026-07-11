import {
  buildDevObjectStorageResponse,
  resolveDevObjectStorageGate,
} from "@/core/adapters/cloudflare/devObjectStorageHandler";
import {
  InlineRelayTrigger,
  resolveInlineRelayGate,
} from "@/core/adapters/cloudflare/inlineRelayTrigger";
import { ConsoleLogger } from "@/core/application/ports/logger";
import { createFetchHandler } from "./server.cloudflare";

// Dev-only entry: the sole import site for the dev-only relay / R2 proxy
// adapters. Selected by `vite.config.cloudflare.ts` in every non-production
// mode (`pnpm dev`, `pnpm build:local`); the prod entry never imports this
// file, so these adapters cannot reach a production bundle.
export default createFetchHandler({
  relayTrigger: ({ env, ctx }) => {
    // Verbatim from the former in-entry gate: keep BOTH conditions. Under
    // `pnpm build:local && pnpm start` (`NODE_ENV=production` + `--mode
    // development`) `import.meta.env.DEV` is `false`, so `DEV_INLINE_RELAY`
    // alone drives the inline relay — collapsing this to `viteDev` would
    // silently disable it there and regress Issue #663.
    const enabled = resolveInlineRelayGate({
      viteDev: (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true,
      flag: env.DEV_INLINE_RELAY,
    });
    return enabled
      ? new InlineRelayTrigger(
          env,
          (promise) => ctx.waitUntil(promise),
          ConsoleLogger,
        )
      : undefined;
  },
  preRoute: ({ request, env, url, baseConfig }) => {
    const { objectStorageBucket, r2PresignConfig } = baseConfig;
    const gate = resolveDevObjectStorageGate({
      flag: env.R2_DEV_OBJECT_PROXY,
      pathname: url.pathname,
      hasBucket: objectStorageBucket !== undefined,
      hasPresignConfig: r2PresignConfig !== undefined,
    });
    if (gate === "not_found") {
      return new Response("Not Found", { status: 404 });
    }
    if (gate === "handle" && objectStorageBucket && r2PresignConfig) {
      return buildDevObjectStorageResponse({
        request,
        bucket: objectStorageBucket,
        bucketName: r2PresignConfig.bucketName,
        presignConfig: r2PresignConfig,
      });
    }
    return undefined;
  },
});
