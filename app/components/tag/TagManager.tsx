import type { UserDTO } from "@/core/application/dto/identity";
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
      <h1 className="page-title">タグ管理</h1>
      <p className="page-subtitle">{tags.length} 件のタグ</p>

      <CreateTagForm />

      {tags.length === 0 ? (
        <div className="empty-state">
          <h2>タグがまだありません</h2>
          <p>本文中で `#tagname` と書くか、上のフォームから追加できます。</p>
        </div>
      ) : (
        <ul style={{ marginTop: "var(--space-6)" }}>
          {tags.map((tag) => (
            <li key={tag.id as unknown as string} className="data-row">
              <div>
                <div style={{ fontWeight: "var(--weight-medium)" }}>
                  #{tag.name}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--color-ink-tertiary)",
                  }}
                >
                  {tag.noteCount} 件のノート
                </div>
              </div>
              <TagActions tagId={tag.id as unknown as string} name={tag.name} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
