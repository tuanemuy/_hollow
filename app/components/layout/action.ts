import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export const loadDirectoryTree = cache(
  serverData(
    () => import("@/core/application/directory/getDirectoryTree"),
    ({ container }, { getDirectoryTree }, actorUserId: string) =>
      getDirectoryTree({ container, input: { actorUserId } }),
  ),
);
