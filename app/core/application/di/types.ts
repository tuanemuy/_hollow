import type { LLMConnectionTester } from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type { SecretBox } from "@/core/domain/adminSettings/ports/secretBox";
import type { SpeechConnectionTester } from "@/core/domain/adminSettings/ports/speechConnectionTester";
import type { LLMProvider as LLMProviderName } from "@/core/domain/adminSettings/valueObject";
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
import type { NoteBodyRenderer } from "@/core/domain/note/ports/noteBodyRenderer";
import type { PasswordHasher } from "@/core/domain/publication/ports/passwordHasher";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import type { ActivityLogRepository } from "../activityLog/ports";
import type { UnitOfWorkProvider } from "../execution/unitOfWork";
import type { LlmCallLogRecorder } from "../llmCallLog/ports";
import type { Clock } from "../ports/clock";
import type { IdempotencyStore } from "../ports/idempotencyStore";
import type { IdGenerator } from "../ports/idGenerator";
import type { JobStatePruner } from "../ports/jobStatePruner";
import type { Logger } from "../ports/logger";
import type { OutboxRepository } from "../ports/outboxRepository";
import type { PromptPreviewRateLimiter } from "../ports/promptPreviewRateLimiter";
import type { UsageMetricsProvider } from "../ports/usageMetricsProvider";

/**
 * Operator-controlled env values that adminSettings usecases consult.
 *
 * Each field mirrors a single `ADMIN_LLM_*` env var. `null` means the
 * operator has not configured an env override for that field; the
 * stored `LLMConfig` takes effect verbatim. Presence semantics follow
 * `value !== undefined && value.length > 0` (see ADR-002 of Issue #143),
 * matching the consumer-side resolver in
 * `serverCloudflare.ts:resolveConsumerLlmConfig` so admin UI and
 * consumer agree on which fields are env-locked.
 *
 * - `apiKey`: forces `apiKeySource = 'env'` via
 *   `AdminSettingsService.assertEnvOverride` so runtime always prefers
 *   the env value. The raw string never crosses into the DTO.
 * - `provider` / `model` / `baseURL`: silent-skip targets in
 *   `updateLLMConfig` — when set, the corresponding fields on the saved
 *   draft are reverted to the persisted DB value so env > DB resolution
 *   stays consistent across read and write paths.
 */
export type AdminSettingsEnv = Readonly<{
  apiKey: string | null;
  provider: string | null;
  model: string | null;
  baseURL: string | null;
}>;

/**
 * Operator-controlled env values for the speech-recognition (transcription)
 * provider. Mirrors {@link AdminSettingsEnv} but for the `ADMIN_SPEECH_*` env
 * vars. There is no `baseURL` axis — the OpenAI transcription endpoint is
 * fixed.
 *
 * - `apiKey`: forces `apiKeySource = 'env'` via
 *   `AdminSettingsService.assertSpeechEnvOverride` so runtime always
 *   prefers the env value. The raw string never crosses into the DTO.
 * - `provider` / `model`: silent-skip targets in `updateSpeechConfig` —
 *   when set, the corresponding saved-draft fields revert to the persisted
 *   DB value so env > DB resolution stays consistent across read and write.
 */
export type AdminSpeechEnv = Readonly<{
  apiKey: string | null;
  provider: string | null;
  model: string | null;
}>;

