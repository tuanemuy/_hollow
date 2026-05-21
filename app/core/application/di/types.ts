import type { LLMConnectionTester } from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type { SecretBox } from "@/core/domain/adminSettings/ports/secretBox";
import type { ArchiveBuilder } from "@/core/domain/export/ports/archiveBuilder";
import type { HtmlRenderer } from "@/core/domain/export/ports/htmlRenderer";
import type { MarkdownRenderer } from "@/core/domain/export/ports/markdownRenderer";
import type { PDFRenderer } from "@/core/domain/export/ports/pdfRenderer";
import type { ExportLimits } from "@/core/domain/export/valueObject";
import type { EmailSender } from "@/core/domain/identity/ports/emailSender";
import type { SessionService } from "@/core/domain/identity/ports/sessionService";
import type { SetupTokenVerifier } from "@/core/domain/identity/ports/setupTokenVerifier";
import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { OfficeExtractor } from "@/core/domain/ingestion/ports/officeExtractor";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";
import type { PromptResolver } from "@/core/domain/ingestion/ports/promptResolver";
import type { SpeechRecognitionProvider } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import type { TempFileStorage } from "@/core/domain/ingestion/ports/tempFileStorage";
import type { ObjectStorage } from "@/core/domain/media/ports/objectStorage";
import type { HtmlSanitizer } from "@/core/domain/note/ports/htmlSanitizer";
import type { MarkdownConverter } from "@/core/domain/note/ports/markdownConverter";
import type { PasswordHasher } from "@/core/domain/publication/ports/passwordHasher";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import type { UnitOfWorkProvider } from "../execution/unitOfWork";
import type { Clock } from "../ports/clock";
import type { IdempotencyStore } from "../ports/idempotencyStore";
import type { IdGenerator } from "../ports/idGenerator";
import type { Logger } from "../ports/logger";
import type { OutboxRepository } from "../ports/outboxRepository";
import type { UsageMetricsProvider } from "../ports/usageMetricsProvider";

/**
 * Operator-controlled env values that adminSettings usecases consult.
 *
 * `apiKey` mirrors the `env.apiKey` field threaded through
 * `AdminSettingsService.assertEnvOverride`. `null` means "operator has
 * not configured an env-supplied key"; the stored `LLMConfig` takes
 * effect verbatim. When set, the env value forces `apiKeySource = 'env'`
 * so runtime resolution always prefers it.
 */
export type AdminSettingsEnv = Readonly<{ apiKey: string | null }>;

export type AppConfig = Readonly<{
  appUrl: string;
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  twitterHandle?: string;
  themeColor: string;
}>;

/**
 * Cross-cutting deterministic deps shared between request and worker
 * containers. Held as ports so domain / application code stays free of
 * ambient time, id generation, and IO sinks.
 */
export type SharedDeps = Readonly<{
  clock: Clock;
  idGenerator: IdGenerator;
  logger: Logger;
}>;

/**
 * Request-path container. Provided to usecases that mutate aggregates
 * (which must run inside `unitOfWorkProvider.run`) and to the
 * presentation layer for SSR head/meta via `config`.
 *
 * Intentionally does NOT carry `outboxRepository` or
 * `idempotencyStore`: those are worker concerns. A request that needs
 * to enqueue a domain event uses the UoW's `collectEvents`, which
 * funnels through the transactional outbox write inside the unit of
 * work — never touching the repository directly.
 *
 * `htmlSanitizer` / `markdownConverter` are note-content pipeline ports
 * lifted into the container so usecases can pass them to
 * `NoteService.assembleFromInputs` without each call site constructing
 * its own adapter. Both implementations are stateless and request-safe.
 */
