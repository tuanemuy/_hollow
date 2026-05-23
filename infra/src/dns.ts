import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";

// Phase 1 of the DnsRecord → WorkersCustomDomain migration.
//
// `WorkersCustomDomain` is intentionally NOT declared here yet. Pulumi
// cannot order the destroy of the prior `dns-<stage>` `DnsRecord` and
// the create of the new `custom-domain-<stage>` `WorkersCustomDomain`:
// they have different resource types and no implicit dependency, so
// Pulumi runs them in parallel. The first attempt failed with
// `code 100117` ("hostname already has externally managed DNS
// records") because the legacy AAAA `100::` placeholder was still
// in flight when the bind tried to create.
//
// Splitting into two deploys removes the race:
//   Phase 1 (this file): destroy the legacy DnsRecord. Pulumi has
//     nothing else to do under `createDns`, leaving Cloudflare with a
//     clean hostname.
//   Phase 2 (follow-up PR): re-introduce the WorkersCustomDomain
//     block against the now-empty hostname.
//
// `zone` is still resolved so callers (and Phase 2) can refer to
// `dns.zone.id` without a churn diff between phases.
export const createDns = (cfg: Config) => {
  const zone = cloudflare.getZoneOutput({ filter: { name: cfg.zoneName } });
  return { zone };
};

export type DnsOutput = ReturnType<typeof createDns>;
