import { BusinessRuleError } from "@/core/domain/error";
import { TagMergeJobErrorCode } from "./errorCode";

const ERROR_REASON_MAX_LENGTH = 1024;
const ERROR_CODE_MAX_LENGTH = 128;

declare const tagMergeJobIdBrand: unique symbol;

/**
 * Opaque, non-empty identifier for a `TagMergeJob`. The id format
 * (UUIDv7 in this template) is owned by `IdGenerator` and re-validated
 * by storage adapters on rehydration.
 */
export type TagMergeJobId = string & {
  readonly [tagMergeJobIdBrand]: true;
};

export const TagMergeJobId = {
  create: (id: string): TagMergeJobId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        TagMergeJobErrorCode.InvalidId,
        "Invalid tag merge job id",
      );
    }
    return trimmed as TagMergeJobId;
  },
};

export type TagMergeStatus = "pending" | "processing" | "completed" | "failed";

export const TagMergeStatus = {
  create: (raw: string): TagMergeStatus => {
    if (
      raw !== "pending" &&
      raw !== "processing" &&
      raw !== "completed" &&
      raw !== "failed"
    ) {
      throw new BusinessRuleError(
        TagMergeJobErrorCode.InvalidStatus,
        `Invalid tag merge job status: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Progress counter carried inside a tag-merge job. Invariant:
 * `0 <= processed <= total`. `processed` counts the notes that have
 * been *inspected* (including no-ops that already carried the target
 * tag), not just the ones actually rewritten.
 */
export type TagMergeProgress = Readonly<{
  processed: number;
  total: number;
}>;

export const TagMergeProgress = {
  initial: (): TagMergeProgress => ({ processed: 0, total: 0 }),
  create: (processed: number, total: number): TagMergeProgress => {
    if (!Number.isInteger(processed) || processed < 0) {
      throw new BusinessRuleError(
        TagMergeJobErrorCode.InvalidProgress,
        `Invalid processed count: ${processed}`,
      );
    }
    if (!Number.isInteger(total) || total < 0) {
      throw new BusinessRuleError(
        TagMergeJobErrorCode.InvalidProgress,
        `Invalid total count: ${total}`,
      );
    }
    if (processed > total) {
      throw new BusinessRuleError(
        TagMergeJobErrorCode.InvalidProgress,
        `processed (${processed}) cannot exceed total (${total})`,
      );
    }
    return { processed, total };
  },
};

export function validateErrorCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.InvalidErrorCode,
      "Error code cannot be empty",
    );
  }
  if (trimmed.length > ERROR_CODE_MAX_LENGTH) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.InvalidErrorCode,
      `Error code exceeds maximum length (${ERROR_CODE_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

export function validateErrorReason(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.InvalidErrorReason,
      "Error reason cannot be empty",
    );
  }
  if (trimmed.length > ERROR_REASON_MAX_LENGTH) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.InvalidErrorReason,
      `Error reason exceeds maximum length (${ERROR_REASON_MAX_LENGTH})`,
    );
  }
  return trimmed;
}
