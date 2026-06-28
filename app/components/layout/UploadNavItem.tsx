"use client";

import { Link } from "@tanstack/react-router";
import {
  uploadQueueLabel,
  useIngestionQueueCount,
} from "@/components/ingestion/useIngestionQueueCount";
import { ACTIVE_NAV_PROPS, NAV_COUNT, NAV_ITEM } from "./styles";

/**
 * Sidebar 管理 upload nav item with a live unprocessed-job count. Client
 * boundary kept to this item so `Sidebar` stays a server component (#790
 * ADR-003). The count is carried in the `<Link>`'s `aria-label`
 * (`uploadQueueLabel`); since `aria-label` overrides descendant text, the
 * visible `NAV_COUNT` span is not double-announced (#790 ADR-002).
 */
export function UploadNavItem() {
  const count = useIngestionQueueCount();
  return (
    <Link
      to="/upload"
      className={NAV_ITEM}
      activeProps={ACTIVE_NAV_PROPS}
      aria-label={uploadQueueLabel(count)}
    >
      <span>アップロード</span>
      {count > 0 ? (
        <span className={NAV_COUNT}>{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}
