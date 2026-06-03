// Test harness for application-layer integration tests.
//
// Runs inside a Workers isolate via `vitest-pool-workers`; the
// `cloudflare:test` `env.DB` binding is a real D1 SQLite database
// (in-memory under Miniflare). Per-test row cleanup is owned by
// `app/core/adapters/d1/__tests__/setup.ts` (TRUNCATE in `beforeEach`),
// so the harness here is intentionally thin: each call to
// `createTestContainer()` just builds a fresh DI container around the
// shared binding.
import { env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { content } from "@/config";
import { ConsoleEmailSender } from "@/core/adapters/cloudflare/identity/emailSender";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import { type Database, getDatabase } from "@/core/adapters/d1/client";
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
import { MarkdownItConverter } from "@/core/adapters/markdown/markdownConverter";
import { SanitizeHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { ScryptPasswordHasher } from "@/core/adapters/security/passwordHasher";
import { WebCryptoSecretBox } from "@/core/adapters/security/secretBox";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubOfficeExtractor } from "@/core/adapters/stub/officeExtractor";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
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
import { FakeLLMProvider } from "./fakes/fakeLLMProvider";
import { FakeTempFileStorage } from "./fakes/fakeTempFileStorage";

// Tests need both scopes — they exercise usecases (request) and worker
// pipelines in the same suite. Production code uses one container or
// the other, never this fat shape.
export type TestContainer = RequestContainer &
  WorkerContainer & {
    db: Database;
  };

// Base64 of 32 zero bytes — a stable test-only AES-256 key. Production
// reads the key from `SECRET_BOX_MASTER_KEY` on the worker env.
const TEST_SECRET_BOX_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// In-memory `ObjectStorage` stub used by export / media tests. Keeps the
// bytes in a per-instance map so put-then-get round-trips work, and
// produces deterministic `about:blank` URLs for presign assertions.
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
  async presignDownload(
    key: string,
    _ttlSec?: number,
    options?: { downloadFileName?: string },
  ): Promise<URL> {
    const url = new URL(`https://test.invalid/${encodeURIComponent(key)}`);
    if (options?.downloadFileName !== undefined) {
      url.searchParams.set(
        "response-content-disposition",
        `attachment; filename="${options.downloadFileName}"`,
      );
    }
    return url;
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
      appUrl: "http://localhost:8787",
    },
    unitOfWorkProvider: new D1UnitOfWorkProvider(
      db,
      SystemClock,
      UuidV7Generator,
    ),
    htmlSanitizer: new SanitizeHtmlSanitizer(),
    markdownConverter: new MarkdownItConverter(),
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

/**
 * Suite hook that yields a fresh `TestContainer` per test. Row
 * cleanup happens globally in the D1 pool's `setup.ts`, so this is
 * just a constructor + getter — no `afterEach` work is needed.
 */
export function setupTestContainer(): () => TestContainer {
  let container: TestContainer;
  beforeEach(() => {
    container = createTestContainer();
  });
  return () => container;
}