export type RequestContainer = SharedDeps &
  Readonly<{
    config: AppConfig;
    unitOfWorkProvider: UnitOfWorkProvider;
    htmlSanitizer: HtmlSanitizer;
    markdownConverter: MarkdownConverter;
    /**
     * Stateless hash / verify pair used by share-link password
     * verification (`IssueShareLink`, `SetShareLinkPassword`,
     * `ResolveShareLink`). Distinct from identity-side credential
     * hashing so the two algorithms can evolve independently.
     */
    passwordHasher: PasswordHasher;
    /**
     * Binary object storage port (R2 in the reference runtime). Export
     * usecases call into this for raw `put` / `delete` (artifact
     * persistence) and to mint short-lived presigned URLs for downloads.
     * Storage operations stay outside the UoW boundary because the
     * underlying backend has no two-phase commit.
     */
    objectStorage: ObjectStorage;
    /**
     * Export rendering pipeline. Renderers are stateless and stay outside
     * the UoW boundary — they translate Note HTML / media bytes into the
     * export artifact and never touch aggregates.
     */
    htmlRenderer: HtmlRenderer;
    markdownRenderer: MarkdownRenderer;
    pdfRenderer: PDFRenderer;
    archiveBuilder: ArchiveBuilder;
    /**
     * Design tokens injected into the exported HTML wrapper so the
     * artifact renders without the live site's CSS pipeline. Sourced from
     * the runtime configuration at container construction time; the
     * export usecases do not re-read them per request.
     */
    exportDesignTokens: Readonly<Record<string, string>>;
    /**
     * Per-user export quota envelope consulted by `EnqueueExportJob` via
     * `ExportService.enforceQuota`. Read from configuration at container
     * construction time so request-path usecases stay deterministic.
     */
    exportLimits: ExportLimits;
    /**
     * UoW-non-participating identity plumbing ports. Sessions, email,
     * and the setup-token verifier touch resources the UoW cannot
     * include atomically (external session store, SMTP provider,
     * env-bound secret), so identity usecases invoke them outside the
     * `unitOfWorkProvider.run` boundary — typically *after* commit
     * for write-side flows (`VerifyEmail`, `LogIn`, `DeleteAccount`)
     * and inline for read-side checks (`AdminSignUp` setup-token
     * verification).
     */
    sessionService: SessionService;
    emailSender: EmailSender;
    setupTokenVerifier: SetupTokenVerifier;
    /**
     * Search-index port. Reads run directly against the index; writes go
     * through `IndexJob` for at-least-once delivery, so request-path
     * usecases use this only for read queries (`SearchService.runQuery`).
     * The indexer worker uses the worker-container variant for
     * `applyUpsert` / `applyDelete`.
     */
    searchIndex: SearchIndex;
    /**
     * Ingestion pipeline ports. The upload / preview / commit flow
     * orchestrates these adapters from inside the application layer so
     * the request and worker invocation paths share a single container
     * shape. The stub-friendly default impls live under
     * `app/core/adapters/llm/`; production deployments swap in the
     * hosted variants without changing the usecase signatures.
     */
    llmProvider: LLMProvider;
    ocrProvider: OCRProvider;
    speechRecognitionProvider: SpeechRecognitionProvider;
    officeExtractor: OfficeExtractor;
    pdfExtractor: PDFExtractor;
    tempFileStorage: TempFileStorage;
    promptResolver: PromptResolver;
    /**
     * Symmetric envelope encryption for at-rest secrets. AdminSettings
     * usecases call into `SecretBox.encrypt` when persisting an
     * `LLMConfig` with `apiKeySource === 'db'`, and `SecretBox.decrypt`
     * before forwarding the key to the `LLMConnectionTester`.
     */
    secretBox: SecretBox;
    /**
     * Provider liveness probe used by `TestLLMConnection`. Implementations
     * fold transport / 4xx / 5xx outcomes into the `LLMConnectionPingResult`
     * struct so the admin UI can render the verdict uniformly without
     * the usecase having to translate errors.
     */
    llmConnectionTester: LLMConnectionTester;
    /**
     * Best-effort runtime metrics aggregator backing `GetUsageMetrics`.
     * Implementations must not throw — failed metrics surface as `null`
     * fields so the admin page degrades gracefully.
     */
    usageMetricsProvider: UsageMetricsProvider;
    /**
     * Operator-controlled env values consulted by admin usecases.
     * Currently only the LLM api-key env override (see
     * `AdminSettingsService.assertEnvOverride`).
     */
    adminSettingsEnv: AdminSettingsEnv;
  }>;

/**
 * Worker-path container. Used by the relay (`processOutboxEvents`),
 * pruner (`pruneOutbox`), queue consumer, and DLQ handler.
 *
 * Intentionally does NOT carry `config` or `unitOfWorkProvider`:
 * `config` is SSR-only metadata, and worker code that reads/writes
 * the outbox does so through `outboxRepository` directly without a
 * unit of work (no aggregate is mutated).
 */
export type WorkerContainer = SharedDeps &
  Readonly<{
    outboxRepository: OutboxRepository;
    idempotencyStore: IdempotencyStore;
    /**
     * Search-index port for the queue consumer (`ConsumeIndexJob`).
     * Writes go through `SearchService.applyUpsert` / `applyDelete` —
     * both are idempotent at the adapter level so duplicate dispatch
     * via at-least-once delivery converges to the same state.
     */
    searchIndex: SearchIndex;
    /**
     * Indexer queue repository. Workers need direct access since
     * `ConsumeIndexJob` operates outside any UoW (the index is a
     * derived projection — no aggregate is mutated transactionally).
     */
    indexJobRepository: IndexJobRepository;
  }>;

/**
 * Queue consumer container. The consumer dispatches `DomainEvent`s to
 * application usecases that mutate aggregates (e.g. `runIngestionJob`,
 * `runExportJob`), so it needs the full `RequestContainer` surface for
 * UoW + ports — *plus* the worker-only ports (`outboxRepository`,
 * `idempotencyStore`, `indexJobRepository`) used by handler glue and
 * downstream consumers.
 *
 * `Pick<WorkerContainer, ...>` picks only the three worker-exclusive
 * ports rather than spreading the whole `WorkerContainer` so the
 * `searchIndex` port (present on both `RequestContainer` and
 * `WorkerContainer`) is not duplicated / shadowed.
 */
export type ConsumerContainer = RequestContainer &
  Pick<
    WorkerContainer,
    "outboxRepository" | "idempotencyStore" | "indexJobRepository"
  >;
