"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
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

type Props = {
  sourceTagId: string;
  sourceName: string;
  candidates: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
};

const DIALOG_DESCRIPTION = "text-[13px] text-ink-secondary mt-2";

export function MergeTagDialog({
  sourceTagId,
  sourceName,
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
      <form onSubmit={submit}>
        <h2 className="text-lg font-medium mb-4">タグを統合</h2>
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
            #{sourceName} を #{targetTag.name} に統合します。#{sourceName}{" "}
            は削除され、参照ノートは #{targetTag.name} を持つよう更新されます。
          </p>
        ) : null}
        {error !== null ? (
          <p className={FORM_ERROR} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        <div className="inline-flex gap-2 mt-4 justify-end w-full">
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
    </Dialog>
  );
}
