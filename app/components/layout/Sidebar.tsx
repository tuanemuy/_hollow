import { Link } from "@tanstack/react-router";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadDirectoryTree } from "./action";

type Props = {
  user: UserDTO;
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
        className="nav-item"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <span>{node.name}</span>
      </Link>
      {node.children.length > 0 ? (
        <ul>
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
    <aside className="app-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-title">ライブラリ</div>
        <ul>
          <li>
            <Link to="/" className="nav-item">
              <span>すべてのノート</span>
            </Link>
          </li>
        </ul>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">ディレクトリ</div>
        {tree.length === 0 ? (
          <p
            style={{
              padding: "0 12px",
              fontSize: "13px",
              color: "var(--color-ink-tertiary)",
            }}
          >
            まだディレクトリがありません
          </p>
        ) : (
          <ul>
            {tree.map((node) => (
              <DirectoryNode key={node.id} node={node} depth={0} />
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">管理</div>
        <ul>
          <li>
            <Link to="/tags" className="nav-item">
              <span>タグ</span>
            </Link>
          </li>
          <li>
            <Link
              to="/trash"
              search={{ page: 1, limit: 20 }}
              className="nav-item"
            >
              <span>ゴミ箱</span>
            </Link>
          </li>
          <li>
            <Link to="/upload" className="nav-item">
              <span>アップロード</span>
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
