import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";
import { resourceNames } from "./config.ts";

export const createQueues = (cfg: Config) => {
  const names = resourceNames(cfg);
  const events = new cloudflare.Queue(`events-${cfg.stage}`, {
    accountId: cfg.accountId,
    queueName: names.eventsQueue,
  });
  const dlq = new cloudflare.Queue(`events-dlq-${cfg.stage}`, {
    accountId: cfg.accountId,
    queueName: names.eventsDlqQueue,
  });
  return { events, dlq };
};

export type QueuesOutput = ReturnType<typeof createQueues>;
