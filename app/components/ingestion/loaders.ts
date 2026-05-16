import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export const loadIngestionJobs = cache(
  serverData(
    () => import("@/core/application/ingestion/getIngestionJobs"),
    ({ container }, { getIngestionJobs }, actorUserId: string) =>
      getIngestionJobs({
        container,
        input: {
          actorUserId: actorUserId as unknown as Parameters<
            typeof getIngestionJobs
          >[0]["input"]["actorUserId"],
          limit: 50,
        },
      }),
  ),
);
