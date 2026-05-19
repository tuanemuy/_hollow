import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";
import { resourceNames } from "./config.ts";

export const createD1 = (cfg: Config) => {
  const names = resourceNames(cfg);
  return new cloudflare.D1Database(`d1-${cfg.stage}`, {
    accountId: cfg.accountId,
    name: names.d1,
  });
};

export type D1Output = ReturnType<typeof createD1>;
