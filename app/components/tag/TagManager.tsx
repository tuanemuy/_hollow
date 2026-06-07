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

export async function TagManager({ user, q, sort, order }: Props) {
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
    <>
      <h1 className={PAGE_TITLE}>タグ管理</h1>
      <TagList
        tags={tagList}
        query={q}
        sort={sort ?? "name"}
        order={order ?? "asc"}
      />
    </>
  );
}
