import { Link } from "@tanstack/react-router";
import { HOME_SEARCH, TRASH_SEARCH } from "@/components/auth/links";
import { DirectorySidebarSection } from "@/components/directory/DirectorySidebarSection";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadDirectoryTree } from "./action";
import { NAV_ITEM, SIDEBAR_SECTION, SIDEBAR_SECTION_TITLE } from "./styles";

type Props = {
  user: UserDTO;
};

const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

export async function Sidebar({ user }: Props) {
  const { tree } = await loadDirectoryTree(user.id);

  // The positioned `<aside>` (drawer on mobile, sticky column on desktop)
  // is provided by `AppShellDrawer`; this component renders only the inner
  // sections so the drawer can drive `data-open` from client state.
  return (
    <>
      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_SECTION_TITLE}>ライブラリ</div>
        <ul className="list-none m-0 p-0">
          <li>
            <Link
              to="/"
              search={HOME_SEARCH}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
              activeOptions={{ exact: true }}
            >
              <span>すべてのノート</span>
            </Link>
          </li>
          <li>
            <Link
              to="/views"
              search={{ kind: "personal" }}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>保存ビュー</span>
            </Link>
          </li>
        </ul>
      </div>

      <DirectorySidebarSection tree={tree} />

      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_SECTION_TITLE}>管理</div>
        <ul className="list-none m-0 p-0">
          <li>
            <Link
              to="/tags"
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>タグ</span>
            </Link>
          </li>
          <li>
            <Link
              to="/trash"
              search={TRASH_SEARCH}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>ゴミ箱</span>
            </Link>
          </li>
          <li>
            <Link
              to="/exports"
              search={{ offset: 0 }}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>エクスポートジョブ</span>
            </Link>
          </li>
          <li>
            <Link
              to="/upload"
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>アップロード</span>
            </Link>
          </li>
        </ul>
      </div>
    </>
  );
}
