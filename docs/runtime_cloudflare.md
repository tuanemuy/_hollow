# Runtime: Cloudflare Workers (D1 + Queues)

Multi-Worker, edge-distributed runtime. The main app runs in the `app` Worker; outbox publish, queue consumption, daily pruning, and DLQ surfacing each ship as a sibling Worker driven by Service Bindings, Queues, and Cron Triggers.

## Table of contents

- [Quick start](#quick-start)
- [Worker matrix](#worker-matrix)
- [Local dev outbox dispatch](#local-dev-outbox-dispatch)
- [Local presigned object flow (dev proxy)](#local-presigned-object-flow-dev-proxy)
- [Wrangler config layout](#wrangler-config-layout)
- [One-time Cloudflare resource creation](#one-time-cloudflare-resource-creation)
- [Secrets and vars](#secrets-and-vars)
- [Deployment](#deployment)
- [D1 migrations](#d1-migrations)
- [Queues](#queues)
- [Cron triggers](#cron-triggers)
- [Retry budget](#retry-budget)
- [D1 transactional model](#d1-transactional-model)

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars         # wrangler-loaded secrets for local dev (gitignored)
pnpm db:migrate                        # apply migrations to the local D1
pnpm dev                               # vite dev backed by workerd (@cloudflare/vite-plugin)
```

`.dev.vars` is auto-loaded by `wrangler dev` (and the workerd-backed `pnpm dev`) and mirrors `wrangler secret put` for production. Non-secret config such as `APP_URL` belongs in the matching `wrangler*.toml` `[vars]`, not in `.dev.vars`.

## Worker matrix

The main app and five sibling Workers ship from a **per-stage `wrangler.<stage>.toml`** as named environments. Each is deployed independently with `wrangler deploy --config wrangler.<stage>.toml --env <role>`, exposed as `pnpm deploy:<stage>:<role>` scripts.

| Worker      | Responsibility                                                                                         | Wrangler env     | Bindings                                                                                                                                          | Trigger                                              |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| App (fetch) | TanStack Start HTTP request handling                                                                   | _(top level)_    | `DB` (D1), `TEMP_FILES` / `OBJECT_STORAGE` (R2), `RELAY` (Service Binding), `ASSETS` — dispatch-side secrets `SECRET_BOX_MASTER_KEY`, `ADMIN_LLM_API_KEY`, `R2_*`; web-only `ADMIN_SETUP_TOKEN` | HTTP                                                 |
| Relay       | Publish outbox rows — Service Binding kick + safety-net cron                                           | `--env relay`    | `DB`, `EVENTS_QUEUE`                                                                                                                              | `fetch` (Service Binding) + 5-minute Cron Trigger    |
| Consumer    | Consume the Queue, dispatch into `runIngestionJob` / `runExportJob` / search & publication note handlers, write projections / idempotency  | `--env consumer` | `DB`, `TEMP_FILES` / `OBJECT_STORAGE` (R2), `RELAY` (Service Binding) — dispatch-side secrets `SECRET_BOX_MASTER_KEY`, `ADMIN_LLM_API_KEY`, `R2_*` | Queue consumer (`events`)                            |
| Indexer     | Drain `index_jobs` rows through `consumeIndexJob` (search-document upsert / delete)                    | `--env indexer`  | `DB`                                                                                                                                              | 5-minute Cron Trigger                                |
| Pruner      | Daily cron that prunes processed outbox rows                                                           | `--env pruner`   | `DB`                                                                                                                                              | Daily Cron Trigger                                   |
| DLQ         | Surface events that exhausted the consumer's retry budget                                              | `--env dlq`      | `DB`                                                                                                                                              | Queue consumer (`events-dlq`)                        |

Trigger model: the request path kicks the relay through the `RELAY` Service Binding right after a UoW commit, so newly-persisted events publish without waiting on cron. The relay also runs on a 5-minute safety-net cron in case the Service Binding path fails. Inside a tick, `processOutboxEvents` drains up to `maxIterations` consecutive batches so a backlog is flushed in one trigger rather than 1 batch per minute.

## Local dev outbox dispatch

`pnpm dev` (Vite + `@cloudflare/vite-plugin`) and `pnpm start` (`wrangler dev` running the Vite build output) boot only the main app Worker. The sibling `relay` / `consumer` / `pruner` / `dlq` Workers and Cloudflare Queues are **not** running, so the default Service Binding → Queue → consumer chain has no producer or consumer attached. To keep UoW-emitted events visible in local dev, the request entry injects `InlineRelayTrigger` (`app/core/adapters/cloudflare/inlineRelayTrigger.ts`) via `RequestServerConfig.relayTriggerOverride` behind a two-stage gate (Issue #66 / #663):

- **DCE gate (build-time):** `import.meta.env?.MODE !== "production"` sits on the left of a top-level short-circuit `&&` in `app/server.cloudflare.ts`. `vite build` inlines `MODE` to `"production"`, so the branch is removed from deploy bundles. This — not the runtime gate — is the "disabled in production" guarantee; verify it with the grep below.
- **Runtime gate:** `resolveInlineRelayGate({ viteDev, flag })` enables the path when `import.meta.env.DEV === true` (`pnpm dev`) **or** `DEV_INLINE_RELAY === "true"` (local `wrangler.toml [vars]` — this is what carries `pnpm start`). Under `pnpm dev` the Vite plugin also supplies the local `[vars]`, so both OR conditions are true; harmless, `viteDev` alone suffices. Never add `DEV_INLINE_RELAY` to `wrangler.staging.toml` / `wrangler.production.toml` — DCE makes it inert today, but keep the intent unambiguous in case the main Worker's build pipeline ever changes.

To enable the inline path under `pnpm start`, build with **`pnpm build:local && pnpm start`**, not plain `pnpm build`. `pnpm build` (`@cloudflare/vite-plugin`) writes `.wrangler/deploy/config.json`, which redirects `wrangler dev` to `dist/server/wrangler.json` → `dist/server/index.js` — i.e. `pnpm start` always runs the Vite build output, never the TS sources. In the production-mode output `MODE` is inlined to `"production"` and the inline path has been dead-code-eliminated, so `DEV_INLINE_RELAY` can never take effect. **Beware: under plain `pnpm build && pnpm start` the var is silently inert** — the path no longer exists in the bundle, so there is no runtime warning; the only symptom is the original Issue #663 behaviour (job-style exports stuck in "待機中"). `pnpm build:local` (`vite build --mode development` with `NODE_ENV=production`) produces an otherwise-equivalent bundle that keeps the inline path. Note also that the redirected config bakes `wrangler.toml [vars]` into `dist/server/wrangler.json` at build time, so after changing any `[vars]` value (e.g. `DEV_INLINE_RELAY`) you must re-run `pnpm build:local` — restarting `pnpm start` alone does not pick the change up. Run the DCE grep (below) against a plain `pnpm build` output only — `build:local` output intentionally retains the path.

Behaviour of the inline path:

- Every UoW commit fires `kick()`, which schedules `processOutboxEvents` against the **same isolate** via `ExecutionContext.waitUntil`. The drain calls `dispatchDomainEvent` directly (no queue, no Service Binding), then `markProcessed` per event, mirroring the production `handleQueue` contract.
- One kick drains **one batch** (`maxIterations: 1`, `batchSize: 25`, `workerId: "inline-dev"`). Secondary events emitted during dispatch are picked up on the next UoW commit's kick. This is intentional — see ADR-002 of Issue #66 for the no-cascade rationale. Note for job-style exports: `runExportJob` saves the job's `completed` / `failed` state directly inside its own UoW, so a bulk export finishes in one kick and polling sees the result; only the secondary outbox events it collects (e.g. `export.completed`) wait under the inner `NoopRelayTrigger` until the next kick.
- Inside the dispatch loop the inner `ConsumerContainer` is built with `env.RELAY` blanked out, so its UoW provider gets `NoopRelayTrigger`. This both avoids recursing into another Service Binding kick and silences "service binding kick failed" log spam when no relay Worker is up.
- Production / staging deploys (`pnpm build` → `wrangler deploy`) take the **unchanged** Service Binding path. The DCE gate removes the entire `InlineRelayTrigger` branch — including the `import` — from the deployed bundle. Verify with `test -d dist/ && grep -rn "InlineRelayTrigger\|inline-dev\|import.meta.env" dist/ && echo "FAIL: residue found" || echo "OK: dead-code eliminated"` after `pnpm build`.
- Behavioural difference vs. production: dev sees projections update with effectively zero latency; production hops through the Queue and pays a few hundred ms per event. Code that assumes synchronous side effects in dev may surprise you when the Queue is in front of the consumer in production.
- The real Queue path (Service Binding → Queue → consumer, with retries / DLQ / latency) is never exercised locally; verify it on staging.

## Local presigned object flow (dev proxy)

ローカル検証（`pnpm build:local && pnpm start` = `wrangler dev`, `http://localhost:8787`）で presigned アップロード/ダウンロードフロー（presign → ブラウザ PUT → finalize → 表示）を E2E 完走させる仕組み（Issue #657）。プロキシ自体は実行時ゲート（`R2_DEV_OBJECT_PROXY`）のみで DCE 対象外のため素の `pnpm build` でも動作するが、ジョブ型エクスポート等 outbox 経由の機能を含めて E2E 完走させる場合は `pnpm build:local` が必須（[Local dev outbox dispatch](#local-dev-outbox-dispatch) 参照）。

仕組み:

- `wrangler.toml [vars]` の `R2_S3_ENDPOINT = "http://localhost:8787/dev/r2"` により、`R2ObjectStorage.presign*` がリモート R2 の S3 エンドポイントではなく **same-origin の dev プロキシルート**へ署名する。same-origin なのでブラウザの CORS preflight は発生しない。
- `R2_DEV_OBJECT_PROXY = "true"` のときだけ、fetch エントリ（`app/server.cloudflare.ts`）が `/dev/r2/<bucket>/<key>` への PUT/GET を `buildDevObjectStorageResponse`（`app/core/adapters/cloudflare/devObjectStorageHandler.ts`）に委譲する。終端はローカル miniflare の `OBJECT_STORAGE` binding なので、finalize の `stat` と同一ストアになる。
- dev プロキシでも SigV4 署名を必ず検証する（`r2PresignVerify.ts`）。不正な署名・期限切れ・Content-Type 不一致は 403。presign と verify が同じクレデンシャルを使うため、**`.dev.vars` の `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` はダミー値で動く**（空文字は不可 — DI が unavailable アダプターに落ちる）。

制約・注意点:

- **staging / production では無効。** `R2_S3_ENDPOINT` / `R2_DEV_OBJECT_PROXY` は `wrangler.toml`（LOCAL DEV ONLY）にのみ定義する。`wrangler.staging.toml` / `wrangler.production.toml` に追加しないこと — 未設定なら presign は従来どおりアカウントスコープの R2 エンドポイントに向き、`/dev/r2/` ルートは不活性。
- **対象は `pnpm build:local && pnpm start`（:8787）のみ。** `pnpm dev`（vite, :3000）はアプリのオリジンが presign 先（:8787 固定）と異なり cross-origin になるため、このフローは完走しない。
- **ブラウザでは必ず `http://localhost:8787` 表記でアクセスすること。** `http://127.0.0.1:8787` で開くと presign URL のオリジン（`localhost`）と食い違い、same-origin 前提が崩れて preflight が復活する／host 署名不一致で 403 になる。
- **検証サーバーは必ずポート 8787 で起動すること**（`wrangler dev` のデフォルト。明示するなら `--port 8787`）。8787 が使用中で wrangler が別ポートにフォールバックすると、presign 先（`R2_S3_ENDPOINT` の :8787）とアプリオリジンが食い違いフローが完走しない。`APP_URL` / `R2_S3_ENDPOINT` のポートと一致させる。
- **dev サーバーを localhost 外に公開してはいけない**（`wrangler dev --ip 0.0.0.0` での LAN 公開や cloudflared 等のトンネル共有を含む）。`.dev.vars.example` の固定ダミー credential は dev プロキシの署名鍵そのものであり、リポジトリにコミットされた既知の値である以上「公開された署名鍵」に等しい — 公開した瞬間、誰でも有効な presigned URL を鋳造でき、ローカルバケットの全 read/write が事実上無認証で開く。やむを得ず公開する場合は `.dev.vars` の `R2_*` を各自のランダム値に差し替えること。
- PUT は Worker 経由になるため `wrangler dev` のリクエストボディ上限内である必要がある。ローカル検証用途（数 MB〜数十 MB）では問題ない。本番（R2 直）とは転送経路が異なる点に注意 — リモート R2 の CORS 挙動そのものは staging で検証する。

## Wrangler config layout

| File                       | Purpose                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `wrangler.toml`            | **Local dev only** — `pnpm dev` / `pnpm build` / `pnpm build:local` discover it via `@cloudflare/vite-plugin` (configured in `vite.config.cloudflare.ts`); `pnpm start` consumes it indirectly through the `[vars]` baked into `dist/server/wrangler.json` at build time, so `[vars]` edits require a rebuild to reach `pnpm start`. Do not deploy from this file. |
| `wrangler.staging.toml`    | Staging deploys (`pnpm deploy:staging*`).                                                                                                  |
| `wrangler.production.toml` | Production deploys (`pnpm deploy:production*`).                                                                                            |

Each stage file is a self-contained mirror of `wrangler.toml` with `-staging` / `-production` suffixed on every Cloudflare resource name (Worker name, D1 `database_name`, queue names) so the two stages never collide inside one Cloudflare account.

**Wrangler env caveat**: top-level `d1_databases` / `vars` / `r2_buckets` / `services` are **not** inherited into named environments. Each `[env.*]` block re-declares them — keep `database_id`, queue names, bucket names, Service Binding targets, and `APP_URL` in sync across every block of every stage config. `pnpm cf:types` (re)generates `worker-configuration.d.ts` from `wrangler.toml` only; this also runs automatically on `postinstall` and `predev`.

**Worker Routes** live in the top-level `routes = [...]` block of each stage's wrangler template (`infra/templates/wrangler.<stage>.toml.tmpl`), not in Pulumi. wrangler applies the Worker code and its routes atomically, which avoids the chicken-and-egg where the route is created before the Worker exists (see Issue #139). The `pattern` and `zone_name` values must stay in sync with `infra/Pulumi.<stage>.yaml` (`hollow:hostname` / `hollow:zoneName`).

Bindings duplicated into `[env.consumer]` so dispatch reaches real adapters (Issue #110):

- `TEMP_FILES` / `OBJECT_STORAGE` (R2) — `runIngestionJob` reads ingestion bytes from `TEMP_FILES`; `runExportJob` writes artifacts to `OBJECT_STORAGE`. Absent → DI installs an inline unavailable adapter that rejects every call with `TempFileStorageUnavailableError` / `StorageUnavailableError` (Issue #100 ADR-001).
- `RELAY` (Service Binding) — when bound, secondary events emitted by the dispatched usecases publish immediately via `ServiceBindingRelayTrigger`; absent → fall back to `NoopRelayTrigger` and the 5-minute relay cron picks them up.
- `R2_OBJECT_BUCKET_NAME` / `ADMIN_LLM_MODEL` (vars) — public configuration that complements the secrets listed below.
- `REQUIRE_SECRET_BOX_KEY` (var) — `"true"` in staging / production (set in both `[vars]` and `[env.consumer.vars]`), unset in local dev (`wrangler.toml`). It marks the stage as key-required so a missing `SECRET_BOX_MASTER_KEY` fails fast at boot. This is a public `[vars]` value, **not** a secret in `workerSecretSpecs()`.

## One-time Cloudflare resource creation

Cloudflare Queues and D1 databases are not auto-created by `wrangler deploy` — create them once per stage before the first remote deployment, otherwise the Workers will fail to deploy.

```bash
# staging
wrangler d1 create tanstack-start-template-d1-staging
wrangler queues create tanstack-start-template-events-staging
wrangler queues create tanstack-start-template-events-dlq-staging
wrangler r2 bucket create tanstack-start-template-temp-files-staging
wrangler r2 bucket create tanstack-start-template-objects-staging

# production
wrangler d1 create tanstack-start-template-d1-production
wrangler queues create tanstack-start-template-events-production
wrangler queues create tanstack-start-template-events-dlq-production
wrangler r2 bucket create tanstack-start-template-temp-files-production
wrangler r2 bucket create tanstack-start-template-objects-production
```

When `infra/` (Pulumi) is used, `pnpm infra:up:<stage>` provisions the D1 database, both queues, both R2 buckets, **and a placeholder AAAA record (`100::`, proxied) at the route hostname** in one step — these `wrangler create` commands are the manual fallback. The placeholder AAAA is required for Cloudflare's proxied edge to engage the Worker route declared in `wrangler.<stage>.toml`; do **not** delete it manually. If the AAAA placeholder is accidentally deleted, run `pnpm infra:up:<stage>` to recreate it. The Worker Route itself is **not** a Pulumi resource — wrangler creates and updates it during `wrangler deploy` from the per-stage `routes = [...]` block.

Paste the `database_id` printed by each `wrangler d1 create` into every `[[d1_databases]]` block of the matching `wrangler.<stage>.toml`. Replace the `[vars] APP_URL` placeholders in each stage file before the first deploy — leaving `https://example.com` breaks `buildHead()`'s canonical / OG image URLs.

After `pnpm infra:up:<stage>`, also create an R2 API token in the Cloudflare dashboard (Dashboard → R2 → "Manage R2 API Tokens", scope: read/write on the `${prefix}-objects` bucket) and populate `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` in `infra/secrets/<stage>.enc.json` (via `pnpm infra:secrets:edit:<stage>`) before the first deploy. The token is the SigV4 credential consumed by `R2ObjectStorage.presign*`; the Worker R2 binding alone is data-plane only and does not cover presign URL minting. Issue a separate token per stage (ADR-005 of Issue #110).

## Secrets and vars

Secrets are scoped per `--config` (and per `--env` for sibling Workers), so set them per stage:

```bash
wrangler secret put MY_SECRET --config wrangler.staging.toml
wrangler secret put MY_SECRET --config wrangler.staging.toml --env relay
wrangler secret put MY_SECRET --config wrangler.production.toml
```

For local dev, drop them into `.dev.vars` (copied from `.dev.vars.example`).

The outbox tuning variables (`OUTBOX_BATCH_SIZE`, `OUTBOX_LEASE_MS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETENTION_MS`) live in `[vars]` (not `.dev.vars`) and are parsed by `app/core/application/di/env.ts`. Unset values fall back to the defaults declared in `app/core/application/workers/`.

The indexer tuning variables (`INDEXER_BATCH_SIZE`, `INDEXER_MAX_BATCHES`) follow the same pattern: declared in `[env.indexer.vars]`, parsed by `readIndexerTuning` (`app/core/application/di/env.ts`), and fall back to the defaults exported from `app/core/application/workers/processIndexJobs.ts` (`DEFAULT_INDEXER_BATCH_SIZE = 50`, `DEFAULT_INDEXER_MAX_BATCHES = 20`).

### Dispatch-side secrets (Issue #110)

Required on the **web** and **consumer** workers for the ingestion / export dispatch paths to wire real adapters:

| Key                       | Purpose                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECRET_BOX_MASTER_KEY`   | Base64-encoded 32-byte AES-256 key for `WebCryptoSecretBox`. Required to decrypt the DB-stored LLM api key. In stages with `REQUIRE_SECRET_BOX_KEY = "true"` (staging / production) it is **mandatory**: unset / empty / dev-placeholder makes the per-request container fail to build at boot → **every route returns 500** (not just `/admin`, because the `SecretBox` is wired into the whole request container). In `dev` (`REQUIRE_SECRET_BOX_KEY` unset) DI falls back to `NullSecretBox` and operations needing decryption fail at call time. Generation & rotation: see [`infra/secrets/README.md`](../infra/secrets/README.md). |
| `SECRET_BOX_MASTER_KEY_PREVIOUS` | **Temporary** outgoing master key, present only during a rotation window (Issue #370). Optional — absent in the common case. When set, the runtime decrypts old-key `apiKeySource='db'` rows via `decryptWithFallback` (current key first, previous key on tag mismatch) so the consumer keeps working mid-rotation and the admin re-encryption usecase can read old-key rows. **Not** part of `workerSecretSpecs()` (it would break `checkSecrets`); put it manually with `wrangler secret put` on **both** the web and consumer workers during rotation, then delete it. See [`infra/secrets/README.md`](../infra/secrets/README.md) → "Rotating the master key". |
| `ADMIN_LLM_API_KEY`       | Env override for the Anthropic api key. **LLM adapter wire condition**: DI wires `AnthropicLLMProvider` only when this **and** `ADMIN_LLM_MODEL` (the `[vars]` entry, public) are **both** present. Either one missing → DI keeps `StubLLMProvider`. At this stage the DB-stored ciphertext is not consulted at dispatch time — the dynamic-resolution layer ships in a follow-up Issue. |
| `R2_ACCOUNT_ID`           | Cloudflare account id (also visible in dashboard URL). Used by `R2ObjectStorage` SigV4 presign path.                                                                                                                                                                                                                                                          |
| `R2_ACCESS_KEY_ID`        | R2 API token access key id. Issue via Cloudflare dashboard → R2 → "Manage R2 API Tokens"; scope read/write to the `objects` bucket only and **issue a separate token per stage** (ADR-005, Issue #110).                                                                                                                                                       |
| `R2_SECRET_ACCESS_KEY`    | The matching secret key. Both `R2_*` keys plus `OBJECT_STORAGE` binding plus `R2_OBJECT_BUCKET_NAME` var (`[vars]`) must all be present for DI to wire `R2ObjectStorage`. Any missing → DI falls back to an inline unavailable adapter that rejects every call with `StorageUnavailableError` (Issue #100 ADR-001).                                                                                                                                                                                                                                                                            |

> The CI **`Inject secrets` step** in `.github/workflows/deploy-{staging,production}.yml` (not `pnpm deploy:<stage>:all`, which only builds and `wrangler deploy`s) decrypts `infra/secrets/<stage>.enc.json` via `sops`, runs `pnpm infra:check-secrets:<stage>` to fail-loud on any spec-vs-decrypted-JSON drift (Issue #203), strips `^_`-prefixed documentation-only keys via `jq`, and finally calls `wrangler secret bulk` against every Worker — web, relay, consumer, indexer, pruner, dlq. ADR-007 (Issue #110) deferred per-worker filtering — until that lands, relay / pruner / dlq / indexer receive these secrets even though they do not consume them. `workerSecretSpecs()` in `infra/src/secrets.ts` is the spec source-of-truth for what each Worker actually needs.

### Web-only secrets

In addition to the dispatch-side secrets above, the **web** worker needs:

| Key                  | Purpose                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_SETUP_TOKEN`  | Optional bearer that gates `AdminSignUp` (admin-bootstrap flow). Generate with `openssl rand -hex 32`. Unset → `AdminSignUp` surfaces `AuthenticationError("setup_token_disabled")`. Consumer/relay/pruner/dlq do not consume this token. |

### Local dev (R2 / LLM bindings)

`pnpm dev` always provisions the `TEMP_FILES` / `OBJECT_STORAGE` R2 bindings via miniflare's in-memory R2 simulator. The bindings exist even when `.dev.vars` is empty:

- Leaving `R2_*` empty → DI falls back to an inline unavailable `ObjectStorage` adapter (presign / put / get all reject with `StorageUnavailableError`). The `TEMP_FILES` binding itself still works because data-plane R2 ops do not consult the SigV4 credentials. With the local presigned-flow proxy (see [Local presigned object flow](#local-presigned-object-flow-dev-proxy)) dummy non-empty `R2_*` values are sufficient — no real Cloudflare token is needed for local dev.
- Leaving `ADMIN_LLM_API_KEY` empty (or omitting `ADMIN_LLM_MODEL` in `wrangler.toml [vars]`) → DI keeps `StubLLMProvider`. Ingestion jobs fail at the metadata step with `BusinessRuleError("unsupported_format")` so the failure mode is observable.
- Setting the full set → DI wires the real adapters. Hitting Anthropic from local dev incurs real cost — issue a low-quota api key for development.

### Deployment SOPS workflow

`infra/secrets/{stage}.enc.json` is SOPS-encrypted; the CI `Inject secrets` step decrypts it, validates it against `workerSecretSpecs()`, strips `^_`-prefixed documentation keys, and feeds the rest to `wrangler secret bulk` against every Worker. To add or remove a key, follow the canonical procedures in [`infra/secrets/README.md`](../infra/secrets/README.md) (and the Japanese mirror in [`docs/deployment_setup.md`](deployment_setup.md)). The short version:

1. Update `workerSecretSpecs()` in `infra/src/secrets.ts` (single source of truth for what each Worker requires).
2. Edit both encrypted files: `pnpm infra:secrets:edit:staging` / `pnpm infra:secrets:edit:production`.
3. Mirror the change in `infra/secrets/{stage}.json.example` and `.dev.vars.example`.
4. Verify spec ↔ JSON sync locally:
   ```sh
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-staging.txt \
     sops -d infra/secrets/staging.enc.json > /tmp/d.json
   pnpm infra:check-secrets:staging -- /tmp/d.json
   rm /tmp/d.json
   ```
   Repeat for production. CI runs the same check before bulk-push and fails the deploy if missing / extra keys are detected (Issue #203).
5. Commit only `infra/src/secrets.ts`, the two `.json.example` updates, the two `.enc.json` updates, and any `.dev.vars.example` change. Never commit decrypted plaintext.

## Deployment

**Production releases are driven by release-please → CI, not by these scripts.** Merging the release PR pushes a `vX.Y.Z` tag that triggers `Deploy (production)` (Pulumi up → render → build → D1 migrations → secret validation → Deploy Workers → secret injection), gated by the `production` Environment approval. Staging deploys automatically on every `main` push via `Deploy (staging)`. See [`deployment_setup.md`](deployment_setup.md) for the release flow and the repository prerequisites (`RELEASE_PLEASE_TOKEN`, squash-only merge, `v*.*.*` branch policy).

The `pnpm deploy:*` scripts below are **manual / emergency Worker-code pushes only** — they run `vite build` + `wrangler deploy` and do **not** run Pulumi, D1 migrations, or secret injection (only the CI pipeline does). Reach for them to hot-push a single Worker when CI is unavailable; otherwise use the release flow above.

```bash
# staging
pnpm deploy:staging                  # app only
pnpm deploy:staging:relay
pnpm deploy:staging:consumer
pnpm deploy:staging:indexer
pnpm deploy:staging:pruner
pnpm deploy:staging:dlq
pnpm deploy:staging:all              # all of the above
pnpm deploy:staging:all:dry          # dry run

# production
pnpm deploy:production               # app only
pnpm deploy:production:relay
pnpm deploy:production:consumer
pnpm deploy:production:indexer
pnpm deploy:production:pruner
pnpm deploy:production:dlq
pnpm deploy:production:all           # all of the above
pnpm deploy:production:all:dry       # dry run
```

### Deployment ordering (Issue #145)

When the consumer's note.* / publication.* dispatch routing changes (or any other change that produces `index_jobs` rows under a new path), prefer this order so the producer side never runs without a matching drainer:

1. **consumer** — picks up the new dispatch routing and starts enqueueing `index_jobs` rows.
2. **indexer** — must be deployed before the consumer accumulates a backlog; otherwise rows sit in `index_jobs` until the next deploy.
3. **relay** — re-deploy if the relay-visible event schema changed.
4. **app** — last, so any new UoW-emitted events have somewhere to land.

The reverse ordering is not destructive (indexer deployed late just means a brief delay; rows are picked up on its next cron tick), but the explicit order matches the "producer-then-consumer-then-app" recovery flow and avoids surprising the operator.

### First-deploy custom-domain bootstrap (Issue #700)

`Pulumi up` binds the `WorkersCustomDomain` (`infra/src/dns.ts`) to the web Worker, but it runs **before** `Deploy Workers` creates that Worker. On a brand-new environment the bind 404s with `code 10007 "This Worker does not exist on your account."`, and because the pipeline aborts at `Pulumi up`, the Worker is never created — so a plain re-run fails identically.

The `hollow:manageCustomDomain` Pulumi config (default `true`) gates the binding. Bootstrap a fresh environment once:

1. Set the flag off so Pulumi skips the custom domain:
   ```sh
   pulumi -C infra config set manageCustomDomain false --stack <stage>
   # or add `hollow:manageCustomDomain: "false"` to infra/Pulumi.<stage>.yaml
   ```
2. Run the deploy (tag push, or `Actions → Deploy (production) → Run workflow`). Pulumi provisions D1/Queues/R2 and `Deploy Workers` creates the web Worker.
3. Set the flag back on:
   ```sh
   pulumi -C infra config set manageCustomDomain true --stack <stage>
   ```
4. Run the deploy again. The Worker now exists, so the custom domain attaches.

Steady-state operation keeps the flag `true`; the binding is a no-op once it exists. Existing environments that already have the domain bound need no action.

### DLQ rows in `index_jobs`

`consumeIndexJob` marks a row as DLQ when `attempts >= CONSUME_INDEX_JOB_MAX_ATTEMPTS` (3). The queue-less drainer design means dlq rows stay in the `index_jobs` table — they are filtered out of subsequent `nextBatch` calls by the `attempts < maxAttempts` guard (Issue #145 ADR-006), so they never re-enter the dispatch loop on their own.

Recovery is operator-driven:

`<d1-database-name>` below is the Pulumi-generated `${appName}-${stage}-d1` (e.g. `hollow-staging-d1`); confirm with `pulumi stack output` if unsure.

```bash
# Inspect dlq rows
pnpm wrangler d1 execute <d1-database-name> --remote --config wrangler.<stage>.toml \
  --command "SELECT id, note_id, op, attempts, last_error FROM index_jobs WHERE attempts >= 3 ORDER BY enqueued_at DESC LIMIT 50;"

# Re-drive after the upstream cause is fixed (clears the dlq filter on next tick)
pnpm wrangler d1 execute <d1-database-name> --remote --config wrangler.<stage>.toml \
  --command "UPDATE index_jobs SET attempts = 0, last_error = NULL WHERE id = '<id>';"
```

The admin UI's `AdminSettings.RebuildSearchIndex` is the broader recovery path — it rebuilds `search_documents` from upstream Note aggregates and is idempotent with the event-driven updates.

## D1 migrations

The canonical SQL lives under `app/core/adapters/d1/migrations/`. Generate it with `pnpm db:generate` from `app/core/adapters/d1/schema.ts`.

Search index rebuilds have two distinct paths: the migration-bundled `INSERT … SELECT FROM search_documents` rebuild covers schema-change repopulation (host table is the source), while the admin-facing `AdminSettings.RebuildSearchIndex` operation (admin route at `/admin/jobs`) rebuilds the host table itself from upstream Note aggregates when `search_documents` is stale or corrupt — see `.issue/93/adr.md` ADR-001.

```bash
pnpm db:migrate                        # alias of db:apply:local
pnpm db:apply:local                    # apply to the local D1
pnpm db:apply:staging                  # apply to the staging D1
pnpm db:apply:production               # apply to the production D1
pnpm db:execute:local --file=...       # run an arbitrary SQL file locally
pnpm db:execute:staging --file=...     # run an arbitrary SQL file against staging
pnpm db:execute:production --file=...  # run an arbitrary SQL file against production
```

## Queues

Two queues per stage:

- `events` — the main event stream produced by the relay and consumed by the consumer Worker.
- `events-dlq` — receives messages that the consumer's `1 + max_retries` budget could not deliver.

Queue parameters (`max_retries`, `max_batch_size`, `max_batch_timeout`, `max_concurrency`, `retry_delay`) live in the `[[queues.consumers]]` blocks of the per-stage `wrangler.<stage>.toml`. Adjust them per stage and re-deploy the consumer / DLQ Workers to pick up the new settings.

### Push consumer redelivery semantics (Issue #182)

The consumer is a **push** (Worker) consumer, not a pull consumer. This matters for reasoning about redelivery:

- **`visibility_timeout_ms` does not apply.** It is a *pull*-consumer parameter (default 12h there) and is not a valid key in a push `[[queues.consumers]]` block. There is no per-batch visibility timeout that redelivers messages mid-flight while the Worker is still running.
- A push consumer invocation is bounded by **15 min wall-clock** and **30s CPU time** (CPU excludes I/O / network wait; raise it up to 5 min with `limits.cpu_ms` if a handler is genuinely CPU-bound). Exceeding either limit fails the invocation and retries the batch.
- `handleQueue` calls `message.ack()` / `message.retry()` **per message**, so a slow or failing event does not drag already-acked siblings into a whole-batch redelivery. The residual risk is only an invocation-wide kill (CPU / wall limit), which discards the un-committed acks and retries everything.

The `user.deleted` fan-out (`publication → export`) iterates every public note + in-flight export job of the deleted user, so its latency scales with the user's footprint. The dispatcher emits a `[dispatch] user.deleted fan-out complete` log with a structured `durationMs` (wall-clock) so an operator can watch — via tail / Logpush — how close a heavy user gets to those ceilings. `durationMs` measures wall-clock, not CPU; pair it with the platform `cpuTime` metric to tell a CPU-bound case (raise `limits.cpu_ms`) from an I/O-bound one (handler optimization / fan-out decomposition). See `.issue/182/adr.md`.

## Cron triggers

Three cron triggers ship in `wrangler.<stage>.toml`:

| Worker  | Schedule       | Purpose                                                              |
| ------- | -------------- | -------------------------------------------------------------------- |
| Relay   | every 5 min    | Safety-net publish loop — kicks in when the Service Binding fails.   |
| Indexer | every 5 min    | Drains `index_jobs` rows produced by note.* / publication.* dispatch.|
| Pruner  | daily          | Deletes processed (and not-quarantined) outbox rows beyond retention. |

## Retry budget

A message reaches the DLQ only after **both** retry budgets are exhausted:

| Budget                        | Default | Source                                                   |
| ----------------------------- | ------- | -------------------------------------------------------- |
| Relay publish attempts        | 2       | `DEFAULT_MAX_ATTEMPTS` / `OUTBOX_MAX_ATTEMPTS` var       |
| Consumer subscriber attempts  | 4       | `1 + max_retries` from the `[[queues.consumers]]` block   |

The user-visible attempt count is the **product** of those numbers (max 8 by default), so adjust them together when tuning. Once the relay budget is exhausted on a row, `processOutboxEvents` stamps `failed_at`, and the row stays out of the queue until manually re-driven.

## D1 transactional model

D1 cannot run an interactive transaction inside a Worker invocation: the only atomic primitive is `db.batch`. The UoW pre-collects statements into a `PendingBatch` and flushes them in one batch on commit. Driver errors are parsed from message strings into the shared error contracts (OCC violations, FK failures, etc.) at the adapter boundary. The observable semantics — OCC failures, FK enforcement, and the at-least-once outbox dispatch — are produced at the application layer regardless of the driver underneath.
