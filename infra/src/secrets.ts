import type { Config } from "./config.ts";
import { workerNames } from "./config.ts";

/**
 * Required secrets per Worker. The CI deploy step decrypts the SOPS-encrypted
 * file under `infra/secrets/{stage}.enc.json` and uses `wrangler secret bulk`
 * to push the listed keys into the corresponding Worker.
 *
 * Keep this list in sync with what the application actually reads. The CI
 * workflow runs `infra/scripts/checkSecrets.ts` (via
 * `pnpm infra:check-secrets:<stage> -- <decrypted-path>`) before
 * `wrangler secret bulk` to validate that the union of `.secrets` here
 * matches the keys present in `infra/secrets/<stage>.enc.json` (after
 * stripping `^_`-prefixed documentation-only keys). Any drift fails the
 * deploy loudly: adding a key here without adding it to the encrypted
 * file (or vice versa) blocks the secret-push step.
 *
 * Invariant: the `secrets: readonly string[]` arrays below must not
 * depend on `cfg.appName`. `checkSecrets.ts` passes a dummy `appName`
 * so it can run without pulling Pulumi stack output — `cfg` is only
 * consumed here to derive worker names via `workerNames(cfg)`.
 *
 * `^_` prefix convention: keys starting with `_` in
 * `infra/secrets/<stage>.json.example` / `.enc.json` are
 * documentation-only. The CI `jq` filter strips them before bulk-push,
 * and `checkSecrets.ts` ignores them when comparing the union against
 * the decrypted JSON.
 */
export type WorkerSecretSpec = {
  worker: string;
  secrets: readonly string[];
};

export const workerSecretSpecs = (
  cfg: Pick<Config, "appName" | "stage">,
): readonly WorkerSecretSpec[] => {
  const names = workerNames(cfg);
  const shared = [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    // Resend HTTP API key consumed by `ResendEmailSender` for the four
    // transactional templates (verification / password reset / email
    // change notice / email change warning). Paired with the public
    // `EMAIL_FROM` var — both present → DI wires `ResendEmailSender`;
    // either missing → DI keeps `ConsoleEmailSender` (dev fallback that
    // only logs). Listed in `shared` for the same bulk-push reason as
    // the other entries (ADR-007 #110); only the web Worker actually
    // consumes it, so non-web Workers receive an unused secret until
    // per-worker filtering lands. See `.issue/197/adr.md` ADR-004.
    "RESEND_API_KEY",
  ] as const;
  // LLM / crypto secrets required by code paths that actually dispatch
  // ingestion / export work — i.e. the web Worker (request-driven
  // dispatch) and the queue consumer (event-driven dispatch).
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
  //
  // `ADMIN_SETUP_TOKEN` is deliberately NOT listed here — it is a
  // single-use bootstrap secret set via `wrangler secret put` and
  // deleted after the first admin sign-up (ADR-007 #110), so it has
  // no place in the IaC-managed long-lived secrets file.
  //
  // ADR-007 (#110): the CI `wrangler secret bulk` step pushes the
  // single SOPS-decrypted file to every worker. This spec is therefore
  // documentation-only until per-worker filtering lands; relay / dlq /
  // pruner currently receive these secrets even though they do not
  // consume them (the pruner consumes only the R2 trio below).
  const llmDispatchExtras = [
    "SECRET_BOX_MASTER_KEY",
    "ADMIN_LLM_API_KEY",
  ] as const;
  // `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`:
  // SigV4 credentials for `R2ObjectStorage.presign*`. R2's Worker
  // binding (`OBJECT_STORAGE`) only covers data-plane ops; presigned
  // URLs are minted against the S3-compatible endpoint and need a
  // manually-issued R2 access token. See ADR-005 (#110) — issue per
  // stage, never share keys across staging/production. Consumed by web
  // / consumer (presign + dispatch) and by the pruner: its purge steps
  // (`purgeExpiredExports`, `sweepAbandonedSourceIntakes` →
  // `purgeOrphans`, Issue #783 / #468) build a `RequestContainer` whose
  // objectStorage falls back to an unavailable stub unless the binding
  // AND all three presign secrets are present.
  const r2PresignExtras = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;
  return [
    {
      worker: names.web,
      secrets: [...shared, ...llmDispatchExtras, ...r2PresignExtras],
    },
    { worker: names.relay, secrets: shared },
    {
      worker: names.consumer,
      secrets: [...shared, ...llmDispatchExtras, ...r2PresignExtras],
    },
    { worker: names.pruner, secrets: [...shared, ...r2PresignExtras] },
    { worker: names.dlq, secrets: shared },
    // Indexer (Issue #145) drains `index_jobs` against D1 + SearchIndex.
    // No LLM / R2 secrets are actually consumed; only the `shared`
    // BETTER_AUTH / GOOGLE_* are listed here for parity with relay /
    // dlq under the bulk-push constraint described above (ADR-007
    // #110). Once per-worker filtering lands, this list can shrink to
    // the actually-used subset (currently empty).
    { worker: names.indexer, secrets: shared },
  ];
};
