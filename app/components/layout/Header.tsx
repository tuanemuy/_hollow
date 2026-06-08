import { Link } from "@tanstack/react-router";
import { Plus, Search, Upload } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { BrandLockup } from "@/components/common/BrandLogo";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { UploadButton } from "@/components/ingestion/UploadButton";
import type { UserDTO } from "@/core/application/dto";
import { MenuButton } from "./MenuButton";
import {
  APP_HEADER,
  APP_HEADER_LEFT,
  APP_HEADER_RIGHT,
  SEARCH_BOX_ICON,
  SEARCH_BOX_INPUT,
  SEARCH_BOX_WRAPPER,
} from "./styles";
import { UserMenu } from "./UserMenu";

type Props = {
  user: UserDTO;
};

export function Header({ user }: Props) {
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
        {/* Retired to the下部固定CTAバー (`BottomCtaBar`) below `lg` per #588
            ADR-001; only the desktop header keeps these CTAs inline. */}
        <Link
          to="/notes/new"
          className={`${pillBtn} ${pillBtnPrimary} max-lg:hidden`}
          data-primary=""
          aria-label="新規作成"
        >
          <Icon icon={Plus} />
          <span>新規作成</span>
        </Link>
        <UploadButton
          className={`${pillBtn} max-lg:hidden`}
          aria-label="アップロード"
        >
          <Icon icon={Upload} />
          <span>アップロード</span>
        </UploadButton>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
