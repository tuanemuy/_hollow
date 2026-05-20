"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  FIELD_INPUT,
  FIELD_LABEL,
  FORM_ERROR,
  PILL_BTN,
} from "../layout/styles";
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

const DIALOG_BACKDROP =
  "fixed inset-0 z-[100] bg-black/35 flex items-center justify-center p-4";
const DIALOG =
  "bg-bg rounded-lg p-6 max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-[0_16px_32px_rgba(0,0,0,0.15)]";
const DIALOG_TITLE = "text-lg font-medium mb-4";
const DIALOG_ACTIONS = "inline-flex gap-2 mt-4 justify-end w-full";
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

  if (!open) return null;

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
    <div
      className={DIALOG_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-label="タグを統合"
    >
      <form className={DIALOG} onSubmit={submit} aria-busy={isPending}>
        <h2 className={DIALOG_TITLE}>タグを統合</h2>
        <div className="flex flex-col gap-2 mb-4">
          <label htmlFor={targetId} className={FIELD_LABEL}>
            統合先タグ
          </label>
          <select
            id={targetId}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            className={FIELD_INPUT}
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
            #{sourceName}
            {sourceNoteCount > 0 ? (
              <>
                （<strong>対象ノート: {sourceNoteCount} 件</strong>）
              </>
            ) : null}{" "}
            を #{targetTag.name} に統合します。#{sourceName}{" "}
            は削除され、参照ノートは #{targetTag.name} を持つよう更新されます。
          </p>
        ) : null}
        {error !== null ? (
          <p className={FORM_ERROR} role="alert">
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
              aria-busy="true"
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
        <div className={DIALOG_ACTIONS}>
          <button
            type="button"
            className={PILL_BTN}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={PILL_BTN}
            data-primary=""
            disabled={isPending || target === ""}
          >
            {isPending ? "統合中..." : "統合"}
          </button>
        </div>
      </form>
    </div>
  );
}
