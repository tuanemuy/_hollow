#!/usr/bin/env tsx
/**
 * Validate that the decrypted SOPS secrets file matches the spec union of
 * `workerSecretSpecs()` before `wrangler secret bulk` runs.
 *
 * Usage:
 *   pnpm infra:check-secrets:staging    -- <decrypted-json-path>
 *   pnpm infra:check-secrets:production -- <decrypted-json-path>
 *
 *   # or directly:
 *   tsx infra/scripts/checkSecrets.ts staging <decrypted-json-path>
 *
 * Fails (exit 1) if:
 *   - The decrypted JSON is missing any key from `workerSecretSpecs(...)`
 *   - The decrypted JSON has any extra non-`^_` key not in the spec
 *
 * Keys starting with `_` are documentation-only and are ignored on both
 * sides of the comparison (the CI `jq` filter strips them before bulk-push;
 * this script strips them before comparing).
 *
 * `appName` is irrelevant to the secret name set — see the invariant
 * documented on `workerSecretSpecs()` in `../src/secrets.ts`.
 *
 * Scope (intentional non-goals):
 * - **Key set only, with one value exception.** Value validity (empty
 *   string, placeholder text, `null`, whitespace, etc.) is generally not
 *   checked — the CI `wrangler secret bulk` push surfaces such issues at
 *   the Worker invocation site. The sole exception is the shipped dev
 *   placeholder for `SECRET_BOX_MASTER_KEY` (W-003 / Issue #102): a
 *   copy-paste of the `.dev.vars.example` value into a real stage secret
 *   passes the AES-256 shape check and would silently disable at-rest
 *   encryption, so it is refused here before deploy.
 * - **No duplicate-key detection.** `JSON.parse` silently keeps the
 *   last occurrence on duplicate keys, so a `sops` editor session that
 *   accidentally produces two entries with the same name is not caught
 *   here.
 * - **Trust boundary.** The decrypted file is treated as trusted input
 *   (produced by `sops -d` on a self-managed `.enc.json`). Path
 *   arguments containing a literal `--` are NOT supported — the CLI
 *   strips every `--` token (see `positional` below) to neutralize
 *   `pnpm` chain leakage. In practice the path is always a `mktemp`
 *   output (`/tmp/tmp.XXXXX`).
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workerSecretSpecs } from "../src/secrets.ts";
import { assertNoShippedPlaceholders } from "./placeholderGuard.ts";

type Stage = "staging" | "production";

const HERE = dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(INFRA_ROOT, "..");

const isStage = (v: string): v is Stage =>
  v === "staging" || v === "production";

// `pnpm <root-script> -- <args>` chains via `pnpm --filter ... <pkg-script>`
// can leak literal `--` separators into argv when the depth is > 1. Strip
// them so callers can use `pnpm infra:check-secrets:<stage> -- <path>` or
// the bare form interchangeably.
const positional = process.argv.slice(2).filter((a) => a !== "--");
const stageArg = positional[0];
const decryptedPathArg = positional[1];

if (!stageArg || !isStage(stageArg) || !decryptedPathArg) {
  console.error(
    "usage: checkSecrets.ts <staging|production> <decrypted-json-path>",
  );
  process.exit(1);
}

const stage: Stage = stageArg;
// `pnpm --filter @hollow/infra` runs the script with cwd = `infra/`, so
// relative paths supplied from the repo root would not resolve. Anchor
// non-absolute paths to the repo root regardless of cwd.
const decryptedPath = isAbsolute(decryptedPathArg)
  ? decryptedPathArg
  : resolve(REPO_ROOT, decryptedPathArg);

let rawJson: string;
try {
  rawJson = readFileSync(decryptedPath, "utf8");
} catch (err) {
  console.error(
    `failed to read decrypted secrets file at "${decryptedPath}": ${(err as Error).message}`,
  );
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(rawJson);
} catch (err) {
  console.error(
    `failed to parse "${decryptedPath}" as JSON: ${(err as Error).message}`,
  );
  process.exit(1);
}

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  console.error(`"${decryptedPath}" must decode to a JSON object`);
  process.exit(1);
}

const decoded = parsed as Record<string, unknown>;

const placeholderViolations = assertNoShippedPlaceholders(decoded);
if (placeholderViolations.length > 0) {
  console.error(`✗ secrets check failed (stage=${stage})`);
  for (const v of placeholderViolations) console.error(`    - ${v}`);
  process.exit(1);
}

const specs = workerSecretSpecs({ appName: "check", stage });
const expected = new Set<string>(specs.flatMap((s) => [...s.secrets]));

const actual = new Set<string>(
  Object.keys(decoded).filter((k) => !k.startsWith("_")),
);

const missing = [...expected].filter((k) => !actual.has(k)).sort();
const extra = [...actual].filter((k) => !expected.has(k)).sort();

if (missing.length > 0 || extra.length > 0) {
  console.error(`✗ secrets check failed (stage=${stage})`);
  if (missing.length > 0) {
    console.error(
      `  missing (in workerSecretSpecs but not in ${decryptedPath}):`,
    );
    for (const k of missing) console.error(`    - ${k}`);
  }
  if (extra.length > 0) {
    console.error(
      `  extra (in ${decryptedPath} but not in workerSecretSpecs):`,
    );
    for (const k of extra) console.error(`    - ${k}`);
  }
  process.exit(1);
}

console.log(`✓ secrets check passed (stage=${stage}, keys=${expected.size})`);
