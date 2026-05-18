"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { mergeTagsFn } from "./actions";

type Props = {
  sourceTagId: string;
  sourceName: string;
  candidates: readonly { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
};

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
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="タグを統合"
    >
      <form className="dialog" onSubmit={submit}>
        <h2 className="dialog-title">タグを統合</h2>
        <div className="field">
          <label htmlFor={targetId}>統合先タグ</label>
          <select
            id={targetId}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
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
          <p
            style={{
              fontSize: 13,
              color: "var(--color-ink-secondary)",
            }}
          >
            #{sourceName} を #{targetTag.name} に統合します。#{sourceName}{" "}
            は削除され、参照ノートは #{targetTag.name} を持つよう更新されます。
          </p>
        ) : null}
        {error !== null ? (
          <p className="form-error" role="alert">
            {displayError(error)}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button
            type="button"
            className="pill-btn"
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="pill-btn primary"
            disabled={isPending || target === ""}
          >
            {isPending ? "統合中..." : "統合"}
          </button>
        </div>
      </form>
    </div>
  );
}
