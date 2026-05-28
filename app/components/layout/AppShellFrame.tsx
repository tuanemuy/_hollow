import type { ReactNode } from "react";
import { UploadDialogMount } from "../ingestion/UploadDialogMount";
import { APP_LAYOUT_WITH_SIDEBAR, APP_MAIN } from "./styles";

// Register the ingestion server-fn handlers with the RSC manifest before
// the client bundle freezes it. `UploadDialogMount` is mounted here in
// every authenticated layout, so consolidating the side-effect import
// keeps new authenticated routes from needing to re-register it.
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
