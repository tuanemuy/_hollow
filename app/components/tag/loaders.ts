import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export const loadTagsForOwner = cache(
  serverData(
    () => import("@/core/application/tag/listTags"),
    ({ container }, { listTags }, actorUserId: string) =>
      listTags({
        container,
        input: {
          actorUserId: actorUserId as unknown as Parameters<
            typeof listTags
          >[0]["input"]["actorUserId"],
          limit: 200,
        },
      }),
  ),
);
