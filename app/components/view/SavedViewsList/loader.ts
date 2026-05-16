import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";

export type LoadSavedViewsInput = Readonly<{
  actorUserId: string;
  kind: "personal" | "public";
}>;

export const loadSavedViews = cache(
  serverData(
    () => import("@/core/application/view/listSavedViews"),
    ({ container }, { listSavedViews }, input: LoadSavedViewsInput) =>
      listSavedViews({ container, input }),
  ),
);
