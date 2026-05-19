import { Link } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadDirectoryTree } from "./action";
import {
  APP_SIDEBAR,
  NAV_ITEM,
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_TITLE,
} from "./styles";

type Props = {
  user: UserDTO;
};

const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

function DirectoryNode({
  node,
  depth,
}: {
  node: DirectoryTreeNode;
  depth: number;
}) {
  return (
    <li>
      <Link
        to="/"
        // ADR-015: intentional filter-reset — only `directoryId` is set;
        // the rest of the filter slots fall back to schema defaults via
        // HOME_SEARCH so type-level required `page`/`limit` are satisfied.
        search={{ ...HOME_SEARCH, directoryId: node.id as unknown as string }}
        className={NAV_ITEM}
        activeProps={ACTIVE_NAV_PROPS}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <span>{node.name}</span>
      </Link>
      {node.children.length > 0 ? (
        <ul className="list-none m-0 p-0">
          {node.children.map((child) => (
            <DirectoryNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export async function Sidebar({ user }: Props) {
  const { tree } = await loadDirectoryTree(user.id);

  return (
    <aside className={APP_SIDEBAR}>
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
        </ul>
      </div>

      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_SECTION_TITLE}>ディレクトリ</div>
        {tree.length === 0 ? (
          <p className="px-3 text-[13px] text-ink-tertiary">
            まだディレクトリがありません
          </p>
        ) : (
          <ul className="list-none m-0 p-0">
            {tree.map((node) => (
              <DirectoryNode key={node.id} node={node} depth={0} />
            ))}
          </ul>
        )}
      </div>

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
              search={{ page: 1, limit: 20 }}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>ゴミ箱</span>
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
    </aside>
  );
}
