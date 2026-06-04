"use client";

import { useState } from "react";
import { SIDEBAR_SECTION } from "@/components/layout/styles";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import { CreateDirectoryDialog } from "./CreateDirectoryDialog";
import { DirectoryTree } from "./DirectoryTree";
import {
  SECTION_ACTION_BUTTON,
  SIDEBAR_SECTION_HEADER,
  SIDEBAR_SECTION_TITLE_INLINE,
} from "./styles";

export type DirectorySidebarSectionProps = Readonly<{
  /**
   * Forest from `loadDirectoryTree`. `tree[0]` is the implicit root
   * (ensured by `DirectoryService.ensureRoot` at signup).
   */
  tree: readonly DirectoryTreeNode[];
}>;

/**
 * Sidebar section that wraps the directory tree and adds the
 * "+ new directory" action button next to the section title.
 *
 * Lives as a client component so it can own the dialog state for the
 * "create at root" path, while the parent `Sidebar` stays a server
 * component (passes the freshly fetched tree as a serializable prop).
 */
export function DirectorySidebarSection({
  tree,
}: DirectorySidebarSectionProps) {
  // tree[0] is the implicit root (ensured by DirectoryService.ensureRoot).
  const rootId = tree[0]?.id;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className={SIDEBAR_SECTION}>
      <div className={SIDEBAR_SECTION_HEADER}>
        <div className={SIDEBAR_SECTION_TITLE_INLINE}>ディレクトリ</div>
        {rootId !== undefined ? (
          <button
            type="button"
            aria-label="ディレクトリを新規作成"
            className={SECTION_ACTION_BUTTON}
            onClick={() => setCreateOpen(true)}
          >
            <span aria-hidden="true">+</span>
          </button>
        ) : null}
      </div>
      <DirectoryTree tree={tree} />

      {rootId !== undefined ? (
        <CreateDirectoryDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          parentId={rootId}
          parentName="（ルート）"
        />
      ) : null}
    </div>
  );
}
