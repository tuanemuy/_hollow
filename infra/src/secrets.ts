import type { Config } from "./config.ts";
import { workerNames } from "./config.ts";

/**
 * Required secrets per Worker. The CI deploy step decrypts the SOPS-encrypted
 * file under `infra/secrets/{stage}.enc.json` and uses `wrangler secret bulk`
 * to push the listed keys into the corresponding Worker.
 *
 * Keep this list in sync with what the application actually reads — adding a
 * key here without adding it to the encrypted secrets file will cause the
 * deploy to fail loudly, which is the desired behavior.
 */
export type WorkerSecretSpec = {
  worker: string;
  secrets: readonly string[];
};

export const workerSecretSpecs = (cfg: Config): readonly WorkerSecretSpec[] => {
  const names = workerNames(cfg);
  const shared = [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ] as const;
  // Secrets required by code paths that actually dispatch ingestion /
  // export work — i.e. the web Worker (request-driven dispatch) and
  // the queue consumer (event-driven dispatch).
  //
  // - `SECRET_BOX_MASTER_KEY`: base64-encoded 32-byte AES-256 key for
  //   `WebCryptoSecretBox`. Consumer needs it to decrypt the DB-stored
  //   LLM api key when admin settings are resolved during dispatch.
  //   When unset, DI falls back to `NullSecretBox` and any decrypt
  //   operation surfaces `SecretBoxError(KeyUnavailable)`.
  // - `ADMIN_LLM_API_KEY`: env override for the admin-side LLM provider
  //   api key (Anthropic / OpenAI / Gemini — selected by
  //   `ADMIN_LLM_PROVIDER`). Combined with the `ADMIN_LLM_MODEL` +
  //   `ADMIN_LLM_PROVIDER` vars (public), it triggers DI to wire the
  //   matching real adapter (`AnthropicLLMProvider` /
  //   `OpenAILLMProvider` / `GeminiLLMProvider`). Absent → the consumer
  //   worker falls back to the DB-stored ciphertext (decrypted via
  //   `SecretBox`/`SECRET_BOX_MASTER_KEY`) when present, otherwise to
  //   `StubLLMProvider`.
  // - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`:
  //   SigV4 credentials for `R2ObjectStorage.presign*`. R2's Worker
  //   binding (`OBJECT_STORAGE`) only covers data-plane ops; presigned
  //   URLs are minted against the S3-compatible endpoint and need a
  //   manually-issued R2 access token. See ADR-005 (#110) — issue per
  //   stage, never share keys across staging/production.
  //
  // `ADMIN_SETUP_TOKEN` is deliberately NOT listed here — it is a
  // single-use bootstrap secret set via `wrangler secret put` and
  // deleted after the first admin sign-up (ADR-007 #110), so it has
  // no place in the IaC-managed long-lived secrets file.
  //
  // ADR-007 (#110): the CI `wrangler secret bulk` step pushes the
  // single SOPS-decrypted file to every worker. This spec is therefore
  // documentation-only until per-worker filtering lands; relay /
  // pruner / dlq currently receive these secrets even though they do
  // not consume them.
  const dispatchExtras = [
    "SECRET_BOX_MASTER_KEY",
    "ADMIN_LLM_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  return [
    { worker: names.web, secrets: [...shared, ...dispatchExtras] },
    { worker: names.relay, secrets: shared },
    { worker: names.consumer, secrets: [...shared, ...dispatchExtras] },
    { worker: names.pruner, secrets: shared },
    { worker: names.dlq, secrets: shared },
    // Indexer (Issue #145) drains `index_jobs` against D1 + SearchIndex.
    // No LLM / R2 secrets are actually consumed; only the `shared`
    // BETTER_AUTH / GOOGLE_* are listed here for parity with relay /
    // pruner / dlq under the bulk-push constraint described above
    // (ADR-007 #110). Once per-worker filtering lands, this list can
    // shrink to the actually-used subset (currently empty).
    { worker: names.indexer, secrets: shared },
  ];
};
