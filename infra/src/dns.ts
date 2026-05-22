import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";

const PLACEHOLDER_AAAA = "100::";

export const createDns = (cfg: Config) => {
  const zone = cloudflare.getZoneOutput({ filter: { name: cfg.zoneName } });

  const aaaa = new cloudflare.DnsRecord(`dns-${cfg.stage}`, {
    zoneId: zone.id,
    name: cfg.hostname,
    type: "AAAA",
    content: PLACEHOLDER_AAAA,
    proxied: true,
    ttl: 1,
    comment: `Placeholder AAAA for proxied Worker route; see wrangler.${cfg.stage}.toml`,
  });

  return { aaaa, zone };
};

export type DnsOutput = ReturnType<typeof createDns>;
