import type { UserDTO } from "@/core/application/dto/identity";
import { PAGE_TITLE } from "../layout/styles";
import { loadTagsForOwner } from "./loaders";
import { TagList } from "./TagList";

type Props = {
  user: UserDTO;
};

export async function TagManager({ user }: Props) {
  const { tags } = await loadTagsForOwner(user.id);

  // The variable count, create form and list are lifted into the client
  // `TagList` so optimistic rename / delete reflect immediately (count and
  // candidates included). The static page title stays in this RSC.
  const tagList = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    noteCount: tag.noteCount,
  }));

  return (
    <>
      <h1 className={PAGE_TITLE}>タグ管理</h1>
      <TagList tags={tagList} />
    </>
  );
}
