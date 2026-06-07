import { env } from "cloudflare:test";
import { content } from "@/config";
import { ConsoleEmailSender } from "@/core/adapters/cloudflare/identity/emailSender";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import { InMemoryZipArchiveBuilder } from "@/core/adapters/export/archiveBuilder";
import { TemplateHtmlRenderer } from "@/core/adapters/export/htmlRenderer";
import { HtmlToMarkdownRenderer } from "@/core/adapters/export/markdownRenderer";
import { StubPdfRenderer } from "@/core/adapters/export/pdfRenderer";
import { MarkdownItMarkdownConverter } from "@/core/adapters/markdown/markdownConverter";
import { UltrahtmlNoteBodyRenderer } from "@/core/adapters/renderer/noteBodyRenderer";
import { UltrahtmlHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { ScryptPasswordHasher } from "@/core/adapters/security/passwordHasher";
import { WebCryptoSecretBox } from "@/core/adapters/security/secretBox";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubOfficeExtractor } from "@/core/adapters/stub/officeExtractor";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
import { FakeLLMProvider } from "@/core/application/__tests__/fakes/fakeLLMProvider";
import { FakeTempFileStorage } from "@/core/application/__tests__/fakes/fakeTempFileStorage";
import { HttpLLMConnectionTester } from "@/core/application/di/llmConnectionTester";
import type {
  RequestContainer,
  WorkerContainer,
} from "@/core/application/di/types";
import { SystemClock } from "@/core/application/ports/clock";
import { UuidV7Generator } from "@/core/application/ports/idGenerator";
import { ConsoleLogger } from "@/core/application/ports/logger";
import { NullUsageMetricsProvider } from "@/core/application/ports/usageMetricsProvider";
import type { ObjectStorage } from "@/core/domain/media/ports/objectStorage";
import { type Database, getDatabase } from "../client";
import { D1PromptResolver } from "../promptResolver";
import { D1IdempotencyStore } from "../repositories/idempotencyStore";
import { D1IndexJobRepository } from "../repositories/indexJobRepository";
import { D1OutboxRepository } from "../repositories/outboxRepository";
import { D1SessionService } from "../repositories/sessionService";
import { D1SearchIndex } from "../searchIndex";
import { D1UnitOfWorkProvider } from "../unitOfWork";

// Tests need both scopes — they seed via UoW (request) and assert via
// the outbox repo / idempotency store (worker). The fat shape is
// test-only; production code uses one container or the other.
export type TestContainer = RequestContainer &
  WorkerContainer & {
    db: Database;
  };

/**
 * Builds a fresh container around the test-isolate's `env.DB` D1 binding.
 *
 * The binding is a singleton per Workers isolate but row cleanup is
 * driven by the file-level `setup.ts` (TRUNCATE in `beforeEach`), so
 * each test sees a clean database.
 */
// Base64 of 32 zero bytes — a stable test-only AES-256 key.
const TEST_SECRET_BOX_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

class InMemoryObjectStorage implements ObjectStorage {
  private readonly bytesByKey = new Map<
    string,
    { bytes: ArrayBuffer; contentType: string }
  >();
  async put(
    key: string,
    bytes: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    this.bytesByKey.set(key, { bytes, contentType });
  }
  async get(key: string): Promise<ArrayBuffer> {
    const stored = this.bytesByKey.get(key);
    if (stored === undefined) {
      throw new Error(`storage: missing key ${key}`);
    }
    return stored.bytes;
  }
  async stat(
    key: string,
  ): Promise<Readonly<{ byteSize: number; contentType: string }>> {
    const stored = this.bytesByKey.get(key);
    if (stored === undefined) {
      throw new Error(`storage: missing key ${key}`);
    }
    return {
      byteSize: stored.bytes.byteLength,
      contentType: stored.contentType,
    };
  }
  async delete(key: string): Promise<void> {
    this.bytesByKey.delete(key);
  }
  async presignDownload(key: string): Promise<URL> {
    return new URL(`https://test.invalid/${encodeURIComponent(key)}`);
  }
  async presignUpload(key: string): Promise<URL> {
    return new URL(`https://test.invalid/${encodeURIComponent(key)}`);
  }
}

export function createTestContainer(): TestContainer {
  const db = getDatabase(env.DB);
  return {
    config: {
      ...content,
      appUrl: "http://localhost:3000",
    },
    unitOfWorkProvider: new D1UnitOfWorkProvider(
      db,
      SystemClock,
      UuidV7Generator,
    ),
    htmlSanitizer: new UltrahtmlHtmlSanitizer(),
    markdownConverter: new MarkdownItMarkdownConverter(),
    noteBodyRenderer: new UltrahtmlNoteBodyRenderer(),
    passwordHasher: new ScryptPasswordHasher(),
    secretBox: new WebCryptoSecretBox(TEST_SECRET_BOX_KEY),
    secretBoxPrevious: null,
    llmConnectionTester: new HttpLLMConnectionTester(),
    usageMetricsProvider: NullUsageMetricsProvider,
    adminSettingsEnv: {
      apiKey: null,
      provider: null,
      model: null,
      baseURL: null,
    },
    objectStorage: new InMemoryObjectStorage(),
    htmlRenderer: new TemplateHtmlRenderer(),
    markdownRenderer: new HtmlToMarkdownRenderer(),
    pdfRenderer: new StubPdfRenderer(),
    archiveBuilder: new InMemoryZipArchiveBuilder(),
    exportDesignTokens: Object.freeze({}),
    exportLimits: { maxConcurrentJobs: 3, maxJobsPerDay: 50 },
    // The relay-worker variant of the outbox repo (no PendingBatch).
    // UoW-internal saves go through a per-UoW instance constructed
    // inside `D1UnitOfWorkProvider.run`.
    outboxRepository: new D1OutboxRepository(db, UuidV7Generator, SystemClock),
    idempotencyStore: new D1IdempotencyStore(db, SystemClock),
    searchIndex: new D1SearchIndex(db, UuidV7Generator),
    indexJobRepository: new D1IndexJobRepository(
      db,
      UuidV7Generator,
      SystemClock,
    ),
    sessionService: new D1SessionService(db, SystemClock, UuidV7Generator),
    emailSender: new ConsoleEmailSender(ConsoleLogger),
    setupTokenVerifier: new EnvSetupTokenVerifier(undefined),
    llmProvider: new FakeLLMProvider(),
    ocrProvider: new StubOCRProvider(),
    speechRecognitionProvider: new StubSpeechRecognitionProvider(),
    officeExtractor: new StubOfficeExtractor(),
    pdfExtractor: new StubPDFExtractor(),
    tempFileStorage: new FakeTempFileStorage(),
    promptResolver: new D1PromptResolver(db),
    clock: SystemClock,
    idGenerator: UuidV7Generator,
    logger: ConsoleLogger,
    db,
  };
}
