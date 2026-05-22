import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types";
import { eq } from "drizzle-orm";
import { content } from "@/config";
import { ConsoleEmailSender } from "@/core/adapters/cloudflare/identity/emailSender";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import {
  R2ObjectStorage,
  type R2PresignConfig,
} from "@/core/adapters/cloudflare/r2ObjectStorage";
import { R2TempFileStorage } from "@/core/adapters/cloudflare/r2TempFileStorage";
import { ServiceBindingRelayTrigger } from "@/core/adapters/cloudflare/serviceBindingRelayTrigger";
import { getDatabase } from "@/core/adapters/d1/client";
import { D1PromptResolver } from "@/core/adapters/d1/promptResolver";
import { D1IdempotencyStore } from "@/core/adapters/d1/repositories/idempotencyStore";
import { D1IndexJobRepository } from "@/core/adapters/d1/repositories/indexJobRepository";
import { D1OutboxRepository } from "@/core/adapters/d1/repositories/outboxRepository";
import { D1SessionService } from "@/core/adapters/d1/repositories/sessionService";
import { instanceSettings as instanceSettingsTable } from "@/core/adapters/d1/schema";
import { D1SearchIndex } from "@/core/adapters/d1/searchIndex";
import { D1UnitOfWorkProvider } from "@/core/adapters/d1/unitOfWork";
import { InMemoryZipArchiveBuilder } from "@/core/adapters/export/archiveBuilder";
import { TemplateHtmlRenderer } from "@/core/adapters/export/htmlRenderer";
import { HtmlToMarkdownRenderer } from "@/core/adapters/export/markdownRenderer";
import { StubPdfRenderer } from "@/core/adapters/export/pdfRenderer";
import { MarkdownItConverter } from "@/core/adapters/markdown/markdownConverter";
import { SanitizeHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { Argon2idPasswordHasher } from "@/core/adapters/security/passwordHasher";
import {
  NullSecretBox,
  WebCryptoSecretBox,
} from "@/core/adapters/security/secretBox";
import { StubLLMProvider } from "@/core/adapters/stub/llmProvider";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubOfficeExtractor } from "@/core/adapters/stub/officeExtractor";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
import {
  isSecretBoxError,
  type SecretBox,
} from "@/core/domain/adminSettings/ports/secretBox";
import type { ExportLimits } from "@/core/domain/export/valueObject";
import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";
import {
  type TempFileStorage,
  TempFileStorageUnavailableError,
} from "@/core/domain/ingestion/ports/tempFileStorage";
import {
  type ObjectMetadata,
  type ObjectStorage,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
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
import { HttpLLMConnectionTester } from "./llmConnectionTester";
import {
  createLLMProvider,
  createOCRProvider,
  createPDFExtractor,
} from "./llmProviderFactory";
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
    // Optional `ADMIN_LLM_PROVIDER` var. Selects which provider the
    // LLM / OCR / PDF factories instantiate when `adminLlmApiKey` and
    // `adminLlmModel` are present. Unset → factories default to
    // `"anthropic"` (current sole supported provider). Public
    // information delivered via `wrangler.toml [vars]`.
    adminLlmProvider?: string;
    // Optional `ADMIN_LLM_BASE_URL` var. Threaded into `adminSettingsEnv`
    // so the admin UI surfaces env-locked state and the `updateLLMConfig`
    // usecase silent-skips writes to this field. The consumer worker
    // reads `ADMIN_LLM_BASE_URL` directly from `env` (no threading) —
    // see `resolveConsumerLlmConfig`.
    adminLlmBaseUrl?: string;
    // R2 binding for ingestion-temp storage. When present DI wires
    // `R2TempFileStorage`; absent → DI installs an inline unavailable
    // adapter that rejects every call with
    // `TempFileStorageUnavailableError` (see `createUnavailableTempFileStorage`).
    // Data-plane only, no credentials needed.
    tempFilesBucket?: R2Bucket;
    // R2 binding for the long-lived objects bucket. Wiring
    // `R2ObjectStorage` requires this AND a complete `r2PresignConfig`
    // (presign URLs are minted against the S3 endpoint, not the
    // binding). Any field missing → DI installs an inline unavailable
    // adapter that rejects every call with `StorageUnavailableError`
    // (see `createUnavailableObjectStorage`).
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
  // Optional provider id for the LLM / OCR / PDF factories. Wrangler
  // `[vars]` entry — when unset the factories default to `"anthropic"`,
  // matching the pre-#122 behaviour. Public information (no secret) so
  // it ships via vars.
  ADMIN_LLM_PROVIDER?: string;
  // Optional base URL override consumed by the OpenAI-compatible adapter
  // (Issue #101 ADR-001). Anthropic / Gemini providers ignore this
  // value. Wrangler `[vars]` entry — empty string → use the provider's
  // default endpoint. Public information delivered via vars.
  ADMIN_LLM_BASE_URL?: string;
  // R2 binding for ingestion-temp storage. Optional so the DI fallback
  // (inline unavailable adapter that rejects with
  // `TempFileStorageUnavailableError`) covers worker entries that do not
  // bind it.
  TEMP_FILES?: R2Bucket;
  // R2 binding for the long-lived objects bucket. Wiring
  // `R2ObjectStorage` additionally requires `R2_ACCOUNT_ID` /
  // `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_OBJECT_BUCKET_NAME`
  // — any missing field downgrades DI to an inline unavailable adapter
  // that rejects every call with `StorageUnavailableError`.
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
  // entirely so DI falls back to the inline unavailable adapter that
  // rejects every call with `StorageUnavailableError`; partial-config
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
    ...(env.ADMIN_LLM_PROVIDER
      ? { adminLlmProvider: env.ADMIN_LLM_PROVIDER }
      : {}),
    // container 側 (`createRequestContainer`) で `length > 0` の最終正規化を
    // 行うため、こちらは truthy（空文字を脱落させる）で十分。両側を同じ条件
    // に揃える必要はなく、threading 漏れさえ起きなければ semantics は一致。
    ...(env.ADMIN_LLM_BASE_URL
      ? { adminLlmBaseUrl: env.ADMIN_LLM_BASE_URL }
      : {}),
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

// Inline unavailable adapter for `ObjectStorage`. Wired by
// `createRequestContainer` when the R2 binding or SigV4 presign config
// is incomplete (see ADR-001 of Issue #100). Each method is an
// `async () => { throw ... }` closure so the microtask path matches
// the historical `async function { throw }` behaviour — see the
// implementation note in `.issue/100/adr.md`.
function createUnavailableObjectStorage(): ObjectStorage {
  return {
    put: async (
      _key: string,
      _bytes: ArrayBuffer,
      _contentType: string,
    ): Promise<void> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
    get: async (_key: string): Promise<ArrayBuffer> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
    stat: async (_key: string): Promise<ObjectMetadata> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
    delete: async (_key: string): Promise<void> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
    presignDownload: async (_key: string, _ttlSec: number): Promise<URL> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
    presignUpload: async (
      _key: string,
      _contentType: string,
      _ttlSec: number,
    ): Promise<URL> => {
      throw new StorageUnavailableError("object_storage_not_configured");
    },
  } satisfies ObjectStorage;
}

// Inline unavailable adapter for `TempFileStorage`. Wired by
// `createRequestContainer` when the `TEMP_FILES` R2 binding is absent.
// `async () => { throw ... }` closure form matches the historical
// `async function { throw }` microtask behaviour.
function createUnavailableTempFileStorage(): TempFileStorage {
  return {
    put: async (_key: string, _bytes: ArrayBuffer): Promise<void> => {
      throw new TempFileStorageUnavailableError(
        "temp_file_storage_not_configured",
      );
    },
    get: async (_key: string): Promise<ArrayBuffer> => {
      throw new TempFileStorageUnavailableError(
        "temp_file_storage_not_configured",
      );
    },
    delete: async (_key: string): Promise<void> => {
      throw new TempFileStorageUnavailableError(
        "temp_file_storage_not_configured",
      );
    },
  } satisfies TempFileStorage;
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
 * Build the request-time {@link OCRProvider}. Delegates to
 * {@link createOCRProvider} when both `ADMIN_LLM_API_KEY` (secret) and
 * `ADMIN_LLM_MODEL` (var) are present; either missing → fall back to
 * `StubOCRProvider`. `provider` defaults to `"anthropic"` when
 * `ADMIN_LLM_PROVIDER` is unset, preserving the pre-#122 behaviour.
 *
 * Pure helper extracted from `createRequestContainer` so the wiring
 * can be verified directly in unit tests via `instanceof` without
 * threading container internals through the test harness.
 */
export function buildOcrProvider(
  provider: string | undefined,
  adminLlmApiKey: string | undefined,
  adminLlmModel: string | undefined,
  adminLlmBaseURL?: string | null,
): OCRProvider {
  if (!adminLlmApiKey || !adminLlmModel) return new StubOCRProvider();
  return createOCRProvider({
    provider: provider ?? "anthropic",
    apiKey: adminLlmApiKey,
    model: adminLlmModel,
    ...(adminLlmBaseURL ? { baseURL: adminLlmBaseURL } : {}),
  });
}

/**
 * Build the request-time {@link PDFExtractor}. Delegates to
 * {@link createPDFExtractor} when both `ADMIN_LLM_API_KEY` and
 * `ADMIN_LLM_MODEL` are present; either missing → fall back to
 * `StubPDFExtractor`. `provider` defaults to `"anthropic"` when
 * `ADMIN_LLM_PROVIDER` is unset.
 */
export function buildPdfExtractor(
  provider: string | undefined,
  adminLlmApiKey: string | undefined,
  adminLlmModel: string | undefined,
  adminLlmBaseURL?: string | null,
): PDFExtractor {
  if (!adminLlmApiKey || !adminLlmModel) return new StubPDFExtractor();
  return createPDFExtractor({
    provider: provider ?? "anthropic",
    apiKey: adminLlmApiKey,
    model: adminLlmModel,
    ...(adminLlmBaseURL ? { baseURL: adminLlmBaseURL } : {}),
  });
}

/**
 * Build the request-time {@link LLMProvider}. Delegates to
 * {@link createLLMProvider} when both `ADMIN_LLM_API_KEY` (secret) and
 * `ADMIN_LLM_MODEL` (var) are present; either missing → fall back to
 * `StubLLMProvider`. `provider` defaults to `"anthropic"` when
 * `ADMIN_LLM_PROVIDER` is unset, preserving the pre-#122 behaviour.
 *
 * Pure helper extracted from `createRequestContainer` so the wiring
 * can be verified directly in unit tests via `instanceof` without
 * threading container internals through the test harness.
 */
export function buildLlmProvider(
  provider: string | undefined,
  adminLlmApiKey: string | undefined,
  adminLlmModel: string | undefined,
  adminLlmBaseURL?: string | null,
): LLMProvider {
  if (!adminLlmApiKey || !adminLlmModel) return new StubLLMProvider();
  return createLLMProvider({
    provider: provider ?? "anthropic",
    apiKey: adminLlmApiKey,
    model: adminLlmModel,
    ...(adminLlmBaseURL ? { baseURL: adminLlmBaseURL } : {}),
  });
}

/**
 * Build the request-scoped container. Wires the unit-of-work
 * provider with a relay trigger (Service Binding when available,
 * no-op otherwise), and exposes `config` for SSR head/meta.
 *
 * Per ADR-007 (Issue #110), the request path never invokes the LLM /
 * OCR / PDF adapters directly — every LLM-bound operation goes through
 * a queued job dispatched to the consumer worker. As a result the
 * request-side LLM ports are wired with the env-only fast path
 * (`buildLlmProvider` / `buildOcrProvider` / `buildPdfExtractor` driven
 * by `ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL`) and intentionally ignore
 * `ADMIN_LLM_BASE_URL`. The base-URL override is consulted only by
 * {@link createConsumerContainer}'s {@link resolveConsumerLlmConfig},
 * which is the sole code path that actually issues LLM HTTP calls.
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
    adminLlmProvider,
    adminLlmBaseUrl,
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
        : createUnavailableObjectStorage(),
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
    llmProvider: buildLlmProvider(
      adminLlmProvider,
      adminLlmApiKey,
      adminLlmModel,
    ),
    ocrProvider: buildOcrProvider(
      adminLlmProvider,
      adminLlmApiKey,
      adminLlmModel,
    ),
    speechRecognitionProvider: new StubSpeechRecognitionProvider(),
    officeExtractor: new StubOfficeExtractor(),
    pdfExtractor: buildPdfExtractor(
      adminLlmProvider,
      adminLlmApiKey,
      adminLlmModel,
    ),
    tempFileStorage: tempFilesBucket
      ? new R2TempFileStorage(tempFilesBucket)
      : createUnavailableTempFileStorage(),
    promptResolver: new D1PromptResolver(db),
    secretBox: secretBoxMasterKey
      ? new WebCryptoSecretBox(secretBoxMasterKey)
      : new NullSecretBox(),
    llmConnectionTester: new HttpLLMConnectionTester(),
    usageMetricsProvider: NullUsageMetricsProvider,
    adminSettingsEnv: {
      apiKey:
        adminLlmApiKey !== undefined && adminLlmApiKey.length > 0
          ? adminLlmApiKey
          : null,
      provider:
        adminLlmProvider !== undefined && adminLlmProvider.length > 0
          ? adminLlmProvider
          : null,
      model:
        adminLlmModel !== undefined && adminLlmModel.length > 0
          ? adminLlmModel
          : null,
      baseURL:
        adminLlmBaseUrl !== undefined && adminLlmBaseUrl.length > 0
          ? adminLlmBaseUrl
          : null,
    },
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
 * - LLM adapters are wired **twice on purpose**: first by the inner
 *   `createRequestContainer` call below using the env-only fast path
 *   (`ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL`), then optionally
 *   overridden by the `resolveConsumerLlmConfig`-driven block when a
 *   DB-stored ciphertext successfully decrypts. The first build is
 *   cheap — adapter constructors only stash the api key / model strings
 *   and never open a network connection — so the duplication buys
 *   simplicity (no special "skip LLM wiring" knob threaded into
 *   `createRequestContainer`) at negligible runtime cost.
 */
export async function createConsumerContainer(
  env: ServerEnv,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<ConsumerContainer> {
  const requestContainer = createRequestContainer(
    readRequestServerConfig(env, ctx),
  );
  const workerContainer = createWorkerContainer(env);
  // ADR-007: consumer-path async pre-step. Resolve (provider, model,
  // baseURL, apiKey) per env override > DB > Stub fallback, then override
  // the request-side LLM / OCR / PDF ports with adapters built from the
  // resolved values. A `null` resolution leaves the request-side adapters
  // in place (env-only path or Stub fallback).
  const resolved = await resolveConsumerLlmConfig(
    env,
    requestContainer.secretBox,
  );
  const llmOverrides: Partial<{
    llmProvider: LLMProvider;
    ocrProvider: OCRProvider;
    pdfExtractor: PDFExtractor;
  }> = resolved
    ? {
        llmProvider: buildLlmProvider(
          resolved.provider,
          resolved.apiKey,
          resolved.model,
          resolved.baseURL,
        ),
        ocrProvider: buildOcrProvider(
          resolved.provider,
          resolved.apiKey,
          resolved.model,
          resolved.baseURL,
        ),
        pdfExtractor: buildPdfExtractor(
          resolved.provider,
          resolved.apiKey,
          resolved.model,
          resolved.baseURL,
        ),
      }
    : {};
  return {
    ...requestContainer,
    ...llmOverrides,
    outboxRepository: workerContainer.outboxRepository,
    idempotencyStore: workerContainer.idempotencyStore,
    indexJobRepository: workerContainer.indexJobRepository,
  } satisfies ConsumerContainer;
}

/**
 * Shape of `(provider, model, baseURL, apiKey)` resolved for the
 * consumer-worker LLM / OCR / PDF factories. Returned by
 * {@link resolveConsumerLlmConfig} only when all three required fields
 * (`provider`, `model`, `apiKey`) are usable; otherwise the resolver
 * returns `null` and the consumer container keeps the request-side
 * adapters the env-only / Stub fallback already wired.
 */
type ResolvedConsumerLlmConfig = Readonly<{
  provider: string;
  model: string;
  baseURL: string | null;
  apiKey: string;
}>;

/**
 * Resolve the LLM config for the consumer worker per ADR-007:
 *
 * **env override > DB resolution > Stub fallback**.
 *
 * 1. `provider` / `model`: env value (set & non-empty) wins; else DB value
 *    (when an `instance_settings` row exists).
 * 2. `baseURL`: env value (set & non-empty) wins; else DB value (may be
 *    `null`). Only meaningful for the `openai` provider — adapter
 *    factories ignore it otherwise (`LLMConfig.create` enforces the
 *    invariant at write time, so the value reaching this resolver is
 *    already shape-correct for the chosen provider).
 * 3. `apiKey`:
 *    - `ADMIN_LLM_API_KEY` env set & non-empty → env value (DB ciphertext
 *      ignored).
 *    - else if `llm_api_key_ciphertext` row column present → `SecretBox.decrypt`.
 *    - decrypt failure (`SecretBoxError`, e.g. `NullSecretBox` raises
 *      `KeyUnavailable`; wrong master key raises `DecryptFailed`) → return
 *      `null` and warn-log so the consumer container keeps the
 *      request-side Stub adapters rather than crashing the queue handler.
 *    - else (no ciphertext, no env) → return `null` (Stub fallback).
 *
 * Returns `null` when any of `(provider, model, apiKey)` is missing, which
 * means "no LLM override; use whatever `createRequestContainer` already
 * wired" (env-only path or Stub).
 *
 * Reads `instance_settings` directly via the D1 binding (no UoW) — this is
 * a read-only resolution path, the singleton aggregate is queried by
 * primary key, and the cost of constructing a UoW for a single read would
 * dwarf the read itself. Mirrors `D1PromptResolver`'s direct-read pattern.
 */
async function resolveConsumerLlmConfig(
  env: ServerEnv,
  secretBox: SecretBox,
): Promise<ResolvedConsumerLlmConfig | null> {
  // A read failure (missing table during migration, transient D1 hiccup)
  // collapses to "no DB value" so the env-only path or Stub fallback
  // continues to serve. A warn-log here would be excessively noisy for a
  // fresh deployment where the row simply hasn't been written yet.
  const dbRow = await readInstanceSettingsLlmRow(env).catch(() => null);

  const envProvider = env.ADMIN_LLM_PROVIDER;
  const provider =
    envProvider !== undefined && envProvider.length > 0
      ? envProvider
      : (dbRow?.llmProvider ?? null);

  const envModel = env.ADMIN_LLM_MODEL;
  const model =
    envModel !== undefined && envModel.length > 0
      ? envModel
      : (dbRow?.llmModel ?? null);

  const envBaseURL = env.ADMIN_LLM_BASE_URL;
  const baseURL =
    envBaseURL !== undefined && envBaseURL.length > 0
      ? envBaseURL
      : (dbRow?.llmBaseUrl ?? null);

  let apiKey: string | null = null;
  const envApiKey = env.ADMIN_LLM_API_KEY;
  if (envApiKey !== undefined && envApiKey.length > 0) {
    apiKey = envApiKey;
  } else if (dbRow?.llmApiKeyCiphertext) {
    try {
      apiKey = await secretBox.decrypt(dbRow.llmApiKeyCiphertext);
    } catch (cause) {
      if (isSecretBoxError(cause)) {
        ConsoleLogger.warn(
          "[di] consumer LLM apiKey decrypt failed; falling back to Stub adapters",
          { code: cause.code },
        );
      } else {
        ConsoleLogger.warn(
          "[di] consumer LLM apiKey resolution threw; falling back to Stub adapters",
          { cause },
        );
      }
      return null;
    }
  }

  if (provider === null || model === null || apiKey === null) {
    return null;
  }

  return { provider, model, baseURL, apiKey };
}

type InstanceSettingsLlmRow = Readonly<{
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string | null;
  llmApiKeyCiphertext: string | null;
}>;

/**
 * Read the singleton `instance_settings` row's LLM-relevant columns.
 * Returns `null` when the row is missing (fresh deployment before the
 * admin has saved anything). Throws on a driver-level read failure; the
 * caller swallows it via `.catch(() => null)` so a transient D1 hiccup
 * does not knock the consumer worker offline.
 */
async function readInstanceSettingsLlmRow(
  env: ServerEnv,
): Promise<InstanceSettingsLlmRow | null> {
  const db = getDatabase(env.DB);
  const rows = await db
    .select({
      llmProvider: instanceSettingsTable.llmProvider,
      llmModel: instanceSettingsTable.llmModel,
      llmBaseUrl: instanceSettingsTable.llmBaseUrl,
      llmApiKeyCiphertext: instanceSettingsTable.llmApiKeyCiphertext,
    })
    .from(instanceSettingsTable)
    .where(eq(instanceSettingsTable.id, "singleton"))
    .limit(1);
  return rows[0] ?? null;
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
