import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export const loadUsageMetrics = cache(
  serverData(
    () => import("@/core/application/adminSettings/getUsageMetrics"),
    ({ container }, { getUsageMetrics }, actorUserId: string) =>
      getUsageMetrics({ container, input: { actorUserId } }),
  ),
);
