#!/usr/bin/env tsx
/**
 * Render wrangler.{stage}.toml from a template + Pulumi stack output.
 *
 * Usage:
 *   pnpm --filter @hollow/infra render:staging
 *   pnpm --filter @hollow/infra render:production
 *
 *   # or directly:
 *   tsx infra/scripts/renderWrangler.ts staging
 *
 * Reads `pulumi stack output --json --stack <stage>` from `infra/` and
 * substitutes `${VAR}` placeholders in the template. The generated file
 * is written to the repo root and is git-ignored.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Stage = "staging" | "production";

const isStage = (v: string): v is Stage =>
  v === "staging" || v === "production";

const HERE = dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(INFRA_ROOT, "..");

const stageArg = process.argv[2];
if (!stageArg || !isStage(stageArg)) {
  console.error(
    `usage: renderWrangler.ts <staging|production> (got "${stageArg ?? ""}")`,
  );
  process.exit(1);
}
const stage: Stage = stageArg;

const templatePath = join(
  INFRA_ROOT,
  "templates",
  `wrangler.${stage}.toml.tmpl`,
);
const outputPath = join(REPO_ROOT, `wrangler.${stage}.toml`);

const stackOutputRaw = execFileSync(
  "pulumi",
  ["stack", "output", "--json", "--stack", stage, "--show-secrets"],
  {
    cwd: INFRA_ROOT,
    encoding: "utf8",
  },
);

type StackOutput = {
  appUrl: string;
  d1DatabaseId: string;
  d1DatabaseName: string;
  eventsQueueName: string;
  eventsDlqQueueName: string;
  tempFilesBucketName: string;
  objectsBucketName: string;
  workerNamesOut: {
    web: string;
    relay: string;
    consumer: string;
    pruner: string;
    dlq: string;
  };
};

const stack = JSON.parse(stackOutputRaw) as StackOutput;

const vars: Record<string, string> = {
  APP_URL: stack.appUrl,
  D1_ID: stack.d1DatabaseId,
  D1_NAME: stack.d1DatabaseName,
  EVENTS_QUEUE: stack.eventsQueueName,
  EVENTS_DLQ_QUEUE: stack.eventsDlqQueueName,
  R2_TEMP_FILES_BUCKET: stack.tempFilesBucketName,
  R2_OBJECTS_BUCKET: stack.objectsBucketName,
  WORKER_WEB: stack.workerNamesOut.web,
  WORKER_RELAY: stack.workerNamesOut.relay,
  WORKER_CONSUMER: stack.workerNamesOut.consumer,
  WORKER_PRUNER: stack.workerNamesOut.pruner,
  WORKER_DLQ: stack.workerNamesOut.dlq,
  // Public LLM model id + provider id + optional base URL override
  // delivered via `wrangler.toml [vars]`. Literal defaults live here
  // rather than in Pulumi StackOutput because they are deploy-time
  // choices, not provisioned resources. Stage-specific overrides
  // (e.g. claude-3-5-haiku for staging) ship in a follow-up Issue —
  // until then, **keep these values in sync with `wrangler.toml`**
  // (`[vars]` and `[env.consumer.vars]`); they are the local-dev
  // counterpart of the staging/production defaults. Adding a new
  // provider requires (1) appending to `LLM_PROVIDERS` in
  // `app/core/domain/adminSettings/valueObject.ts`, (2) extending the
  // factories in `app/core/application/di/llmProviderFactory.ts`,
  // (3) updating these defaults if the new provider should be the
  // stage default, and (4) syncing every env var to all 7 sites:
  // `wrangler.toml [vars]` + `[env.consumer.vars]`, both staging /
  // production templates' `[vars]` + `[env.consumer.vars]`, and this
  // `vars` literal (see Issue #101 plan.md Step 10 (re #122 ADR-008)).
  // `ADMIN_LLM_BASE_URL` is only meaningful for the OpenAI-compatible
  // provider; empty string means "use the provider default endpoint".
  ADMIN_LLM_MODEL: "claude-3-5-sonnet-latest",
  ADMIN_LLM_PROVIDER: "anthropic",
  ADMIN_LLM_BASE_URL: "",
};

const template = readFileSync(templatePath, "utf8");
const rendered = template.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
  if (!(key in vars)) {
    throw new Error(`unknown variable in template: \${${key}}`);
  }
  return vars[key];
});

writeFileSync(outputPath, rendered, "utf8");
console.log(`✓ wrote ${outputPath} (stage=${stage})`);
