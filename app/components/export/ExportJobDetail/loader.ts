import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export type LoadExportJobInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export const loadExportJob = cache(
  serverData(
    () => import("@/core/application/export/getExportJob"),
    ({ container }, { getExportJob }, input: LoadExportJobInput) =>
      getExportJob({
        container,
        input: {
          actorUserId: input.actorUserId,
          jobId: input.jobId,
        },
      }),
  ),
);
