# Runtime: Cloudflare Workers (D1 + Queues)

Multi-Worker, edge-distributed runtime. The main app runs in the `app` Worker; outbox publish, queue consumption, daily pruning, and DLQ surfacing each ship as a sibling Worker driven by Service Bindings, Queues, and Cron Triggers.

## Table of contents

- [Quick start](#quick-start)
- [Worker matrix](#worker-matrix)
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

The main app and four sibling Workers ship from a **per-stage `wrangler.<stage>.toml`** as named environments. Each is deployed independently with `wrangler deploy --config wrangler.<stage>.toml --env <role>`, exposed as `pnpm deploy:<stage>:<role>` scripts.

| Worker      | Responsibility                                                                                         | Wrangler env     | Bindings                                                                                                                                          | Trigger                                              |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| App (fetch) | TanStack Start HTTP request handling                                                                   | _(top level)_    | `DB` (D1), `TEMP_FILES` / `OBJECT_STORAGE` (R2), `RELAY` (Service Binding), `ASSETS`                                                              | HTTP                                                 |
| Relay       | Publish outbox rows — Service Binding kick + safety-net cron                                           | `--env relay`    | `DB`, `EVENTS_QUEUE`                                                                                                                              | `fetch` (Service Binding) + 5-minute Cron Trigger    |
| Consumer    | Consume the Queue, dispatch into `runIngestionJob` / `runExportJob`, write projections / idempotency  | `--env consumer` | `DB`, `TEMP_FILES` / `OBJECT_STORAGE` (R2), `RELAY` (Service Binding) — dispatch-side secrets `SECRET_BOX_MASTER_KEY`, `ADMIN_LLM_API_KEY`, `R2_*` | Queue consumer (`events`)                            |
| Pruner      | Daily cron that prunes processed outbox rows                                                           | `--env pruner`   | `DB`                                                                                                                                              | Daily Cron Trigger                                   |
| DLQ         | Surface events that exhausted the consumer's retry budget                                              | `--env dlq`      | `DB`                                                                                                                                              | Queue consumer (`events-dlq`)                        |

Trigger model: the request path kicks the relay through the `RELAY` Service Binding right after a UoW commit, so newly-persisted events publish without waiting on cron. The relay also runs on a 5-minute safety-net cron in case the Service Binding path fails. Inside a tick, `processOutboxEvents` drains up to `maxIterations` consecutive batches so a backlog is flushed in one trigger rather than 1 batch per minute.

## Wrangler config layout

| File                       | Purpose                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `wrangler.toml`            | **Local dev only** — `pnpm dev` / `pnpm build` discover it via `@cloudflare/vite-plugin` (configured in `vite.config.cloudflare.ts`). Do not deploy from this file. |
| `wrangler.staging.toml`    | Staging deploys (`pnpm deploy:staging*`).                                                                                                  |
| `wrangler.production.toml` | Production deploys (`pnpm deploy:production*`).                                                                                            |

Each stage file is a self-contained mirror of `wrangler.toml` with `-staging` / `-production` suffixed on every Cloudflare resource name (Worker name, D1 `database_name`, queue names) so the two stages never collide inside one Cloudflare account.

**Wrangler env caveat**: top-level `d1_databases` / `vars` / `r2_buckets` / `services` are **not** inherited into named environments. Each `[env.*]` block re-declares them — keep `database_id`, queue names, bucket names, Service Binding targets, and `APP_URL` in sync across every block of every stage config. `pnpm cf:types` (re)generates `worker-configuration.d.ts` from `wrangler.toml` only; this also runs automatically on `postinstall` and `predev`.

Bindings duplicated into `[env.consumer]` so dispatch reaches real adapters (Issue #110):

- `TEMP_FILES` / `OBJECT_STORAGE` (R2) — `runIngestionJob` reads ingestion bytes from `TEMP_FILES`; `runExportJob` writes artifacts to `OBJECT_STORAGE`. Absent → DI falls back to `Stub*Storage` which throws `*UnavailableError` on call.
- `RELAY` (Service Binding) — when bound, secondary events emitted by the dispatched usecases publish immediately via `ServiceBindingRelayTrigger`; absent → fall back to `NoopRelayTrigger` and the 5-minute relay cron picks them up.
- `R2_OBJECT_BUCKET_NAME` / `ADMIN_LLM_MODEL` (vars) — public configuration that complements the secrets listed below.

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

When `infra/` (Pulumi) is used, `pnpm infra:up:<stage>` provisions the D1 database, both queues, and both R2 buckets in one step — these `wrangler create` commands are the manual fallback.

Paste the `database_id` printed by each `wrangler d1 create` into every `[[d1_databases]]` block of the matching `wrangler.<stage>.toml`. Replace the `[vars] APP_URL` placeholders in each stage file before the first deploy — leaving `https://example.com` breaks `buildHead()`'s canonical / OG image URLs.

## Secrets and vars

Secrets are scoped per `--config` (and per `--env` for sibling Workers), so set them per stage:

```bash
wrangler secret put MY_SECRET --config wrangler.staging.toml
wrangler secret put MY_SECRET --config wrangler.staging.toml --env relay
wrangler secret put MY_SECRET --config wrangler.production.toml
```

For local dev, drop them into `.dev.vars` (copied from `.dev.vars.example`).

The outbox tuning variables (`OUTBOX_BATCH_SIZE`, `OUTBOX_LEASE_MS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETENTION_MS`) live in `[vars]` (not `.dev.vars`) and are parsed by `app/core/application/di/env.ts`. Unset values fall back to the defaults declared in `app/core/application/workers/`.

### Dispatch-side secrets (Issue #110)

Required on the **web** and **consumer** workers for the ingestion / export dispatch paths to wire real adapters:

| Key                       | Purpose                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECRET_BOX_MASTER_KEY`   | Base64-encoded 32-byte AES-256 key for `WebCryptoSecretBox`. Required to decrypt the DB-stored LLM api key. Generate with `openssl rand -base64 32` **per stage** — sharing keys between staging and production makes encrypted DB rows interchangeable. Unset → DI falls back to `NullSecretBox` and operations needing decryption fail at call time.        |
| `ADMIN_LLM_API_KEY`       | Env override for the Anthropic api key. **LLM adapter wire condition**: DI wires `AnthropicLLMProvider` only when this **and** `ADMIN_LLM_MODEL` (the `[vars]` entry, public) are **both** present. Either one missing → DI keeps `StubLLMProvider`. At this stage the DB-stored ciphertext is not consulted at dispatch time — the dynamic-resolution layer ships in a follow-up Issue. |
| `R2_ACCOUNT_ID`           | Cloudflare account id (also visible in dashboard URL). Used by `R2ObjectStorage` SigV4 presign path.                                                                                                                                                                                                                                                          |
| `R2_ACCESS_KEY_ID`        | R2 API token access key id. Issue via Cloudflare dashboard → R2 → "Manage R2 API Tokens"; scope read/write to the `objects` bucket only and **issue a separate token per stage** (ADR-005, Issue #110).                                                                                                                                                       |
| `R2_SECRET_ACCESS_KEY`    | The matching secret key. Both `R2_*` keys plus `OBJECT_STORAGE` binding plus `R2_OBJECT_BUCKET_NAME` var (`[vars]`) must all be present for DI to wire `R2ObjectStorage`. Any missing → `StubObjectStorage`.                                                                                                                                                  |

> The CI deploy step (`pnpm deploy:<stage>:all`) currently pushes the single SOPS-decrypted secrets file to every Worker (`wrangler secret bulk`). ADR-007 (Issue #110) deferred per-worker filtering — until that lands, relay / pruner / dlq receive these secrets even though they do not consume them. `workerSecretSpecs()` in `infra/src/secrets.ts` is the spec source-of-truth for what each Worker actually needs.

### Local dev (R2 / LLM bindings)

`pnpm dev` always provisions the `TEMP_FILES` / `OBJECT_STORAGE` R2 bindings via miniflare's in-memory R2 simulator. The bindings exist even when `.dev.vars` is empty:

- Leaving `R2_*` empty → DI keeps `StubObjectStorage` (presign / put / get all reject). The `TEMP_FILES` binding itself still works because data-plane R2 ops do not consult the SigV4 credentials.
- Leaving `ADMIN_LLM_API_KEY` empty (or omitting `ADMIN_LLM_MODEL` in `wrangler.toml [vars]`) → DI keeps `StubLLMProvider`. Ingestion jobs fail at the metadata step with `BusinessRuleError("unsupported_format")` so the failure mode is observable.
- Setting the full set → DI wires the real adapters. Hitting Anthropic from local dev incurs real cost — issue a low-quota api key for development.

### Deployment SOPS workflow

`infra/secrets/{stage}.enc.json` is SOPS-encrypted; the CI deploy step decrypts it and feeds it to `wrangler secret bulk`. To add a new key:

1. Update `infra/secrets/{stage}.json.example` with the placeholder.
2. Update `infra/src/secrets.ts` so `workerSecretSpecs()` lists the new key for the relevant workers.
3. Manually edit the encrypted file: `pnpm --filter @hollow/infra secrets:edit:{stage}` (opens `sops` in your editor).
4. Commit only the `.json.example` change and the `.enc.json` change. Never commit the plaintext.

## Deployment

```bash
# staging
pnpm deploy:staging                  # app only
pnpm deploy:staging:relay
pnpm deploy:staging:consumer
pnpm deploy:staging:pruner
pnpm deploy:staging:dlq
pnpm deploy:staging:all              # all of the above
pnpm deploy:staging:all:dry          # dry run

# production
pnpm deploy:production               # app only
pnpm deploy:production:relay
pnpm deploy:production:consumer
pnpm deploy:production:pruner
pnpm deploy:production:dlq
pnpm deploy:production:all           # all of the above
pnpm deploy:production:all:dry       # dry run
```

## D1 migrations

The canonical SQL lives under `app/core/adapters/d1/migrations/`. Generate it with `pnpm db:generate` from `app/core/adapters/d1/schema.ts`.

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

Queue parameters (visibility timeout, `max_retries`, `max_batch_size`, `max_batch_timeout`) live in the `[[queues.consumers]]` blocks of the per-stage `wrangler.<stage>.toml`. Adjust them per stage and re-deploy the consumer / DLQ Workers to pick up the new settings.

## Cron triggers

Two cron triggers ship in `wrangler.<stage>.toml`:

| Worker  | Schedule       | Purpose                                                              |
| ------- | -------------- | -------------------------------------------------------------------- |
| Relay   | every 5 min    | Safety-net publish loop — kicks in when the Service Binding fails.   |
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
