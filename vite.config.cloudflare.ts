import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

// The Worker fetch entry is selected by build mode: `production`
// (`pnpm build`, `deploy:*`) keeps the dev-import-free prod entry from
// `wrangler.toml [main]`; every other mode (`pnpm dev`, `pnpm build:local`)
// swaps in the dev entry that wires the inline relay / R2 proxy. The
// entry that `@cloudflare/vite-plugin` bundles is `wrangler.toml [main]`,
// not tanstackStart's `server.entry`, so the mode switch has to override
// `main` via the plugin's `config` customizer. A misconfigured dev path
// only breaks dev (its `main` fails to resolve) — production always falls
// through to the prod entry, so dev code can never reach a prod bundle.
const DEV_SERVER_ENTRY = "app/server.cloudflare.dev.ts";

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    cloudflare({
      // Declare `rsc` as a child of the workerd-backed `ssr` env so the
      // RSC plugin's module runner is initialised inside the worker.
      viteEnvironment: { name: "ssr", childEnvironments: ["rsc"] },
      // The bundled Worker entry is `wrangler.toml [main]` (the prod entry),
      // not tanstackStart's `server.entry`. Override `main` in non-production
      // modes so `pnpm dev` / `pnpm build:local` bundle the dev entry. The
      // customizer must return only the delta — returning the whole config
      // makes the plugin concatenate every binding array (duplicate bindings).
      config: () =>
        mode === "production" ? undefined : { main: DEV_SERVER_ENTRY },
    }),
    tanstackStart({
      srcDirectory: "app",
      // Path is resolved relative to `srcDirectory`; an `app/` prefix
      // makes the plugin silently fall back to the default CF entry. Kept
      // in sync with the Worker `main` selected above.
      server: {
        entry:
          mode === "production"
            ? "server.cloudflare.ts"
            : "server.cloudflare.dev.ts",
      },
      rsc: { enabled: true },
    }),
    rsc(),
    viteReact(),
  ],
  server: {
    port: 3000,
    host: true,
    watch: {
      ignored: ["**/.direnv/**"],
    },
  },
}));
