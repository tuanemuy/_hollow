import type { ReactNode } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { UploadDialogMount } from "../ingestion/UploadDialogMount";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { APP_LAYOUT_WITH_SIDEBAR, APP_MAIN } from "./styles";

// Register the ingestion server-fn handlers with the RSC manifest before
// the client bundle freezes it. `UploadDialogMount` is mounted in every
// authenticated layout, so consolidating the side-effect import here keeps
// new authenticated routes from needing to re-register it.
import "@/components/ingestion/actions";

type Props = {
  user: UserDTO;
  children: ReactNode;
};

export function AppShell({ user, children }: Props) {
  return (
    <>
      <Header user={user} />
      <div className={APP_LAYOUT_WITH_SIDEBAR}>
        <Sidebar user={user} />
        <main className={APP_MAIN}>{children}</main>
      </div>
      <UploadDialogMount />
    </>
  );
}
