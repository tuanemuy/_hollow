import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Integration tests run inside a Workers isolate (Miniflare) with a
// real `env.DB` D1 binding backed by an in-memory SQLite database.
// Anything matching `*.integration.test.ts` is included; pure unit
// tests run via `vitest.config.ts` instead.
const migrationsPath = path.join(
  import.meta.dirname,
  "app/core/adapters/d1/migrations",
);

const migrations = await readD1Migrations(migrationsPath);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-05-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        // R2 simulator (in-memory). DI wires `R2TempFileStorage` /
        // `R2ObjectStorage` against these bindings; tests can seed via
        // `env.TEMP_FILES.put(...)` / `env.OBJECT_STORAGE.put(...)`.
        r2Buckets: ["TEMP_FILES", "OBJECT_STORAGE"],
        queueProducers: {
          EVENTS_QUEUE: "tanstack-start-template-events",
          // Registered so `createMessageBatch("…-events-dlq", …)` is
          // recognised by the test harness when exercising the DLQ
          // consumer; the production DLQ Worker does not bind it as a
          // producer.
          EVENTS_DLQ: "tanstack-start-template-events-dlq",
        },
        // Mirror wrangler.toml so the DLQ routing wiring is the same
        // shape miniflare sees in production. Tests that go through
        // `createMessageBatch(...)` bypass dispatch and don't depend on
        // these values, but registering them keeps the per-batch
        // disposition (`retryBatch.retry`) consistent with how real
        // queues would surface the same handler decision, and prevents
        // silent drift when wrangler.toml is tuned.
        queueConsumers: {
          "tanstack-start-template-events": {
            maxBatchSize: 25,
            maxBatchTimeout: 30,
            maxRetries: 3,
            deadLetterQueue: "tanstack-start-template-events-dlq",
          },
          "tanstack-start-template-events-dlq": {
            maxBatchSize: 25,
            maxBatchTimeout: 30,
            maxRetries: 1,
          },
        },
        bindings: {
          MIGRATIONS: migrations,
          APP_URL: "http://localhost:8787",
          // SigV4 presign credentials for `R2ObjectStorage`. With these
          // set alongside the `OBJECT_STORAGE` r2 binding, DI wires the
          // real adapter — useful for any test that exercises presign
          // URL minting. Data-plane R2 ops do not consult them.
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
          R2_OBJECT_BUCKET_NAME: "test-objects",
          // `ADMIN_LLM_API_KEY` / `ADMIN_LLM_MODEL` are intentionally
          // unset so DI keeps `StubLLMProvider`; the env→adapter
          // mapping for the real Anthropic adapter is covered by the
          // serverCloudflare unit tests, and not wiring it here keeps
          // integration tests from accidentally calling the real API.
        },
      },
    }),
  ],
  test: {
    include: ["app/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.direnv/**"],
    setupFiles: ["app/core/adapters/d1/__tests__/setup.ts"],
  },
});
