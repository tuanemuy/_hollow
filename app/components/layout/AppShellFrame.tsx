import type { ReactNode } from "react";
import { UploadDialogMount } from "../ingestion/UploadDialogMount";
import { AppShellDrawer } from "./AppShellDrawer";

// Register the ingestion server-fn handlers with the RSC manifest before
// the client bundle freezes it. `UploadDialogMount` is mounted here, so
// keeping the side-effect import next to its consumer makes the
// dependency explicit and survives future moves of this frame.
import "@/components/ingestion/actions";

type Props = {
  header: ReactNode;
  sidebar: ReactNode;
  settingsSidebar?: ReactNode;
  children: ReactNode;
};

// Server component: composes the RSC header/sidebar payloads with the
// routed children via the client `AppShellDrawer` (which owns the mobile
// drawer state). Kept server-side so the ingestion side-effect import and
// `UploadDialogMount` stay out of the client bundle (Issue #354 ADR-002).
export function AppShellFrame({
  header,
  sidebar,
  settingsSidebar,
  children,
}: Props) {
  return (
    <>
      <AppShellDrawer
        header={header}
        sidebar={sidebar}
        settingsSidebar={settingsSidebar}
      >
        {children}
      </AppShellDrawer>
      <UploadDialogMount />
    </>
  );
}
