import type { R2Bucket } from "@cloudflare/workers-types";
import type { R2PresignConfig } from "./r2ObjectStorage";
import { verifyPresignedRequest } from "./r2PresignVerify";

/** Path prefix the dev object-storage proxy is mounted under. */
export const DEV_OBJECT_STORAGE_PATH_PREFIX = "/dev/r2/";

/**
 * Local-dev terminator for presigned R2 URLs (Issue #657, ADR-001).
 *
 * In local verification (`wrangler dev`), `R2_S3_ENDPOINT` points the
 * presigner at `http://localhost:8787/dev/r2`, so browser PUT/GET land
 * here same-origin (no CORS preflight) and read/write the same miniflare
 * `OBJECT_STORAGE` binding that `finalizeUpload` stats — eliminating the
 * remote-R2 / local-binding store mismatch. The route is wired by the
 * entry point only when `R2_DEV_OBJECT_PROXY === "true"` (local
 * `wrangler.toml [vars]` only; never set on staging / production).
 *
 * Presigned-URL semantics are preserved: every request must carry a
 * valid SigV4 query signature minted with the same credentials
 * (ADR-002), so even an accidental production enablement does not open
 * an unauthenticated read/write endpoint.
 */
export async function buildDevObjectStorageResponse(params: {
  request: Request;
  bucket: R2Bucket;
  bucketName: string;
  presignConfig: R2PresignConfig;
}): Promise<Response> {
  const { request, bucket, bucketName, presignConfig } = params;
  const url = new URL(request.url);

  // The signer signs the raw (segment-wise percent-encoded) pathname, so
  // signature verification must run against the raw pathname while the
  // binding operations receive the percent-decoded key. Breaking this
  // symmetry would let verification pass yet store the object under an
  // encoded key that `finalizeUpload`'s `stat` never finds.
  const rawSubPath = url.pathname.slice(DEV_OBJECT_STORAGE_PATH_PREFIX.length);
  const slash = rawSubPath.indexOf("/");
  if (slash <= 0 || slash === rawSubPath.length - 1) {
    return new Response("Not Found", { status: 404 });
  }
  const requestedBucket = rawSubPath.slice(0, slash);
  const rawKey = rawSubPath.slice(slash + 1);
  if (requestedBucket !== bucketName) {
    return new Response("Not Found", { status: 404 });
  }
  const key = rawKey
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  if (request.method !== "PUT" && request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const verification = await verifyPresignedRequest({
    method: request.method,
    url,
    headers: request.headers,
    config: presignConfig,
  });
  if (!verification.ok) {
    return new Response(`Forbidden: ${verification.reason}`, { status: 403 });
  }

  if (request.method === "PUT") {
    // workerd's `R2Bucket.put` rejects unknown-length ReadableStreams
    // ("Provided readable stream must have a known length"), so buffer
    // the body. Fine for local-dev-sized uploads.
    const body = await request.arrayBuffer();
    const contentType =
      request.headers.get("content-type") ?? "application/octet-stream";
    await bucket.put(key, body, { httpMetadata: { contentType } });
    return new Response(null, { status: 200 });
  }

  const object = await bucket.get(key);
  if (object === null) {
    return new Response("Not Found", { status: 404 });
  }
  const headers = new Headers();
  headers.set(
    "content-type",
    object.httpMetadata?.contentType ?? "application/octet-stream",
  );
  // `response-content-disposition` is a signed query parameter (it was
  // part of the verified canonical query), so honouring it here mirrors
  // what R2 itself does for presigned GETs.
  const disposition = url.searchParams.get("response-content-disposition");
  if (disposition !== null) {
    headers.set("content-disposition", disposition);
  }
  return new Response(await object.arrayBuffer(), { status: 200, headers });
}
