import type { UserDTO } from "@/core/application/dto/identity";
import {
  DATA_ROW,
  EMPTY_STATE,
  PAGE_SUBTITLE,
  PAGE_TITLE,
} from "../layout/styles";
import { CreateTagForm } from "./CreateTagForm";
import { loadTagsForOwner } from "./loaders";
import { TagActions } from "./TagActions";

type Props = {
  user: UserDTO;
};

export async function TagManager({ user }: Props) {
  const { tags } = await loadTagsForOwner(user.id);

  return (
    <>
      <h1 className={PAGE_TITLE}>タグ管理</h1>
      <p className={PAGE_SUBTITLE}>{tags.length} 件のタグ</p>

      <CreateTagForm />

      {tags.length === 0 ? (
        <div className={EMPTY_STATE}>
          <h2 className="text-xl font-medium text-ink mb-2">
            タグがまだありません
          </h2>
          <p className="text-sm mb-4">
            本文中で `#tagname` と書くか、上のフォームから追加できます。
          </p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 mt-6">
          {(() => {
            const all = tags.map((t) => ({
              id: t.id as unknown as string,
              name: t.name,
            }));
            return tags.map((tag, index) => {
              const self = all[index];
              if (self === undefined) return null;
              const candidates = all.filter((t) => t.id !== self.id);
              return (
                <li key={self.id} className={DATA_ROW}>
                  <div>
                    <div className="font-medium">#{tag.name}</div>
                    <div className="text-[13px] text-ink-tertiary">
                      {tag.noteCount} 件のノート
                    </div>
                  </div>
                  <TagActions
                    tagId={self.id}
                    name={tag.name}
                    noteCount={tag.noteCount}
                    candidates={candidates}
                  />
                </li>
              );
            });
          })()}
        </ul>
      )}
    </>
  );
}
