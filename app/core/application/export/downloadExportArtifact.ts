import { BusinessRuleError } from "@/core/domain/error";
import { ExportJob } from "@/core/domain/export/entity";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";
import type { UserId as UserIdBrand } from "@/core/domain/identity/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DownloadExportArtifactInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export type DownloadExportArtifactOutput = Readonly<{
  url: URL;
  expiresAt: Date;
}>;

const PRESIGN_TTL_SEC = 5 * 60;

/**
 * Issue a short-lived presigned download URL for a completed export
 * artifact. Ownership / readiness / expiry are checked against the
 * persisted `ExportJob`; storage minting happens outside the UoW
 * because the backend (R2 / S3) has no two-phase commit.
 */
export async function downloadExportArtifact({
  container,
  input,
}: ServiceArgs<DownloadExportArtifactInput>): Promise<DownloadExportArtifactOutput> {
  const now = container.clock.now();
  const completed = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository }) => {
      const found = await exportJobRepository.findById(
        input.jobId as ExportJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "EXPORT_JOB_NOT_FOUND",
          `Export job not found: ${input.jobId}`,
        );
      }
      ExportJob.assertOwnedBy(found.entity, input.actorUserId as UserIdBrand);
      if (!ExportJob.isCompleted(found.entity)) {
        throw new BusinessRuleError(
          ExportErrorCode.IllegalTransition,
          "export_not_ready",
        );
      }
      if (found.entity.expiresAt.getTime() <= now.getTime()) {
        throw new BusinessRuleError(
          ExportErrorCode.IllegalTransition,
          "export_expired",
        );
      }
      return found.entity;
    },
  );

  const url = await container.objectStorage.presignDownload(
    completed.artifactKey,
    PRESIGN_TTL_SEC,
  );
  return {
    url,
    expiresAt: new Date(now.getTime() + PRESIGN_TTL_SEC * 1000),
  };
}
