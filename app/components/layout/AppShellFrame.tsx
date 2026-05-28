import type { ReactNode } from "react";
import { UploadDialogMount } from "../ingestion/UploadDialogMount";
import { APP_LAYOUT_WITH_SIDEBAR, APP_MAIN } from "./styles";

// Register the ingestion server-fn handlers with the RSC manifest before
// the client bundle freezes it. `UploadDialogMount` is mounted here, so
// keeping the side-effect import next to its consumer makes the
// dependency explicit and survives future moves of this frame.
import "@/components/ingestion/actions";

type Props = {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppShellFrame({ header, sidebar, children }: Props) {
  return (
    <>
      {header}
      <div className={APP_LAYOUT_WITH_SIDEBAR}>
        {sidebar}
        <main className={APP_MAIN}>{children}</main>
      </div>
      <UploadDialogMount />
    </>
  );
}
