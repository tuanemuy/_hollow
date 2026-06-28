import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { HOME_SEARCH, TRASH_SEARCH } from "@/components/auth/links";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { Skeleton } from "@/components/common/Skeleton";
import { DirectorySidebarSection } from "@/components/directory/DirectorySidebarSection";
import {
  loadOwnedNotes,
  loadSavedViewsByKind,
} from "@/components/note/loaders";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadDirectoryTree } from "./action";
import {
  ACTIVE_NAV_PROPS,
  NAV_COUNT,
  NAV_ITEM,
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_TITLE,
  SIDEBAR_USER,
} from "./styles";
import { UploadNavItem } from "./UploadNavItem";
import { UserMenu } from "./UserMenu";

type Props = {
  user: UserDTO;
};

// Cap the personal saved-view list shown inline in the sidebar; the rest are
// reachable via the "すべて表示" link to `/views`.
const SIDEBAR_SAVED_VIEW_LIMIT = 8;

/**
 * Sidebar shell (mock P10 boundaries ①②). The static 管理 nav
 * and user menu render immediately; the directory tree (which carries the
 * "すべてのノート" count — same boundary, no third system) and saved views
 * each stream behind their own `<Suspense>` + `SectionErrorBoundary`.
 * `scope="shell"` makes the retry button invalidate the `_app` loader that
 * feeds this component.
 */
export function Sidebar({ user }: Props) {
  // The positioned `<aside>` (drawer on mobile, sticky column on desktop)
  // is provided by `AppShellDrawer`; this component renders only the inner
  // sections so the drawer can drive `data-open` from client state.
  return (
    <>
      <SectionErrorBoundary section="ディレクトリ" scope="shell">
        <Suspense
          fallback={
            <Skeleton
              bars={["w-3/5", "w-2/5", "w-1/3", "w-1/2", "w-3/5"]}
              ariaLabel="ディレクトリを読み込み中"
              className={SIDEBAR_SECTION}
            />
          }
        >
          <DirectoryTreeSection userId={user.id} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="保存したビュー" scope="shell">
        {/* Deliberately a single short bar: the resolved section renders
            nothing when there are no saved views, so the fallback is kept
            minimal to limit the skeleton→nothing layout shift. */}
        <Suspense
          fallback={
            <Skeleton
              bars={["w-1/2"]}
              ariaLabel="保存したビューを読み込み中"
              className={SIDEBAR_SECTION}
            />
          }
        >
          <SavedViewsSection userId={user.id} />
        </Suspense>
      </SectionErrorBoundary>

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
            <UploadNavItem />
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

async function DirectoryTreeSection({ userId }: Readonly<{ userId: string }>) {
  // `loadOwnedNotes` only needs the `count` here, so the listing is fetched
  // with the smallest page (`limit: 1`); `cache()` dedups against any other
  // caller on the same render.
  const [{ tree }, ownedNotes] = await Promise.all([
    loadDirectoryTree(userId),
    loadOwnedNotes({
      actorUserId: userId,
      status: "active",
      page: 1,
      limit: 1,
    }),
  ]);
  const noteCount = ownedNotes.count;

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
    </>
  );
}

async function SavedViewsSection({ userId }: Readonly<{ userId: string }>) {
  const { views: savedViews } = await loadSavedViewsByKind({
    actorUserId: userId,
    kind: "personal",
  });
  if (savedViews.length === 0) return null;

  const visibleSavedViews = savedViews.slice(0, SIDEBAR_SAVED_VIEW_LIMIT);
  const hasMoreSavedViews = savedViews.length > SIDEBAR_SAVED_VIEW_LIMIT;

  return (
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
  );
}
