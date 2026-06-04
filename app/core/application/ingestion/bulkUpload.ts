import { isBusinessRuleError } from "@/core/domain/error";

import type { ServiceArgs } from "../types";
import { type UploadFileOutput, uploadFile } from "./uploadFile";

export type BulkUploadEntry = Readonly<{
  name: string;
  mime: string;
  size: number;
  body: ReadableStream<Uint8Array>;
}>;

export type BulkUploadInput = Readonly<{
  actorUserId: string;
  files: readonly BulkUploadEntry[];
}>;

export type BulkUploadFailure = Readonly<{
  name: string;
  reason: string;
}>;

export type BulkUploadOutput = Readonly<{
  jobIds: readonly string[];
  failures: readonly BulkUploadFailure[];
}>;

/**
 * Wraps `uploadFile` over a batch and collects per-row failures.
 *
 * Aggregates `BusinessRuleError` outcomes (`unsupported_format`,
 * `size_exceeded`, `daily_upload_quota_exceeded`) into the `failures`
 * channel so a single bad file does not poison the rest of the batch.
 * Non-business errors (system / adapter faults) escape unchanged so the
 * caller can surface them as a 5xx rather than a per-row reason.
 */
export async function bulkUpload({
  container,
  input,
}: ServiceArgs<BulkUploadInput>): Promise<BulkUploadOutput> {
  const jobIds: string[] = [];
  const failures: BulkUploadFailure[] = [];

  for (const file of input.files) {
    try {
      const result: UploadFileOutput = await uploadFile({
        container,
        input: {
          actorUserId: input.actorUserId,
          originalFileName: file.name,
          mimeType: file.mime,
          byteSize: file.size,
          bodyStream: file.body,
        },
      });
      jobIds.push(result.jobId);
    } catch (error) {
      if (isBusinessRuleError(error)) {
        failures.push({ name: file.name, reason: error.code });
        continue;
      }
      throw error;
    }
  }

  return { jobIds, failures };
}
