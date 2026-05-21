import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import { content } from "@/config";
import { ConsoleEmailSender } from "@/core/adapters/cloudflare/identity/emailSender";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import { StubObjectStorage } from "@/core/adapters/cloudflare/r2ObjectStorage";
import { StubTempFileStorage } from "@/core/adapters/cloudflare/r2TempFileStorage";
import { ServiceBindingRelayTrigger } from "@/core/adapters/cloudflare/serviceBindingRelayTrigger";
import { getDatabase } from "@/core/adapters/d1/client";
import { D1PromptResolver } from "@/core/adapters/d1/promptResolver";
import { D1IdempotencyStore } from "@/core/adapters/d1/repositories/idempotencyStore";
import { D1IndexJobRepository } from "@/core/adapters/d1/repositories/indexJobRepository";
import { D1OutboxRepository } from "@/core/adapters/d1/repositories/outboxRepository";
import { D1SessionService } from "@/core/adapters/d1/repositories/sessionService";
import { D1SearchIndex } from "@/core/adapters/d1/searchIndex";
import { D1UnitOfWorkProvider } from "@/core/adapters/d1/unitOfWork";
import { InMemoryZipArchiveBuilder } from "@/core/adapters/export/archiveBuilder";
import { TemplateHtmlRenderer } from "@/core/adapters/export/htmlRenderer";
import { HtmlToMarkdownRenderer } from "@/core/adapters/export/markdownRenderer";
import { StubPdfRenderer } from "@/core/adapters/export/pdfRenderer";
import { HttpLLMConnectionTester } from "@/core/adapters/llm/llmConnectionTester";
import { StubLLMProvider } from "@/core/adapters/llm/llmProvider";
import { StubOCRProvider } from "@/core/adapters/llm/ocrProvider";
import { StubOfficeExtractor } from "@/core/adapters/llm/officeExtractor";
import { StubPDFExtractor } from "@/core/adapters/llm/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/llm/speechRecognitionProvider";
import { MarkdownItConverter } from "@/core/adapters/markdown/markdownConverter";
import { SanitizeHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { Argon2idPasswordHasher } from "@/core/adapters/security/passwordHasher";
import {
  NullSecretBox,
  WebCryptoSecretBox,
} from "@/core/adapters/security/secretBox";
import type { ExportLimits } from "@/core/domain/export/valueObject";
import { SystemClock } from "../ports/clock";
import { UuidV7Generator } from "../ports/idGenerator";
import { ConsoleLogger } from "../ports/logger";
import { NoopRelayTrigger, type RelayTrigger } from "../ports/relayTrigger";
import { NullUsageMetricsProvider } from "../ports/usageMetricsProvider";
import type { TuningEnv } from "./env";
import {
  type PruneTuning,
  type RelayTuning,
  readPruneTuning as readPruneTuningShared,
  readRelayTuning as readRelayTuningShared,
} from "./env";
import type {
  AppConfig,
  ConsumerContainer,
  RequestContainer,
  SharedDeps,
  WorkerContainer,
} from "./types";

export {
  type ContainerStore,
  installContainerStore,
} from "./containerStore";
export type {
  AppConfig,
  ConsumerContainer,
  RequestContainer,
  SharedDeps,
  WorkerContainer,
} from "./types";

/**
 * Request-path config: extends `AppConfig` (SSR head/meta) with the
 * runtime bindings the request container needs to construct its UoW.
 */
export type RequestServerConfig = AppConfig &
  Readonly<{
    binding: D1Database;
    // Service Binding to the relay Worker — present on the request
    // path. Workers (relay / consumer / pruner / dlq) build their own
    // container without this binding and never kick the relay.
    relay?: Fetcher;
    // `ExecutionContext.waitUntil` bridge so the kicker can outlive
    // the originating request. Required when `relay` is set; ignored
    // otherwise.
    waitUntil?: (promise: Promise<unknown>) => void;
    // Optional `ADMIN_SETUP_TOKEN` secret — when unset, `AdminSignUp`
    // returns `AuthenticationError('setup_token_disabled')`. See
    // `EnvSetupTokenVerifier` and ADR 007.
    adminSetupToken?: string;
    // Optional `SECRET_BOX_MASTER_KEY` secret — base64-encoded 32-byte
    // AES-256 key consumed by `WebCryptoSecretBox`. When unset the DI
    // layer wires `NullSecretBox` so the admin UI still renders;
    // operations that actually need encryption (saving a DB-sourced
    // LLM api key) surface `SecretBoxError(KeyUnavailable)` on call.
    secretBoxMasterKey?: string;
    // Optional `ADMIN_LLM_API_KEY` env override. When set, admin
    // settings resolution prefers this over any DB-stored ciphertext
    // (`AdminSettingsService.assertEnvOverride`); `null` here means
    // "no env override".
    adminLlmApiKey?: string;
  }>;

/**
 * Cloudflare bindings shape. The `OUTBOX_*` vars come from wrangler
 * `[vars]` (see {@link TuningEnv}); the D1/Fetcher bindings are CF-only.
 */
export type ServerEnv = Readonly<{
  DB: D1Database;
  APP_URL: string;
  RELAY?: Fetcher;
  // Optional admin-bootstrap secret (see ADR 007 / `EnvSetupTokenVerifier`).
  // When absent, `AdminSignUp` is disabled at the usecase boundary.
  ADMIN_SETUP_TOKEN?: string;
  // Optional base64-encoded 32-byte master key for `WebCryptoSecretBox`.
  // Absent → DI falls back to `NullSecretBox` (operation-time fail).
  SECRET_BOX_MASTER_KEY?: string;
  // Optional admin-side LLM api key override. Absent → no env override.
  ADMIN_LLM_API_KEY?: string;
  // Worker tuning knobs. Wrangler `[vars]` deliver strings — parse +
  // default via `readRelayTuning` / `readPruneTuning` at the worker
  // entry boundary. Missing values fall back to the application-layer
  // defaults exported from the worker modules.
  OUTBOX_BATCH_SIZE?: string;
  OUTBOX_LEASE_MS?: string;
  OUTBOX_MAX_ATTEMPTS?: string;
  OUTBOX_RETENTION_MS?: string;
}>;

export type { PruneTuning, RelayTuning } from "./env";

// Re-export the shared readers under the original names so wrangler
// worker entries that import from this module keep working unchanged.
// `ServerEnv` is structurally compatible with `TuningEnv`, so passing
// it directly satisfies the shared reader's input contract.
export function readRelayTuning(env: ServerEnv): RelayTuning {
  return readRelayTuningShared(env as TuningEnv);
}

export function readPruneTuning(env: ServerEnv): PruneTuning {
  return readPruneTuningShared(env as TuningEnv);
}

export function readRequestServerConfig(
  env: ServerEnv,
  // Only the request path supplies a context — workers omit this.
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): RequestServerConfig {
  // `exactOptionalPropertyTypes` forbids `relay: undefined`, so build
  // the optional pair conditionally instead of always spreading them.
  return {
    ...content,
    appUrl: env.APP_URL,
    binding: env.DB,
    ...(env.RELAY ? { relay: env.RELAY } : {}),
    ...(env.ADMIN_SETUP_TOKEN
      ? { adminSetupToken: env.ADMIN_SETUP_TOKEN }
      : {}),
    ...(env.SECRET_BOX_MASTER_KEY
      ? { secretBoxMasterKey: env.SECRET_BOX_MASTER_KEY }
      : {}),
    ...(env.ADMIN_LLM_API_KEY ? { adminLlmApiKey: env.ADMIN_LLM_API_KEY } : {}),
    ...(ctx
      ? {
          waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
        }
      : {}),
  };
}

function buildSharedDeps(): SharedDeps {
  return {
    clock: SystemClock,
    idGenerator: UuidV7Generator,
    logger: ConsoleLogger,
  };
}

/**
 * Build the request-scoped container. Wires the unit-of-work
 * provider with a relay trigger (Service Binding when available,
 * no-op otherwise), and exposes `config` for SSR head/meta.
 */
export function createRequestContainer(
  config: RequestServerConfig,
): RequestContainer {
  const db = getDatabase(config.binding);
  const {
    binding: _binding,
    relay,
    waitUntil,
    adminSetupToken,
    secretBoxMasterKey,
    adminLlmApiKey,
    ...appConfig
  } = config;
  const relayTrigger: RelayTrigger =
    relay && waitUntil
      ? new ServiceBindingRelayTrigger(relay, waitUntil, ConsoleLogger)
      : NoopRelayTrigger;
  return {
    ...buildSharedDeps(),
    config: appConfig satisfies AppConfig,
    unitOfWorkProvider: new D1UnitOfWorkProvider(
      db,
      SystemClock,
      UuidV7Generator,
      relayTrigger,
    ),
    htmlSanitizer: new SanitizeHtmlSanitizer(),
    markdownConverter: new MarkdownItConverter(),
    passwordHasher: new Argon2idPasswordHasher(),
    objectStorage: new StubObjectStorage(),
    searchIndex: new D1SearchIndex(db, UuidV7Generator),
    sessionService: new D1SessionService(db, SystemClock, UuidV7Generator),
    emailSender: new ConsoleEmailSender(ConsoleLogger),
    setupTokenVerifier: new EnvSetupTokenVerifier(
      adminSetupToken === undefined
        ? undefined
        : { ADMIN_SETUP_TOKEN: adminSetupToken },
    ),
    htmlRenderer: new TemplateHtmlRenderer(),
    markdownRenderer: new HtmlToMarkdownRenderer(),
    pdfRenderer: new StubPdfRenderer(),
    archiveBuilder: new InMemoryZipArchiveBuilder(),
    exportDesignTokens: DEFAULT_EXPORT_DESIGN_TOKENS,
    exportLimits: DEFAULT_EXPORT_LIMITS,
    llmProvider: new StubLLMProvider(),
    ocrProvider: new StubOCRProvider(),
    speechRecognitionProvider: new StubSpeechRecognitionProvider(),
    officeExtractor: new StubOfficeExtractor(),
    pdfExtractor: new StubPDFExtractor(),
    tempFileStorage: new StubTempFileStorage(),
    promptResolver: new D1PromptResolver(db),
    secretBox: secretBoxMasterKey
      ? new WebCryptoSecretBox(secretBoxMasterKey)
      : new NullSecretBox(),
    llmConnectionTester: new HttpLLMConnectionTester(),
    usageMetricsProvider: NullUsageMetricsProvider,
    adminSettingsEnv: { apiKey: adminLlmApiKey ?? null },
  } satisfies RequestContainer;
}

/**
 * Default export pipeline configuration. Tokens stay empty by default;
 * deployments override via a custom container builder. Quota limits cap
 * concurrent and per-day bulk exports per user — `ExportService.enforceQuota`
 * treats both as upper bounds against the supplied usage counter.
 */
const DEFAULT_EXPORT_DESIGN_TOKENS: Readonly<Record<string, string>> =
  Object.freeze({});

const DEFAULT_EXPORT_LIMITS: ExportLimits = Object.freeze({
  maxConcurrentJobs: 3,
  maxJobsPerDay: 50,
});

/**
 * Build the queue-consumer container. The consumer dispatches domain
 * events back into request-shaped usecases (`runIngestionJob` /
 * `runExportJob`), so it needs the full `RequestContainer` surface
 * (UoW + all aggregate-touching ports) *plus* the worker-only ports
 * (`outboxRepository` / `idempotencyStore` / `indexJobRepository`)
 * used by handler glue.
 *
 * `searchIndex` exists on both halves, so we explicitly pick the
 * worker-only ports rather than spreading `createWorkerContainer(env)`
 * wholesale — otherwise the spread would shadow the request-side
 * `searchIndex` (identical implementation, but the shadowing is a
 * code-smell that obscures the type contract).
 *
 * Implementation notes:
 * - The `RequestContainer.config` field is SSR-only and **never read**
 *   in the consumer path. It's filled from `readRequestServerConfig`
 *   to satisfy the type, accepting the dead weight rather than splitting
 *   `RequestContainer` into "aggregate-mutation" + "SSR config" halves
 *   (out of scope for Issue #57).
 * - `RELAY` is not bound on `[env.consumer]` in `wrangler.toml`, so the
 *   internal `relayTrigger` falls back to `NoopRelayTrigger`. Secondary
 *   events emitted by `runIngestionJob` / `runExportJob` (e.g.
 *   `ingestion.previewAttached`) wait for the relay cron tick rather
 *   than being published immediately. This is acceptable for the
 *   reference runtime; adding `RELAY` to `[env.consumer]` is a separate
 *   operational decision.
 * - The two sub-builders (`createRequestContainer` /
 *   `createWorkerContainer`) each call `getDatabase(env.DB)` internally,
 *   yielding two `drizzle()` handles over the **same** D1 binding.
 *   Drizzle holds no per-handle connection state and D1 has no
 *   connection pool, so the request- and worker-side ports see the
 *   same store. Keeping the sub-builders self-contained beats
 *   threading a shared handle through their signatures for a cost we
 *   can't measure.
 */
export function createConsumerContainer(env: ServerEnv): ConsumerContainer {
  const requestContainer = createRequestContainer(readRequestServerConfig(env));
  const workerContainer = createWorkerContainer(env);
  return {
    ...requestContainer,
    outboxRepository: workerContainer.outboxRepository,
    idempotencyStore: workerContainer.idempotencyStore,
    indexJobRepository: workerContainer.indexJobRepository,
  } satisfies ConsumerContainer;
}

/**
 * Build the worker-scoped container. Workers don't render HTML
 * (no `config`) and don't mutate aggregates (no `unitOfWorkProvider`)
 * — they read/write the outbox directly and stamp idempotency keys.
 */
export function createWorkerContainer(env: ServerEnv): WorkerContainer {
  const db = getDatabase(env.DB);
  return {
    ...buildSharedDeps(),
    outboxRepository: new D1OutboxRepository(db, UuidV7Generator, SystemClock),
    idempotencyStore: new D1IdempotencyStore(db, SystemClock),
    searchIndex: new D1SearchIndex(db, UuidV7Generator),
    indexJobRepository: new D1IndexJobRepository(
      db,
      UuidV7Generator,
      SystemClock,
    ),
  };
}
