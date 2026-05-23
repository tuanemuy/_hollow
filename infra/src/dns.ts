import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";
import { workerNames } from "./config.ts";

// Bind the web Worker to `cfg.hostname` via Workers Custom Domains.
// Custom Domains let Cloudflare own the DNS record and the edge cert
// for the host — Universal SSL only covers the zone apex and a single
// wildcard level, so `staging.hollow.maku-ja.com` and similar
// multi-level subdomains have no cert under the legacy
// `wrangler routes` + proxied-DnsRecord pattern.
//
// `environment = "production"` here matches Cloudflare's internal
// version namespace for the top-level wrangler deploy (`wrangler
// deploy --config wrangler.<stage>.toml` without `--env <x>`) — it is
// NOT the same as the `[env.relay]` / `[env.consumer]` sub-environments
// in wrangler.toml.
export const createDns = (cfg: Config) => {
  const zone = cloudflare.getZoneOutput({ filter: { name: cfg.zoneName } });
  const names = workerNames(cfg);

  const customDomain = new cloudflare.WorkersCustomDomain(
    `custom-domain-${cfg.stage}`,
    {
      accountId: cfg.accountId,
      zoneId: zone.id,
      hostname: cfg.hostname,
      service: names.web,
      environment: "production",
    },
  );

  return { customDomain, zone };
};

export type DnsOutput = ReturnType<typeof createDns>;
