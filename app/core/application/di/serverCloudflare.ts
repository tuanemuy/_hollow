import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types";
import { content } from "@/config";
import { ConsoleEmailSender } from "@/core/adapters/cloudflare/identity/emailSender";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import {
  R2ObjectStorage,
  type R2PresignConfig,
  StubObjectStorage,
} from "@/core/adapters/cloudflare/r2ObjectStorage";
import {
  R2TempFileStorage,
  StubTempFileStorage,
} from "@/core/adapters/cloudflare/r2TempFileStorage";
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
import {
  AnthropicLLMProvider,
  StubLLMProvider,
} from "@/core/adapters/llm/llmProvider";
import {
  AnthropicOCRProvider,
  StubOCRProvider,
} from "@/core/adapters/llm/ocrProvider";
import { StubOfficeExtractor } from "@/core/adapters/llm/officeExtractor";
import {
  AnthropicPDFExtractor,
  StubPDFExtractor,
} from "@/core/adapters/llm/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/llm/speechRecognitionProvider";
import { MarkdownItConverter } from "@/core/adapters/markdown/markdownConverter";
import { SanitizeHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { Argon2idPasswordHasher } from "@/core/adapters/security/passwordHasher";
import {
  NullSecretBox,
  WebCryptoSecretBox,
} from "@/core/adapters/security/secretBox";
import type { ExportLimits } from "@/core/domain/export/valueObject";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";
import { SystemClock } from "../ports/clock";
import { UuidV7Generator } from "../ports/idGenerator";
import { ConsoleLogger, type Logger } from "../ports/logger";
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
    // Optional `ADMIN_LLM_MODEL` var. Paired with `adminLlmApiKey`,
    // both truthy → DI wires `AnthropicLLMProvider`; either missing
    // → DI keeps `StubLLMProvider`. Public information (model id), so
    // delivered via `wrangler.toml [vars]` rather than a secret.
    adminLlmModel?: string;
    // R2 binding for ingestion-temp storage. When present DI wires
    // `R2TempFileStorage`; absent → `StubTempFileStorage`. Data-plane
    // only, no credentials needed.
    tempFilesBucket?: R2Bucket;
    // R2 binding for the long-lived objects bucket. Wiring
    // `R2ObjectStorage` requires this AND a complete `r2PresignConfig`
    // (presign URLs are minted against the S3 endpoint, not the
    // binding). Any field missing → DI keeps `StubObjectStorage`.
    objectStorageBucket?: R2Bucket;
    // SigV4 credentials and bucket name used by
    // `R2ObjectStorage.presign*`. Manually issued in the Cloudflare
    // dashboard (ADR-005 of Issue #110) and delivered via SOPS
    // secrets + the public `R2_OBJECT_BUCKET_NAME` var.
    r2PresignConfig?: R2PresignConfig;
    // Optional `RelayTrigger` injected by the entry point to bypass the
    // default Service Binding wiring. Used by `pnpm dev` to route kicks
    // through `InlineRelayTrigger` (Issue #66 / ADR-003); unset on every
    // production / staging code path. When set, `createRequestContainer`
    // uses this instance verbatim and skips `buildRelayTrigger`.
    //
    // Note: `readRequestServerConfig` never populates this field, so
    // worker entry points that read their config from there (consumer /
    // relay / pruner / dlq) always observe it as `undefined`. The field
    // is type-level optional in those paths but effectively dead code.
    relayTriggerOverride?: RelayTrigger;
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
  // Optional model id for `AnthropicLLMProvider`. Wrangler `[vars]`
  // entry — paired with `ADMIN_LLM_API_KEY` (secret), both truthy →
  // DI wires the real adapter; either missing → DI keeps
  // `StubLLMProvider`. Public information so it ships via vars.
  ADMIN_LLM_MODEL?: string;
  // R2 binding for ingestion-temp storage. Optional so the DI fallback
  // (`StubTempFileStorage`) covers worker entries that do not bind it.
  TEMP_FILES?: R2Bucket;
  // R2 binding for the long-lived objects bucket. Wiring
  // `R2ObjectStorage` additionally requires `R2_ACCOUNT_ID` /
  // `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_OBJECT_BUCKET_NAME`
  // — any missing field downgrades DI to `StubObjectStorage`.
  OBJECT_STORAGE?: R2Bucket;
  // R2 presign credentials. SigV4 needs all three; the bucket name is
  // delivered separately as a public var. Sourced from SOPS-encrypted
  // secrets (`infra/secrets/{stage}.enc.json`).
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  // Bucket name used in the SigV4 presign path (`/<bucket>/<key>`).
  // Public information delivered via `wrangler.toml [vars]`.
  R2_OBJECT_BUCKET_NAME?: string;
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
  // `R2ObjectStorage` requires the data-plane binding AND the four
  // SigV4 inputs together. Any one missing → omit `r2PresignConfig`
  // entirely so DI falls back to `StubObjectStorage`; partial-config
  // wiring would surface as a runtime crash on first presign call.
  const r2PresignReady =
    !!env.OBJECT_STORAGE &&
    !!env.R2_ACCOUNT_ID &&
    !!env.R2_ACCESS_KEY_ID &&
    !!env.R2_SECRET_ACCESS_KEY &&
    !!env.R2_OBJECT_BUCKET_NAME;
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
    ...(env.ADMIN_LLM_MODEL ? { adminLlmModel: env.ADMIN_LLM_MODEL } : {}),
    ...(env.TEMP_FILES ? { tempFilesBucket: env.TEMP_FILES } : {}),
    ...(r2PresignReady
      ? {
          objectStorageBucket: env.OBJECT_STORAGE as R2Bucket,
          r2PresignConfig: {
            accountId: env.R2_ACCOUNT_ID as string,
            bucketName: env.R2_OBJECT_BUCKET_NAME as string,
            accessKeyId: env.R2_ACCESS_KEY_ID as string,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
          },
        }
      : {}),
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
 * Build the request-time `RelayTrigger`. Wires
 * `ServiceBindingRelayTrigger` only when both a `relay` Service Binding
 * and a `waitUntil` bridge are available; any missing input degrades to
 * the singleton `NoopRelayTrigger` (the relay safety-net cron then picks
 * the row up on the next tick).
 *
 * Pure helper extracted from `createRequestContainer` so the
 * three-way wiring can be verified directly in unit tests via
 * `instanceof` without smuggling the trigger out of the UoW provider.
 */
export function buildRelayTrigger(
  relay: Fetcher | undefined,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  logger: Logger,
): RelayTrigger {
  return relay && waitUntil
    ? new ServiceBindingRelayTrigger(relay, waitUntil, logger)
    : NoopRelayTrigger;
}

/**
 * Build the request-time {@link OCRProvider}. Wires
 * `AnthropicOCRProvider` only when both `ADMIN_LLM_API_KEY` (secret)
 * and `ADMIN_LLM_MODEL` (var) are present; either missing → fall back
 * to `StubOCRProvider`. Shares the env pair with `llmProvider` /
 * `pdfExtractor` per ADR-003 of Issue #113.
 *
 * Pure helper extracted from `createRequestContainer` so the wiring
 * can be verified directly in unit tests via `instanceof` without
 * threading container internals through the test harness.
 */
export function buildOcrProvider(
  adminLlmApiKey: string | undefined,
  adminLlmModel: string | undefined,
): OCRProvider {
  return adminLlmApiKey && adminLlmModel
    ? new AnthropicOCRProvider({
        apiKey: adminLlmApiKey,
        model: adminLlmModel,
      })
    : new StubOCRProvider();
}

/**
 * Build the request-time {@link PDFExtractor}. Wires
 * `AnthropicPDFExtractor` only when both `ADMIN_LLM_API_KEY` and
 * `ADMIN_LLM_MODEL` are present; either missing → fall back to
 * `StubPDFExtractor`. Shares the env pair with `llmProvider` /
 * `ocrProvider` per ADR-003 of Issue #113.
 */
export function buildPdfExtractor(
  adminLlmApiKey: string | undefined,
  adminLlmModel: string | undefined,
): PDFExtractor {
  return adminLlmApiKey && adminLlmModel
    ? new AnthropicPDFExtractor({
        apiKey: adminLlmApiKey,
        model: adminLlmModel,
      })
    : new StubPDFExtractor();
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
    adminLlmModel,
    tempFilesBucket,
    objectStorageBucket,
    r2PresignConfig,
    relayTriggerOverride,
    ...appConfig
  } = config;
  const relayTrigger =
    relayTriggerOverride ?? buildRelayTrigger(relay, waitUntil, ConsoleLogger);
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
    objectStorage:
      objectStorageBucket && r2PresignConfig
        ? new R2ObjectStorage(objectStorageBucket, r2PresignConfig)
        : new StubObjectStorage(),
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
    llmProvider:
      adminLlmApiKey && adminLlmModel
        ? new AnthropicLLMProvider({
            apiKey: adminLlmApiKey,
            model: adminLlmModel,
          })
        : new StubLLMProvider(),
    ocrProvider: buildOcrProvider(adminLlmApiKey, adminLlmModel),
    speechRecognitionProvider: new StubSpeechRecognitionProvider(),
    officeExtractor: new StubOfficeExtractor(),
    pdfExtractor: buildPdfExtractor(adminLlmApiKey, adminLlmModel),
    tempFileStorage: tempFilesBucket
      ? new R2TempFileStorage(tempFilesBucket)
      : new StubTempFileStorage(),
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
 * - `RELAY` Service Binding (Issue #110): when bound on `[env.consumer]`
 *   AND the queue handler forwards its `ExecutionContext` via the `ctx`
 *   argument, the inner `relayTrigger` is `ServiceBindingRelayTrigger`,
 *   so secondary events emitted by `runIngestionJob` / `runExportJob`
 *   (e.g. `ingestion.previewAttached`) publish immediately. The kick is
 *   best-effort: if `waitUntil` is dropped (CPU limit, worker crash
 *   before the kick fetch completes), the relay safety-net cron (5 min)
 *   picks the row up — a documented safety-net structure. The
 *   `ctx` parameter is optional so callers that have no execution
 *   context (synthetic test harnesses, manual scripts) still get a
 *   container; they degrade to `NoopRelayTrigger` and the cron drives
 *   publication.
 * - The asymmetry between the request path and the consumer path is
 *   intentional: the request path runs `readRequestServerConfig(env, ctx)`
 *   inside the server-function entry before calling `createRequestContainer`,
 *   while the consumer path bridges `ctx` here in `createConsumerContainer`
 *   because the queue handler is the only natural seam to do so.
 * - LLM env override (Issue #110): when `ADMIN_LLM_API_KEY` and
 *   `ADMIN_LLM_MODEL` are both set, DI wires `AnthropicLLMProvider`.
 *   Admin DB-stored ciphertext is NOT consulted at dispatch time —
 *   the DB-backed dynamic-resolution layer (per-call decrypt + cache)
 *   is intentionally out of scope and will land in a follow-up Issue.
 *   OCR / PDF (Issue #113): the same `ADMIN_LLM_*` env pair drives
 *   `AnthropicOCRProvider` / `AnthropicPDFExtractor` — both present →
 *   real adapter, either missing → `Stub*`. Office / SpeechRecognition
 *   remain `Stub*`; follow-up Issues will introduce dedicated
 *   providers (Anthropic does not cover those modalities).
 * - The two sub-builders (`createRequestContainer` /
 *   `createWorkerContainer`) each call `getDatabase(env.DB)` internally,
 *   yielding two `drizzle()` handles over the **same** D1 binding.
 *   Drizzle holds no per-handle connection state and D1 has no
 *   connection pool, so the request- and worker-side ports see the
 *   same store. Keeping the sub-builders self-contained beats
 *   threading a shared handle through their signatures for a cost we
 *   can't measure.
 */
export function createConsumerContainer(
  env: ServerEnv,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): ConsumerContainer {
  const requestContainer = createRequestContainer(
    readRequestServerConfig(env, ctx),
  );
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
