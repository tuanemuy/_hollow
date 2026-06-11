import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/ListPageSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { PAGE_TITLE } from "../layout/styles";
import { loadTagsForManager } from "./loaders";
import type { TagListOrder, TagListSort } from "./TagList";
import { TagList } from "./TagList";

type Props = {
  user: UserDTO;
  q: string | undefined;
  sort: TagListSort | undefined;
  order: TagListOrder | undefined;
};

/**
 * Tag management page shell (Issue #636). The static title renders
 * immediately; the data-dependent list streams behind its own
 * `<Suspense>` boundary so a slow / failing tag load no longer blocks
 * or breaks the whole page.
 */
export function TagManager({ user, q, sort, order }: Props) {
  return (
    <>
      <h1 className={PAGE_TITLE}>タグ管理</h1>
      <SectionErrorBoundary section="タグ一覧">
        <Suspense fallback={<ListPageSkeleton ariaLabel="タグを読み込み中" />}>
          <TagListSection user={user} q={q} sort={sort} order={order} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  );
}

async function TagListSection({ user, q, sort, order }: Props) {
  const { tags } = await loadTagsForManager(user.id, {
    query: q,
    sort,
    order,
  });

  // The variable count, create form and list are lifted into the client
  // `TagList` so optimistic rename / delete reflect immediately (count and
  // candidates included). The static page title stays in this RSC.
  const tagList = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    noteCount: tag.noteCount,
    lastUsedAt: tag.lastUsedAt,
  }));

  return (
    <TagList
      tags={tagList}
      query={q}
      sort={sort ?? "name"}
      order={order ?? "asc"}
    />
  );
}
