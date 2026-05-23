# infra/secrets

SOPS-encrypted secrets injected into Cloudflare Workers at deploy time.

## Files

- `staging.json.example` / `production.json.example` — plaintext templates
  showing the required key set. Tracked.
- `staging.enc.json` / `production.enc.json` — SOPS-encrypted live secrets.
  Tracked. Generated from the examples.
- Anything else here is git-ignored.

The required key set is the union of `workerSecretSpecs()` in
[`infra/src/secrets.ts`](../src/secrets.ts). Adding a key to that spec
without adding it here will cause the deploy step to fail loudly.

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

## Adding / updating a secret

```sh
# Edit in place — SOPS handles re-encryption automatically.
sops infra/secrets/staging.enc.json
```

`sops` opens the file in `$EDITOR` decrypted; on save it re-encrypts in
place. Commit the resulting diff.

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
