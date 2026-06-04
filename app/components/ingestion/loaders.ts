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
      options?: { includeDiscarded?: boolean },
    ): Promise<{ jobs: readonly IngestionJobWire[] }> => {
      const { jobs } = await getIngestionJobs({
        container,
        input: {
          actorUserId: actorUserId,
          limit: 50,
          ...(options?.includeDiscarded === true
            ? { includeDiscarded: true }
            : {}),
        },
      });
      return { jobs: jobs.map(toIngestionJobWire) };
    },
  ),
);
