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
// Migration history: introduced in PR #194, then temporarily withdrawn
// in PR #196 to give Pulumi a clean slate. Pulumi runs different
// resource types in parallel, so the legacy `dns-<stage>` DnsRecord's
// destroy and this resource's create raced on the first attempt;
// Cloudflare's bind API rejects a hostname that still has an externally
// managed AAAA record with `code 100117`. With the legacy DnsRecord
// gone, this declaration is now safe to re-introduce.
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
    },
  );

  return { customDomain, zone };
};

export type DnsOutput = ReturnType<typeof createDns>;
