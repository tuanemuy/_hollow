import * as cloudflare from "@pulumi/cloudflare";
import type { Config } from "./config.ts";
import { resourceNames } from "./config.ts";

/**
 * Create the two R2 buckets the reference runtime needs.
 *
 * - `temp-files`: short-lived ingestion upload staging. Lifecycle is
 *   managed elsewhere (TTL cleanup is owner-side); the binding is
 *   data-plane only and does not require a presign access key.
 * - `objects`: long-lived export artifacts and media objects.
 *   Download/upload may be served via S3-compatible SigV4 presigned
 *   URLs (`R2ObjectStorage`); credentials are provisioned manually
 *   (ADR-005) and provided via SOPS secrets.
 *
 * `location` is intentionally unspecified so Cloudflare picks the
 * default geography. If a stage needs a fixed jurisdiction (GDPR
 * etc.), pin it here in a follow-up.
 */
export const createR2Buckets = (cfg: Config) => {
  const names = resourceNames(cfg);
  const tempFiles = new cloudflare.R2Bucket(`temp-files-${cfg.stage}`, {
    accountId: cfg.accountId,
    name: names.tempFilesBucket,
  });
  const objects = new cloudflare.R2Bucket(`objects-${cfg.stage}`, {
    accountId: cfg.accountId,
    name: names.objectsBucket,
  });
  return { tempFiles, objects };
};

export type R2BucketsOutput = ReturnType<typeof createR2Buckets>;
