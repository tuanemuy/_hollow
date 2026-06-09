"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Hash } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import { EMPTY_STATE, EMPTY_STATE_ICON, PAGE_SUBTITLE } from "../layout/styles";
import { createTagFn, deleteTagFn, mergeTagsFn, renameTagFn } from "./actions";
import { CreateTagForm } from "./CreateTagForm";
import { TAG_COUNT, TAG_LASTUSED, TAG_ROW } from "./styles";
import { TagActions } from "./TagActions";
import { TagListToolbar } from "./TagListToolbar";

export type TagListSort = "name" | "noteCount" | "createdAt" | "lastUsedAt";
export type TagListOrder = "asc" | "desc";

type Tag = Readonly<{
  id: string;
  name: string;
  noteCount: number;
  lastUsedAt: string | null;
}>;

type Props = {
  tags: readonly Tag[];
  query: string | undefined;
  sort: TagListSort;
  order: TagListOrder;
};

/**
 * Local last-used formatter. There is no shared date helper —
 * `trash/TrashList` and `note/NoteMetaPanel` each carry their own — so this
 * matches `TrashList`'s `ja-JP` short-date format (no time component).
 */
function formatLastUsed(iso: string | null): string {
  if (iso === null) return "未使用";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未使用";
  return `最終使用 ${d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })}`;
}

type AddAction = Readonly<{ type: "add"; tag: Tag }>;
type RemoveAction = Readonly<{ type: "remove"; id: string }>;
type RenameAction = Readonly<{ type: "rename"; id: string; name: string }>;
type TagsAction = AddAction | RemoveAction | RenameAction;

export function reduceTags(
  cur: readonly Tag[],
  action: TagsAction,
): readonly Tag[] {
  switch (action.type) {
    case "add":
      // Append the optimistic row (client-generated temp id, noteCount 0,
      // lastUsedAt null). The transition snaps `useOptimistic` back to the
      // server baseline once the loader re-runs, so this temp row is replaced
      // by the confirmed one — never displayed alongside it (ADR-002).
      return [...cur, action.tag];
    case "remove":
      return cur.filter((tag) => tag.id !== action.id);
    case "rename":
      // Only the name changes; the spread keeps `noteCount` / `lastUsedAt`
      // so candidates / merge counts and the last-used column stay accurate
      // while the rename is in flight.
      return cur.map((tag) =>
        tag.id === action.id ? { ...tag, name: action.name } : tag,
      );
  }
}

