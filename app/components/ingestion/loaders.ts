import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";
import { type IngestionJobWire, toIngestionJobWire } from "./wire";

export const loadIngestionJobs = cache(
  serverData(
    () => import("@/core/application/ingestion/getIngestionJobs"),
    async (
      { container },
      { getIngestionJobs },
      actorUserId: string,
    ): Promise<{ jobs: readonly IngestionJobWire[] }> => {
      const { jobs } = await getIngestionJobs({
        container,
        input: {
          actorUserId: actorUserId as unknown as Parameters<
            typeof getIngestionJobs
          >[0]["input"]["actorUserId"],
          limit: 50,
        },
      });
      return { jobs: jobs.map(toIngestionJobWire) };
    },
  ),
);
