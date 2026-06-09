"use client";

import { useId, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  fieldControl,
  fieldLabel,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";

type Props = {
  sourceTagId: string;
  sourceName: string;
  sourceNoteCount: number;
  candidates: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  // Merge is owned by the parent `TagList`'s optimistic projection (same
  // `remove` used by delete, ADR-003). The dialog is now just the target
  // selector: it closes and hands off, surfacing failures in the row's
  // `FORM_ERROR` slot after the optimistic remove snaps back.
  onMerge: (sourceTagId: string, targetTagId: string) => void;
};

const DIALOG_DESCRIPTION = "text-sm text-ink-secondary mt-2";

export function MergeTagDialog({
  sourceTagId,
  sourceName,
  sourceNoteCount,
  candidates,
  open,
  onClose,
  onMerge,
}: Props) {
  const [target, setTarget] = useState("");
  const targetId = useId();
  const titleId = useId();

  const targetTag = candidates.find((c) => c.id === target);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === "") return;
    // Close synchronously and hand off; the source row is removed optimistically
    // the instant the parent transition starts (this dialog unmounts with it),
    // mirroring `runDelete`.
    onClose();
    onMerge(sourceTagId, target);
  };

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy={titleId}>
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          タグを統合
        </h2>
        <div className="flex flex-col gap-2 mb-4">
          <label htmlFor={targetId} className={fieldLabel}>
            統合先タグ
          </label>
          <select
            id={targetId}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            className={fieldControl}
          >
            <option value="">— 選択してください —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </div>
        {targetTag !== undefined ? (
          <p className={DIALOG_DESCRIPTION}>
            #{sourceName} を #{targetTag.name} に統合します。
            {sourceNoteCount > 0 ? (
              <>
                {" "}
                <strong>対象ノート: {sourceNoteCount} 件</strong>。
              </>
            ) : null}{" "}
            #{sourceName} は削除され、参照ノートは #{targetTag.name}{" "}
            を持つよう更新されます。
          </p>
        ) : null}
        <div className={dialogActions}>
          <button type="button" className={pillBtn} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="submit"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            disabled={target === ""}
          >
            統合
          </button>
        </div>
      </form>
    </Dialog>
  );
}
