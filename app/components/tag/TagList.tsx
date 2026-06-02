"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Hash } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import {
  DATA_ROW,
  EMPTY_STATE,
  EMPTY_STATE_ICON,
  PAGE_SUBTITLE,
} from "../layout/styles";
import { deleteTagFn, renameTagFn } from "./actions";
import { CreateTagForm } from "./CreateTagForm";
import { TagActions } from "./TagActions";

type Tag = Readonly<{ id: string; name: string; noteCount: number }>;

type Props = {
  tags: readonly Tag[];
};

type RemoveAction = Readonly<{ type: "remove"; id: string }>;
type RenameAction = Readonly<{ type: "rename"; id: string; name: string }>;
type TagsAction = RemoveAction | RenameAction;

export function reduceTags(cur: readonly Tag[], action: TagsAction): readonly Tag[] {
  switch (action.type) {
    case "remove":
      return cur.filter((tag) => tag.id !== action.id);
    case "rename":
      // Only the name changes; keep `noteCount` so candidates / merge source
      // counts stay accurate while the rename is in flight.
      return cur.map((tag) =>
        tag.id === action.id ? { ...tag, name: action.name } : tag,
      );
  }
}

export function TagList({ tags }: Props) {
  const router = useRouter();
  const renameTag = useServerFn(renameTagFn);
  const removeTag = useServerFn(deleteTagFn);

  // Server-confirmed baseline. `useOptimistic` removes / renames a tag
  // synchronously while the mutation + loader round-trip is in flight, then
  // snaps back once fresh props arrive. Hooks run before the empty-list early
  // return so the empty / count checks use the optimistic projection.
  const [optimisticTags, applyOptimistic] = useOptimistic(tags, reduceTags);
  const [, startMutation] = useTransition();
  // Rename / delete errors are owned by the parent (the deleted row unmounts
  // mid-flight) and surfaced in the affected row's `FORM_ERROR` slot.
  const [actionErrorId, setActionErrorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<SerializedError | null>(null);

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

  const all = optimisticTags.map((tag) => ({ id: tag.id, name: tag.name }));

  return (
    <>
      <p className={PAGE_SUBTITLE}>{optimisticTags.length} 件のタグ</p>

      <CreateTagForm />

      {optimisticTags.length === 0 ? (
        <div className={EMPTY_STATE}>
          <Icon icon={Hash} size={24} className={EMPTY_STATE_ICON} />
          <h2 className="text-xl font-medium text-ink mb-2">
            タグがまだありません
          </h2>
          <p className="text-sm mb-4">
            本文中で `#tagname` と書くか、上のフォームから追加できます。
          </p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 mt-6">
          {optimisticTags.map((tag) => {
            const candidates = all.filter((t) => t.id !== tag.id);
            return (
              <li key={tag.id} className={DATA_ROW}>
                <div>
                  <div className="font-medium">#{tag.name}</div>
                  <div className="text-[13px] text-ink-tertiary">
                    {tag.noteCount} 件のノート
                  </div>
                </div>
                <TagActions
                  tagId={tag.id}
                  name={tag.name}
                  noteCount={tag.noteCount}
                  candidates={candidates}
                  onRename={onRename}
                  onDelete={onDelete}
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
