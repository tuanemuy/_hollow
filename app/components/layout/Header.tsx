import { Link } from "@tanstack/react-router";
import { Plus, Search, Upload } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { BrandLockup } from "@/components/common/BrandLogo";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { UploadButton } from "@/components/ingestion/UploadButton";
import { MenuButton } from "./MenuButton";
import {
  APP_HEADER,
  APP_HEADER_LEFT,
  APP_HEADER_RIGHT,
  HEADER_CTA_COLLAPSE,
  HEADER_NEW_NOTE_DEMOTE,
  SEARCH_BOX_ICON,
  SEARCH_BOX_INPUT,
  SEARCH_BOX_WRAPPER,
} from "./styles";

export function Header() {
  return (
    <header className={APP_HEADER}>
      <div className={APP_HEADER_LEFT}>
        <MenuButton />
        <Link to="/" search={HOME_SEARCH} className="text-ink max-sm:hidden">
          <BrandLockup />
        </Link>
      </div>
      <div className={SEARCH_BOX_WRAPPER}>
        <form action="/" method="get">
          <label
            htmlFor="header-search"
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
          >
            ノート検索
          </label>
          <Icon icon={Search} size={16} className={SEARCH_BOX_ICON} />
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder="ノートを検索"
            autoComplete="off"
            className={SEARCH_BOX_INPUT}
          />
        </form>
      </div>
      <div className={APP_HEADER_RIGHT}>
        {/* Upload is the primary action (#628 ADR-003, 案2-B): accent fill,
            placed first. New-note is demoted to a desktop text button. Both
            collapse to a 36px icon-only circle below `sm` (label hidden), so the
            mobile header carries search + both CTAs without a bottom CTA bar
            (#628 ADR-001 supersedes #588). The user menu now lives in the
            sidebar foot (#628 ADR-003). */}
        {/* The accessible name (incl. the unprocessed-job count) is owned by
            UploadButton itself — see IngestionQueueBadge. */}
        <UploadButton
          className={`${pillBtn} ${pillBtnPrimary} ${HEADER_CTA_COLLAPSE}`}
        >
          <Icon icon={Upload} />
          <span className="max-sm:hidden">アップロード</span>
        </UploadButton>
        <Link
          to="/notes/new"
          className={`${pillBtn} ${HEADER_NEW_NOTE_DEMOTE} ${HEADER_CTA_COLLAPSE}`}
          aria-label="新規作成"
        >
          <Icon icon={Plus} className="sm:hidden" />
          <span className="max-sm:hidden">新規作成</span>
        </Link>
      </div>
    </header>
  );
}