export type AppConfig = Readonly<{
  appUrl: string;
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  twitterHandle?: string;
  themeColor: string;
  /** OGP locale tag (`og:locale`), e.g. `ja_JP`. */
  locale: string;
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
     * Display-only note-body renderer. `GetNoteDetail` runs the stored
     * `ContentHtml` through this on the read path to mark up
     * `[[wikilink]]` / `#hashtag` tokens as pills; the persisted body and
     * the export pipeline keep the verbatim tokens untouched. Stateless
     * and request-safe like the other note-content ports.
     */
    noteBodyRenderer: NoteBodyRenderer;
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
     * `app/core/adapters/stub/`; production deployments swap in the
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
     * Per-user fixed-window rate limiter guarding `previewPrompt`. Each
     * preview triggers a real billable LLM call, so the usecase claims a
     * slot here before invoking the provider. Request-scoped (a request-path
     * usecase), unlike the worker-only `idempotencyStore`.
     */
    promptPreviewRateLimiter: PromptPreviewRateLimiter;
    /**
     * Symmetric envelope encryption for at-rest secrets. AdminSettings
     * usecases call into `SecretBox.encrypt` when persisting an
     * `LLMConfig` with `apiKeySource === 'db'`, and `SecretBox.decrypt`
     * before forwarding the key to the `LLMConnectionTester`.
     */
    secretBox: SecretBox;
    /**
     * Previous-master-key `SecretBox`, present only during a
     * `SECRET_BOX_MASTER_KEY` rotation. Sourced from
     * the temporary `SECRET_BOX_MASTER_KEY_PREVIOUS` secret; `null` in the
     * common non-rotation case. The re-encrypt usecase and the consumer
     * decrypt path thread it through `decryptWithFallback` so rows still
     * encrypted under the outgoing key remain readable mid-rotation.
     */
    secretBoxPrevious: SecretBox | null;
    /**
     * Provider liveness probe used by `TestLLMConnection`. Implementations
     * fold transport / 4xx / 5xx outcomes into the `LLMConnectionPingResult`
     * struct so the admin UI can render the verdict uniformly without
     * the usecase having to translate errors.
     */
    llmConnectionTester: LLMConnectionTester;
    /**
     * Provider liveness probe used by `TestSpeechConnection`.
     * Symmetric with {@link llmConnectionTester}: folds transport / 4xx /
     * 5xx outcomes into the `SpeechConnectionPingResult` struct so the admin
     * UI renders the verdict uniformly without the usecase translating
     * errors.
     */
    speechConnectionTester: SpeechConnectionTester;
    /**
     * Best-effort runtime metrics aggregator backing `GetUsageMetrics`.
     * Implementations must not throw — failed metrics surface as `null`
     * fields so the admin page degrades gracefully.
     */
    usageMetricsProvider: UsageMetricsProvider;
    /**
     * Activity-log read-model repository. Present on the
     * request path for the **read** usecase (`getRecentActivity`, admin
     * dashboard). The projection **writes** run on the worker side via the
     * same port on {@link WorkerContainer}. The repository is stateless and
     * request-safe; it is deliberately kept off the `UnitOfWorkContext`
     * because the activity log is never written transactionally inside a
     * request-path aggregate UoW (ADR-006).
     */
    activityLogRepository: ActivityLogRepository;
    /**
     * LLM-call-log recorder (write/prune). On the request path it backs the
     * **write** in `previewPrompt` (one row per successful preview LLM call,
     * #748 ADR-002). The read side (dashboard series / 24h scalar) lives on
     * `usageMetricsProvider`, not here (#748 ADR-003). Best-effort: the
     * usecase swallows write failures so a record miss never breaks preview.
     * Kept off the `UnitOfWorkContext` — preview opens no UoW.
     */
    llmCallLogRecorder: LlmCallLogRecorder;
    /**
     * Resolved name of the **actually constructed** LLM provider (#748
     * ADR-006). Recorded on the `llm_call_log` row's `provider` column so
     * the dashboard reflects the real provider in use rather than the raw
     * `ADMIN_LLM_PROVIDER` env value (which diverges from reality on the
     * Stub fallback). Defaults to the request-side `buildLlmProvider`
     * resolution; the consumer path overrides it from
     * `resolveConsumerLlmConfig`.
     */
    llmProviderName: LLMProviderName;
    /**
     * Operator-controlled env values consulted by admin usecases. See
     * {@link AdminSettingsEnv} for field semantics and the env-override
     * contract shared with the consumer-side resolver.
     */
    adminSettingsEnv: AdminSettingsEnv;
    /**
     * Operator-controlled speech env values consulted by `updateSpeechConfig`
     * / `testSpeechConnection`. See {@link AdminSpeechEnv}.
     */
    adminSpeechEnv: AdminSpeechEnv;
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
    /**
     * Activity-log projection repository. Written by the
     * activity-log handlers inside the queue consumer outside any UoW (the
     * activity log is a derived read-model — no aggregate is mutated
     * transactionally), so it lives here on the worker container and is
     * deliberately kept off the `UnitOfWorkContext` (ADR-006).
     */
    activityLogRepository: ActivityLogRepository;
    /**
     * LLM-call-log recorder. Used by the pruner's daily tick
     * (`pruneLlmCallLog`) to sweep rows past the retention window (#748
     * ADR-005). The ingestion **write** path uses the same port via the
     * {@link ConsumerContainer}, which inherits it from the spread
     * {@link RequestContainer}.
     */
    llmCallLogRecorder: LlmCallLogRecorder;
    /**
     * Terminal job-state row pruner. Used by the pruner's daily tick
     * (`pruneExportJobs` / `pruneTagMergeJobs`) to GC terminal
     * `export_jobs` / `tag_merge_jobs` rows past the retention window. A
     * worker-maintenance port separate from the UoW-bound aggregate
     * repositories (Issue #783 ADR-001).
     */
    jobStatePruner: JobStatePruner;
  }>;

/**
 * Queue consumer container. The consumer dispatches `DomainEvent`s to
 * application usecases that mutate aggregates (e.g. `runIngestionJob`,
 * `runExportJob`), so it needs the full `RequestContainer` surface for
 * UoW + ports — *plus* the worker-only ports (`outboxRepository`,
 * `idempotencyStore`, `indexJobRepository`) used by handler glue and
 * downstream consumers.
 *
 * `Pick<WorkerContainer, ...>` picks only the worker-exclusive ports
 * rather than spreading the whole `WorkerContainer` so the `searchIndex`
 * port (present on both `RequestContainer` and `WorkerContainer`) is not
 * duplicated / shadowed.
 *
 * `jobStatePruner` is picked even though the consumer never prunes: the
 * queue dispatch handlers (`searchHandleNoteTrashedEvent`,
 * `handleNoteSavedEvent`, …) are typed against `WorkerContainer`, so the
 * consumer container must stay assignable to it (Issue #783 ADR-006).
 */
export type ConsumerContainer = RequestContainer &
  Pick<
    WorkerContainer,
    | "outboxRepository"
    | "idempotencyStore"
    | "indexJobRepository"
    | "jobStatePruner"
  >;
