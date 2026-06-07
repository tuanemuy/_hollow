import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, Trash2 } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import { pillBtn } from "@/components/common/styles";
import { loadOwnedNotes } from "@/components/note/loaders";
import type { UserDTO } from "@/core/application/dto/identity";
import {
  EMPTY_STATE,
  EMPTY_STATE_ICON,
  PAGE_SUBTITLE,
  PAGE_TITLE,
} from "../layout/styles";
import { TrashRowActions } from "./TrashRowActions";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function TrashList({ user, page, limit }: Props) {
  // Trash always uses the filter path (no `q`), so we narrow eagerly
  // here; the discriminant is checked rather than blindly asserted so
  // a future search-on-trash extension would be caught.
  const result = await loadOwnedNotes({
    actorUserId: user.id,
    status: "trashed",
    page,
    limit,
  });
  if (result.kind !== "filter") {
    throw new Error("TrashList: expected filter-kind OwnedNotesResult");
  }
  const { notes, count } = result;

  return (
    <>
      <h1 className={PAGE_TITLE}>ゴミ箱</h1>
      <p className={PAGE_SUBTITLE}>{count} 件のノートがゴミ箱にあります。</p>

      <div
        role="note"
        className="flex items-start gap-2 px-4 py-3 rounded-md bg-surface mb-6 text-sm text-ink-secondary leading-snug"
      >
        <Icon
          icon={Clock}
          size={16}
          className="shrink-0 mt-px text-ink-tertiary"
        />
        <span>
          <strong className="font-medium text-ink">
            保存期間を過ぎたノートは自動的に完全削除されます。
          </strong>{" "}
          残しておきたいノートは「復元」で元のディレクトリに戻せます。
        </span>
      </div>

      {notes.length === 0 ? (
        <div className={EMPTY_STATE}>
          <Icon icon={Trash2} size={24} className={EMPTY_STATE_ICON} />
          <h2 className="text-xl font-medium text-ink mb-2">ゴミ箱は空です</h2>
          <p className="text-sm mb-4">削除したノートはここに表示されます。</p>
          <Link to="/" search={HOME_SEARCH} className={pillBtn}>
            <Icon icon={ArrowLeft} />
            すべてのノートに戻る
          </Link>
        </div>
      ) : (
        <ul className="mt-2 list-none p-0 m-0">
          {notes.map((note) => (
            <li
              key={note.id}
              className="grid grid-cols-[1fr_auto] gap-4 px-3 py-5 border-t border-hairline transition-colors motion-reduce:transition-none items-start hover:bg-surface"
            >
              <div className="min-w-0">
                <div className="text-base font-medium text-ink tracking-[-0.01em] mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: note.id }}
                    className="text-inherit hover:text-accent"
                  >
                    {note.title}
                  </Link>
                </div>
                {note.excerpt.length > 0 ? (
                  <div className="text-sm text-ink-secondary leading-[1.45] overflow-hidden mb-1.5 [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]">
                    {note.excerpt}
                  </div>
                ) : null}
                <div className="text-sm text-ink-tertiary flex items-center gap-2.5 flex-wrap">
                  <span>削除日 {formatDate(note.updatedAt)}</span>
                </div>
              </div>
              <TrashRowActions noteId={note.id} noteTitle={note.title} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
