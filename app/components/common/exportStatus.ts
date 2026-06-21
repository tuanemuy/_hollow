import type { ExportJobDTO } from "@/core/application/dto/export";
import type { Tone } from "./styles";

type ExportStatus = ExportJobDTO["status"];

/**
 * Maps an export job's 6-value status to a semantic {@link Tone} for the
 * status chip ({@link tagBadge} + {@link tagTone}). Shared by the admin Jobs
 * board and the P16 export-job list/detail screens so the two surfaces never
 * drift. `expired` has no dedicated mock color, so it folds into `warning`
 * alongside `cancelled`.
 */
export function exportStatusTag(status: ExportStatus): Tone {
  switch (status) {
    case "failed":
      return "error";
    case "pending":
    case "processing":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
    case "expired":
      return "warning";
  }
}
