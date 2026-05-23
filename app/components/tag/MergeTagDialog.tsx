"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { mergeTagsFn } from "./actions";
import { progressBarIndeterminate, progressTrack } from "./styles";

type Props = {
  sourceTagId: string;
  sourceName: string;
  sourceNoteCount: number;
  candidates: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
};

const DIALOG_DESCRIPTION = "text-[13px] text-ink-secondary mt-2";

export function MergeTagDialog({
  sourceTagId,
  sourceName,
  sourceNoteCount,
  candidates,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const mergeTags = useServerFn(mergeTagsFn);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetId = useId();

  const targetTag = candidates.find((c) => c.id === target);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === "") return;
    setError(null);
    startTransition(async () => {
      try {
        await mergeTags({
          data: { sourceTagId, targetTagId: target },
        });
        await router.invalidate();
        onClose();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel="タグを統合"
      closable={!isPending}
    >
      <form onSubmit={submit} aria-busy={isPending}>
        <h2 className={dialogTitle}>タグを統合</h2>
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
        {error !== null ? (
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        {isPending && sourceNoteCount > 0 ? (
          <div className="mt-3">
            <span aria-live="polite" className="text-[13px] text-ink-secondary">
              <strong>{sourceNoteCount} 件のノートを更新中…</strong>
            </span>
            <div
              role="progressbar"
              aria-busy={true}
              aria-valuemin={0}
              aria-valuemax={sourceNoteCount}
              // biome-ignore lint/a11y/useValidAriaValues: indeterminate progressbar omits aria-valuenow attribute (React skips undefined props) — see .issue/55/adr.md ADR-002
              aria-valuenow={undefined}
              aria-label={`${sourceNoteCount} 件のノートを更新中`}
              className={progressTrack}
            >
              <div className={progressBarIndeterminate} />
            </div>
          </div>
        ) : null}
        <div className={dialogActions}>
          <button
            type="button"
            className={pillBtn}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            disabled={isPending || target === ""}
          >
            {isPending ? "統合中..." : "統合"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
