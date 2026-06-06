# hollow

hollow is a quiet, personal text archive — save, organize, and selectively publish your notes — built with **TanStack Start + React 19 (RSC)** on a **DDD / Hexagonal architecture** foundation, targeting **Cloudflare Workers + D1 + Queues**.

The codebase leans on:

- file-based routing and server components as the default data-fetching path,
- a strict inward dependency flow (`domain → application → adapters → presentation`),
- side effects pushed to the boundary via port / adapter separation,
- structured, layer-tagged error serialization across the stack.

## Features

- **TanStack Start + React 19 / RSC** — File-based routing (TanStack Router), server components as the default for data fetching, mutations driven through server functions, React 19 primitives on the client.
- **Hexagonal architecture + DDD** — Enforces a one-way dependency flow `domain → application → adapters → presentation`. Side effects are confined to the boundary via port / adapter separation.
- **Drizzle ORM + D1 (SQLite dialect)** — Schema, migrations, and repositories share a single Drizzle definition. Adapter classes translate driver-specific errors into the shared error contracts.
- **Outbox pattern** — Domain events are persisted in the same transaction as aggregate writes, then a relay publishes them to consumers. At-least-once delivery, no ordering guarantees, idempotency is the subscriber's responsibility.
- **TypeScript / Biome / Vitest / fast-check** — Type checking with `tsgo`, lint and format via Biome, two-tier Vitest setup (unit / integration).
- **Structured error serialization** — Each layer carries its own `kind`-tagged serialized form; presentation composes the union structurally. HTTP status mapping lives only in presentation.

## Directory layout

```
app/
├─ core/
│  ├─ domain/         # entities, value objects, port interfaces, domain events
│  ├─ application/    # use cases, UoW, cross-cutting ports (clock / id / logger), DTO projection
│  ├─ adapters/       # concrete port implementations (DB, workers, external services)
│  └─ presentation/   # server-function entry, error responses, input validation
├─ routes/            # TanStack Router (file-based)
├─ components/
├─ styles/
├─ lib/               # structural primitives shared by every layer (e.g. CodedError)
├─ worker/            # background-worker entries (relay / consumer / pruner / dlq)
└─ server.cloudflare.ts  # server fetch entry
docs/                 # implementation pattern examples + runtime guide
spec/                 # entry point for the /spec workflow
```

For the deeper rationale, see [`CLAUDE.md`](CLAUDE.md), [`docs/backend_implementation_example.md`](docs/backend_implementation_example.md), and [`docs/frontend_implementation_example.md`](docs/frontend_implementation_example.md).

## Runtime

Cloudflare Workers + D1 + Queues. Operational guidance lives in [`docs/runtime_cloudflare.md`](docs/runtime_cloudflare.md).

To target a different runtime (AWS Lambda, Cloud Run, Bun, etc.), add a new adapter group under `app/core/adapters/{provider}/` and a paired entry point — the inward layers stay put.

## Requirements

- Node.js (the `flake.nix` / `.envrc` direnv environment is recommended)
- pnpm
- A Cloudflare account + authenticated `wrangler`

## Quick Start

```bash
pnpm install
cp .dev.vars.example .dev.vars     # add any secrets your app needs
pnpm db:migrate                    # apply SQL migrations to local D1
pnpm dev                           # vite dev (workerd) on http://localhost:3000
```

`.dev.vars.example` ships with a valid base64 32-byte placeholder for
`SECRET_BOX_MASTER_KEY` so that admin flows depending on at-rest
encryption (e.g. saving an LLM api key from `/admin/llm` with
`apiKeySource = 'db'`) work out of the box. To use your own local-only
value, regenerate it with `openssl rand -base64 32` and replace the line
in `.dev.vars`. Never reuse the shipped placeholder outside local
development — staging and production keys MUST be provisioned via
`wrangler secret` (see [`infra/secrets/README.md`](infra/secrets/README.md)).
Note: as of this commit, `SECRET_BOX_MASTER_KEY` is not yet wired into
`infra/src/secrets.ts` (`workerSecretSpecs`); production rollout is
tracked in issue #102.

For a production build:

```bash
pnpm build
pnpm start                         # wrangler dev against the built worker
```

## Development commands

```bash
pnpm dev                         # vite dev (workerd via @cloudflare/vite-plugin)
pnpm build                       # vite build
pnpm start                       # wrangler dev
pnpm preview                     # vite preview

pnpm typecheck                   # tsgo (@typescript/native-preview)
pnpm lint                        # Biome lint
pnpm lint:fix                    # Biome check --write
pnpm format                      # Biome format --write
pnpm format:check

pnpm test                        # unit + integration
pnpm test:unit                   # Vitest (unit)
pnpm test:integration            # integration suites (Miniflare)
```

Recommended routine after changes:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

## Database migrations

```bash
pnpm db:generate                 # generate SQL from the Drizzle schema
pnpm db:migrate                  # wrangler d1 migrations apply (local D1)
pnpm db:apply:staging            # apply to staging D1
pnpm db:apply:production         # apply to production D1
```

For per-stage D1 migration management, see [`docs/runtime_cloudflare.md`](docs/runtime_cloudflare.md).

## Deployment

Cloudflare infrastructure (D1 / Queues / DNS / Worker Routes) is managed by Pulumi under [`infra/`](infra/); Worker scripts themselves are deployed by Wrangler from GitHub Actions. The split exists because Wrangler needs a build artifact to push, while everything Workers depend on is plain configuration.

| Branch / tag | Workflow                                | Target                          |
|--------------|-----------------------------------------|---------------------------------|
| push `main`  | `.github/workflows/deploy-staging.yml`  | `https://staging.hollow.maku-ja.com` |
| tag `v*.*.*` | `.github/workflows/deploy-production.yml` (manual approval via `production` Environment) | `https://hollow.maku-ja.com` |

### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN` — scopes: Workers Scripts:Edit, D1:Edit, Queues:Edit, Zone:Edit, Workers Routes:Edit
- `CLOUDFLARE_ACCOUNT_ID`
- `PULUMI_ACCESS_TOKEN`
- `PULUMI_CONFIG_PASSPHRASE` (only if any stack config uses `--secret`)
- `SOPS_AGE_KEY` — per-stage age private key, set as an Environment Secret on the `staging` / `production` Environment (see [`infra/secrets/README.md`](infra/secrets/README.md))

運用詳細は [`docs/deployment_setup.md`](docs/deployment_setup.md) を参照。

### Release flow

```sh
# bump version, create a tag, push it
pnpm version patch         # or minor / major
git push --follow-tags
```

The tag push triggers `deploy-production.yml`. GitHub waits for required-reviewer approval, then deploys and creates a GitHub Release with auto-generated notes.

### Local infra commands

```sh
pnpm infra:preview:staging       # pulumi preview --stack staging
pnpm infra:up:staging            # pulumi up --stack staging
pnpm infra:render:staging        # render wrangler.staging.toml from Pulumi outputs
```

The generated `wrangler.{staging,production}.toml` files are git-ignored; sources of truth are the templates in [`infra/templates/`](infra/templates/) and the Pulumi stack outputs.

### Secrets workflow

See [`infra/secrets/README.md`](infra/secrets/README.md) for adding / rotating secrets and onboarding teammates. The required keys are declared in [`infra/src/secrets.ts`](infra/src/secrets.ts).

## License

Undecided (private).
