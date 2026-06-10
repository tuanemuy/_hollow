import { Link } from "@tanstack/react-router";
import { HOME_SEARCH, TRASH_SEARCH } from "@/components/auth/links";
import { DirectorySidebarSection } from "@/components/directory/DirectorySidebarSection";
import {
  loadOwnedNotes,
  loadSavedViewsByKind,
} from "@/components/note/loaders";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadDirectoryTree } from "./action";
import {
  NAV_COUNT,
  NAV_ITEM,
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_TITLE,
  SIDEBAR_USER,
} from "./styles";
import { UserMenu } from "./UserMenu";

type Props = {
  user: UserDTO;
};

const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

// Cap the personal saved-view list shown inline in the sidebar; the rest are
// reachable via the "すべて表示" link to `/views`.
const SIDEBAR_SAVED_VIEW_LIMIT = 8;

export async function Sidebar({ user }: Props) {
  // Bundle the shell's data fetches so the extra count / saved-view reads do
  // not serialize behind the directory tree. `loadOwnedNotes` only needs the
  // `count` here, so the listing is fetched with the smallest page (`limit:
  // 1`); `cache()` dedups against any other caller on the same render.
  const [{ tree }, ownedNotes, { views: savedViews }] = await Promise.all([
    loadDirectoryTree(user.id),
    loadOwnedNotes({
      actorUserId: user.id,
      status: "active",
      page: 1,
      limit: 1,
    }),
    loadSavedViewsByKind({ actorUserId: user.id, kind: "personal" }),
  ]);
  const noteCount = ownedNotes.count;
  const visibleSavedViews = savedViews.slice(0, SIDEBAR_SAVED_VIEW_LIMIT);
  const hasMoreSavedViews = savedViews.length > SIDEBAR_SAVED_VIEW_LIMIT;

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
              <span className={NAV_COUNT}>{noteCount}</span>
            </Link>
          </li>
        </ul>
      </div>

      <DirectorySidebarSection tree={tree} />

      {savedViews.length > 0 ? (
        <div className={SIDEBAR_SECTION}>
          <div className={SIDEBAR_SECTION_TITLE}>保存したビュー</div>
          <ul className="list-none m-0 p-0">
            {visibleSavedViews.map((view) => (
              <li key={view.id}>
                <Link
                  to="/"
                  search={{ viewId: view.id }}
                  className={NAV_ITEM}
                  activeProps={ACTIVE_NAV_PROPS}
                >
                  <span className="truncate">{view.name}</span>
                </Link>
              </li>
            ))}
            {hasMoreSavedViews ? (
              <li>
                <Link
                  to="/views"
                  search={{ kind: "personal" }}
                  className={NAV_ITEM}
                  activeProps={ACTIVE_NAV_PROPS}
                >
                  <span>すべて表示</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_SECTION_TITLE}>管理</div>
        <ul className="list-none m-0 p-0">
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

      {/* User menu, relocated from the header to the sidebar foot (#628 ADR-003). */}
      <div className={SIDEBAR_USER}>
        <UserMenu user={user} />
      </div>
    </>
  );
}