export function TagList({ tags, query, sort, order }: Props) {
  const router = useRouter();
  const createTag = useServerFn(createTagFn);
  const renameTag = useServerFn(renameTagFn);
  const removeTag = useServerFn(deleteTagFn);
  const mergeTags = useServerFn(mergeTagsFn);

  // Server-confirmed baseline. `useOptimistic` adds / removes / renames a tag
  // synchronously while the mutation + loader round-trip is in flight, then
  // snaps back once fresh props arrive. Hooks run before the empty-list early
  // return so the empty / count checks use the optimistic projection.
  const [optimisticTags, applyOptimistic] = useOptimistic(tags, reduceTags);
  const [, startMutation] = useTransition();
  // Rename / delete / merge errors are owned by the parent (the affected row
  // unmounts mid-flight) and surfaced in the affected row's `FORM_ERROR` slot.
  const [actionErrorId, setActionErrorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<SerializedError | null>(null);
  // The create form's row is not yet committed, so its error lives under the
  // form rather than in a row's slot (ADR-002).
  const [createError, setCreateError] = useState<SerializedError | null>(null);

  const onCreate = (name: string) => {
    setCreateError(null);
    // Client-generated temp id, never colliding with a server id; replaced by
    // the confirmed row when the transition snaps back to baseline.
    const tmpId = `tmp-${crypto.randomUUID()}`;
    startMutation(async () => {
      try {
        applyOptimistic({
          type: "add",
          tag: { id: tmpId, name, noteCount: 0, lastUsedAt: null },
        });
        await createTag({ data: { name } });
        await routerInvalidate(router);
      } catch (e) {
        // The optimistic row vanishes on snap-back; the error surfaces under
        // the form.
        setCreateError(extractSerializedError(e));
      }
    });
  };

  const onRename = (tagId: string, name: string) => {
    setActionErrorId(null);
    setActionError(null);
    startMutation(async () => {
      try {
        applyOptimistic({ type: "rename", id: tagId, name });
        await renameTag({ data: { tagId, newName: name } });
        await routerInvalidate(router);
      } catch (e) {
        setActionErrorId(tagId);
        setActionError(extractSerializedError(e));
      }
    });
  };

  const onDelete = (tagId: string) => {
    setActionErrorId(null);
    setActionError(null);
    startMutation(async () => {
      try {
        applyOptimistic({ type: "remove", id: tagId });
        await removeTag({ data: { tagId } });
        await routerInvalidate(router);
      } catch (e) {
        setActionErrorId(tagId);
        setActionError(extractSerializedError(e));
      }
    });
  };

  const onMerge = (sourceTagId: string, targetTagId: string) => {
    setActionErrorId(null);
    setActionError(null);
    startMutation(async () => {
      try {
        // Merge removes the source tag (its notes move to the target), so the
        // optimistic projection is the same `remove` used by delete (ADR-003).
        applyOptimistic({ type: "remove", id: sourceTagId });
        await mergeTags({ data: { sourceTagId, targetTagId } });
        await routerInvalidate(router);
      } catch (e) {
        setActionErrorId(sourceTagId);
        setActionError(extractSerializedError(e));
      }
    });
  };

  const all = optimisticTags.map((tag) => ({ id: tag.id, name: tag.name }));
  // A search term applied with no matches is a normal flow, distinct from a
  // never-created tag catalogue — branch the empty state on it.
  const isSearchMiss = query !== undefined && optimisticTags.length === 0;

  return (
    <>
      {/* Stats sit in the `page-header` block (mock `--space-6` bottom margin),
          overriding the shared `PAGE_SUBTITLE` `mb-7` so the form / toolbar
          rhythm below matches the SSOT (`--space-5` each). */}
      <p className={`${PAGE_SUBTITLE} !mb-6`}>
        {optimisticTags.length} 件のタグ
      </p>

      <CreateTagForm onCreate={onCreate} error={createError} />

      <TagListToolbar query={query} sort={sort} order={order} />

      {/* The toolbar's `mb-5` already supplies the gap above the list, so the
          shared `EMPTY_STATE` `mt-6` is cancelled to avoid a doubled margin
          (mock `.tag-list` sits directly under `.tag-toolbar`). */}
      {optimisticTags.length === 0 ? (
        <div className={`${EMPTY_STATE} !mt-0`}>
          <Icon icon={Hash} size={24} className={EMPTY_STATE_ICON} />
          {isSearchMiss ? (
            <>
              <h2 className="text-xl font-medium text-ink mb-2">
                一致するタグが見つかりません
              </h2>
              <p className="text-sm mb-4">
                「{query}
                」に一致するタグはありません。検索語を変えてみてください。
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-medium text-ink mb-2">
                タグがまだありません
              </h2>
              <p className="text-sm mb-4">
                本文中で `#tagname` と書くか、上のフォームから追加できます。
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="list-none m-0 p-0">
          {optimisticTags.map((tag) => {
            const candidates = all.filter((t) => t.id !== tag.id);
            return (
              <li key={tag.id} className={TAG_ROW}>
                <div className="group-has-[[data-editing]]:hidden">
                  <div className="font-medium">#{tag.name}</div>
                  <div className={TAG_COUNT}>{tag.noteCount} 件のノート</div>
                  <div className={TAG_LASTUSED}>
                    {formatLastUsed(tag.lastUsedAt)}
                  </div>
                </div>
                <TagActions
                  tagId={tag.id}
                  name={tag.name}
                  noteCount={tag.noteCount}
                  candidates={candidates}
                  onRename={onRename}
                  onDelete={onDelete}
                  onMerge={onMerge}
                  actionError={actionErrorId === tag.id ? actionError : null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
