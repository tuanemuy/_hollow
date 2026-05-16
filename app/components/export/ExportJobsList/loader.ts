import { cache } from "react";
import type { UserId } from "@/core/domain/identity/valueObject";
import { serverData } from "@/core/presentation/serverAction";

export type LoadExportJobsInput = Readonly<{
  actorUserId: UserId;
  limit: number;
  offset: number;
}>;

export const loadExportJobs = cache(
  serverData(
    () => import("@/core/application/export/listExportJobs"),
    ({ container }, { listExportJobs }, input: LoadExportJobsInput) =>
      listExportJobs({
        container,
        input: {
          actorUserId: input.actorUserId,
          limit: input.limit,
          offset: input.offset,
        },
      }),
  ),
);
