import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";
import { workerNames } from "./config.ts";

const PLACEHOLDER_AAAA = "100::";

export const createDnsAndRoutes = (cfg: Config) => {
  const zone = cloudflare.getZoneOutput({ filter: { name: cfg.zoneName } });

  const aaaa = new cloudflare.DnsRecord(`dns-${cfg.stage}`, {
    zoneId: zone.id,
    name: cfg.hostname,
    type: "AAAA",
    content: PLACEHOLDER_AAAA,
    proxied: true,
    ttl: 1,
    comment: `Placeholder for Worker route — ${cfg.appName}/${cfg.stage}`,
  });

  const scripts = workerNames(cfg);
  const route = new cloudflare.WorkersRoute(
    `route-${cfg.stage}`,
    {
      zoneId: zone.id,
      pattern: `${cfg.hostname}/*`,
      script: scripts.web,
    },
    { dependsOn: [aaaa] },
  );

  return { aaaa, route, zone };
};

export type DnsOutput = ReturnType<typeof createDnsAndRoutes>;
