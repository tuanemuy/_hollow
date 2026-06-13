import * as pulumi from "@pulumi/pulumi";

export type Stage = "staging" | "production";

const STAGES: ReadonlySet<Stage> = new Set(["staging", "production"]);

const isStage = (v: string): v is Stage => STAGES.has(v as Stage);

export type Config = {
  appName: string;
  stage: Stage;
  zoneName: string;
  hostname: string;
  emailFrom: string;
  accountId: string;
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  // Gate the WorkersCustomDomain binding (infra/src/dns.ts). On a fresh
  // environment the web Worker does not exist until `Deploy Workers` runs,
  // but Pulumi up — which binds the custom domain — runs first, so the
  // binding 404s with code 10007. Set this false for the first deploy to
  // create the Worker, then true to attach the domain (Issue #700).
  manageCustomDomain: boolean;
};

export const readConfig = (): Config => {
  const cfg = new pulumi.Config("hollow");

  const stageRaw = cfg.require("stage");
  if (!isStage(stageRaw)) {
    throw new Error(
      `hollow:stage must be "staging" or "production", got "${stageRaw}"`,
    );
  }

  return {
    appName: cfg.require("appName"),
    stage: stageRaw,
    zoneName: cfg.require("zoneName"),
    hostname: cfg.require("hostname"),
    emailFrom: cfg.require("emailFrom"),
    accountId: cfg.require("cloudflareAccountId"),
    llmProvider: cfg.get("llmProvider") ?? "",
    llmModel: cfg.get("llmModel") ?? "",
    llmBaseUrl: cfg.get("llmBaseUrl") ?? "",
    manageCustomDomain: cfg.getBoolean("manageCustomDomain") ?? true,
  };
};

export const workerNames = (cfg: Pick<Config, "appName" | "stage">) => {
  const prefix = `${cfg.appName}-${cfg.stage}`;
  return {
    web: prefix,
    relay: `${prefix}-relay`,
    consumer: `${prefix}-consumer`,
    pruner: `${prefix}-pruner`,
    dlq: `${prefix}-dlq`,
    indexer: `${prefix}-indexer`,
  } as const;
};

export const resourceNames = (cfg: Pick<Config, "appName" | "stage">) => {
  const prefix = `${cfg.appName}-${cfg.stage}`;
  return {
    d1: `${prefix}-d1`,
    eventsQueue: `${prefix}-events`,
    eventsDlqQueue: `${prefix}-events-dlq`,
    tempFilesBucket: `${prefix}-temp-files`,
    objectsBucket: `${prefix}-objects`,
  } as const;
};
