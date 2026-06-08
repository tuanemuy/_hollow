"use client";

import { Link } from "@tanstack/react-router";
import { Plus, Upload } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { UploadButton } from "@/components/ingestion/UploadButton";
import { BottomActionBar } from "@/components/layout/BottomActionBar";
import { CTA_BAR_PRIMARY, CTA_BAR_UPLOAD } from "@/components/layout/styles";
import { useSelection } from "./SelectionContext";

/**
 * P10-only consumer of the shared `BottomActionBar` frame (#588 ADR-001): the
 * 新規作成 + アップロード CTAs that the header retires on mobile (`max-lg:hidden`).
 *
 * Mutually exclusive with the BulkActionBar's mobile full-width sheet (#588
 * ADR-002): per mock `P10-home.html`, the下部固定CTA shows only while nothing is
 * selected. Once a selection exists the bulk-bar takes the bottom floor (z=45 >
 * cta-bar z=40), so this bar removes itself entirely to avoid stacking under it.
 * The frame itself is already `lg:hidden`, so this only affects mobile.
 */
export function BottomCtaBar() {
  const { state } = useSelection();
  if (state.ids.size > 0) return null;

  return (
    <BottomActionBar>
      <Link
        to="/notes/new"
        className={`${pillBtn} ${pillBtnPrimary} ${CTA_BAR_PRIMARY}`}
        data-primary=""
        aria-label="新規作成"
      >
        <Icon icon={Plus} />
        <span>新規作成</span>
      </Link>
      <UploadButton
        className={`${pillBtn} ${CTA_BAR_UPLOAD}`}
        aria-label="アップロード"
      >
        <Icon icon={Upload} />
      </UploadButton>
    </BottomActionBar>
  );
}
