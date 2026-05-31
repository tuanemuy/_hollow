# infra/secrets

SOPS-encrypted secrets injected into Cloudflare Workers at deploy time.

## Files

- `staging.json.example` / `production.json.example` — plaintext templates
  showing the required key set. Tracked.
- `staging.enc.json` / `production.enc.json` — SOPS-encrypted live secrets.
  Tracked. Generated from the examples.
- Anything else here is git-ignored.

The required key set is the union of `workerSecretSpecs()` in
[`infra/src/secrets.ts`](../src/secrets.ts). CI runs
`pnpm infra:check-secrets:<stage> -- <decrypted-path>` before
`wrangler secret bulk` so any drift between the spec and the encrypted
JSON fails the deploy loudly: a **missing** key (spec has it, JSON does
not) and an **extra** key (JSON has it, spec does not) both block the
secret push step. Run the same command locally before committing a
secret update to catch drift before CI does.

## `^_` documentation keys

Keys starting with `_` in `*.json.example` / `*.enc.json` are
documentation-only. The CI `jq` filter strips them before bulk-push and
`checkSecrets.ts` ignores them when comparing the key set, so they
never appear as Cloudflare Worker secrets. Use them freely for inline
explanations of the surrounding entries.

## First-time setup

1. Install [age](https://github.com/FiloSottile/age) and
   [sops](https://github.com/getsops/sops).
2. Generate one age key per stage:
   ```sh
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/hollow-staging.txt
   age-keygen -o ~/.config/sops/age/hollow-production.txt
   ```
3. Send each `age1...` *public* key (printed to stdout above; never the
   private key) to the repo maintainer. They append them to `.sops.yaml`
   and re-key existing files.
4. Confirm decryption works:
   ```sh
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-staging.txt \
     sops -d infra/secrets/staging.enc.json
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-production.txt \
     sops -d infra/secrets/production.enc.json
   ```

## Adding a secret

1. Add the key name to the appropriate array (`shared` / `dispatchExtras`)
   in `workerSecretSpecs()` (`infra/src/secrets.ts`).
2. Add the value to both encrypted files:
   ```sh
   sops infra/secrets/staging.enc.json
   sops infra/secrets/production.enc.json
   ```
   `sops` opens the file in `$EDITOR` decrypted; on save it re-encrypts
   in place.
3. Mirror the addition in `staging.json.example` / `production.json.example`
   so the template documents the new required key.
4. Add the key (with a local-dev value) to `.dev.vars.example` so local
   `wrangler dev` runs do not fall back silently.
5. Verify the spec ↔ JSON are in sync before committing:
   ```sh
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-staging.txt \
     sops -d infra/secrets/staging.enc.json > /tmp/decrypted.json
   pnpm infra:check-secrets:staging -- /tmp/decrypted.json
   rm /tmp/decrypted.json
   ```
   Repeat for production with `hollow-production.txt`. Both must report
   `✓ secrets check passed`.
6. Commit the diff.

## Rotating an existing secret

```sh
# Edit in place — SOPS handles re-encryption automatically.
sops infra/secrets/staging.enc.json
```

`sops` opens the file in `$EDITOR` decrypted; on save it re-encrypts in
place. Key set is unchanged so `checkSecrets.ts` is not required for
rotations, but running it never hurts. Commit the resulting diff.

## SecretBox master key (`SECRET_BOX_MASTER_KEY`)

This secret needs handling beyond the generic flows above because the runtime
**fails fast** when it is missing in a key-required stage (see below). It is the
symmetric master key the `SecretBox` adapter uses to encrypt / decrypt
credentials stored in the DB (`apiKeySource='db'` rows).

### Generating the master key

The key is 32 random bytes, base64-encoded. Generate it with either:

```sh
# OpenSSL
openssl rand -base64 32
```

```sh
# Web Crypto (same getRandomValues the Worker / browser runtime uses)
node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
```

Use a **separate key per stage** — never share one between staging and
production. A shared key would make ciphertext DB rows interoperable across
stages, defeating stage isolation.

### Setting it for production / staging

Two equivalent paths:

```sh
# One-off: set the secret directly on the Worker
wrangler secret put SECRET_BOX_MASTER_KEY --config wrangler.production.toml
# (use wrangler.staging.toml for staging)
```

Or via the SOPS bundle (preferred — it is what CI uses):

1. `sops infra/secrets/production.enc.json` and set `SECRET_BOX_MASTER_KEY` to
   the generated value (use `staging.enc.json` for staging).
2. The deploy workflow's **Inject secrets** step decrypts the bundle and runs
   `wrangler secret bulk` against every Worker, which uploads it. See the
   [Deployment SOPS workflow](#ci) and `.github/workflows/deploy-{staging,production}.yml`.

### Fail-fast precondition

Stages whose wrangler `[vars]` carry `REQUIRE_SECRET_BOX_KEY = "true"`
(staging / production) treat the master key as mandatory. If it is **unset,
empty, or the shipped dev placeholder**, the per-request container fails to
build and **every route returns 500** — not just `/admin`, because the
`SecretBox` is wired into the whole request container.

Consequences:

- **Order matters: set the secret _before_ deploying** to a key-required stage.
  Deploying first leaves the stage hard-down until the secret lands.
- Never copy the shipped dev placeholder
  (`ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=`, base64 of
  `dev-only-do-not-use-in-prod-do-1`) into a production / staging secret. It is
  rejected both at runtime and by CI (`pnpm infra:check-secrets`) — a two-layer
  defense.
- `dev` (`wrangler.toml`, no `REQUIRE_SECRET_BOX_KEY`) keeps the `NullSecretBox`
  fallback and needs no master key.

### Rotating the master key

Master-key rotation is **not an instant cut-over**, because existing DB
ciphertext was written with the current key.

1. **Keep the old key until re-encryption finishes.** Every existing
   `apiKeySource='db'` row must still be decryptable with the old key while you
   migrate; you cannot drop it the moment the new key is set.
2. **Re-encryption strategy.** The wire format reserves a leading version byte
   (`0x01`) for exactly this kind of key / algorithm migration. Either bump to a
   new version and migrate rows incrementally, or run a batch that decrypts each
   `apiKeySource='db'` row with the old key and re-encrypts with the new key.
   The batch tool itself is **out of scope for this Issue (a separate Issue
   candidate)**.
3. **Keep stages isolated.** Rotate each stage's key independently with its own
   freshly generated value — do not reuse one key across staging and production
   (see [Generating the master key](#generating-the-master-key) above).

## Removing a secret

1. Delete the key from `workerSecretSpecs()` (`infra/src/secrets.ts`).
2. Delete it from both encrypted files (`sops infra/secrets/<stage>.enc.json`).
3. Delete it from both `*.json.example` templates.
4. Delete any matching entry from `.dev.vars.example`.
5. Verify the spec ↔ JSON are in sync (same 3 steps as the Adding flow
   above) for both stages.
6. **After the next CI deploy**, manually delete the orphaned secret
   from Cloudflare per Worker — `wrangler secret bulk` only **adds /
   updates**, never removes:
   ```sh
   for env_flag in "" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"; do
     # shellcheck disable=SC2086
     pnpm exec wrangler secret delete <REMOVED_KEY> --config wrangler.staging.toml $env_flag
   done
   ```
   Repeat for production.

## Bootstrapping the encrypted file from scratch

`sops` matches `.sops.yaml` creation rules against the **input file path**, so
encrypting from `/tmp/...` won't match. Copy to the target path first, then
encrypt in place:

```sh
cp infra/secrets/staging.json.example infra/secrets/staging.enc.json
$EDITOR infra/secrets/staging.enc.json    # fill in real values (still plaintext)
sops -e -i infra/secrets/staging.enc.json # encrypt in place
git add infra/secrets/staging.enc.json
```

Or open SOPS directly on a fresh file and paste values into the editor — the
plaintext never touches disk:

```sh
cp infra/secrets/staging.json.example infra/secrets/staging.enc.json
sops infra/secrets/staging.enc.json       # opens $EDITOR; saving re-encrypts
git add infra/secrets/staging.enc.json
```

## Adding a teammate

1. Get their `age1...` public key.
2. Append to `.sops.yaml` under `creation_rules[].age:`.
3. Re-key existing files:
   ```sh
   sops updatekeys infra/secrets/staging.enc.json
   sops updatekeys infra/secrets/production.enc.json
   ```
4. Commit.

## CI

GitHub Actions loads the age *private* key from
`secrets.SOPS_AGE_KEY` and decrypts at deploy time. See
`.github/workflows/deploy-staging.yml` / `deploy-production.yml`. Never
commit a private age key.

Register `SOPS_AGE_KEY` as an Environment Secret on the matching GitHub
Environment (`staging` / `production`); value is the contents of
`~/.config/sops/age/hollow-<stage>.txt`.
