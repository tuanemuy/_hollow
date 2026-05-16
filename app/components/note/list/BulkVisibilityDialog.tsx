"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { bulkChangeVisibilityFn } from "@/components/publication/PublishSettings/action";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { useSelection } from "./SelectionContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Visibility = "private" | "unlisted" | "public";

export function BulkVisibilityDialog({ open, onClose }: Props) {
  const router = useRouter();
  const bulk = useServerFn(bulkChangeVisibilityFn);
  const { state, dispatch } = useSelection();
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [error, setError] = useState<SerializedError | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const radioName = useId();

  if (!open) return null;

  const ids = [...state.ids];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ids.length === 0) return;
    setError(null);
    setBatchError(null);
    setProgress(`${ids.length} 件処理中…`);
    startTransition(async () => {
      try {
        const result = await bulk({
          data: { noteIds: ids, nextVisibility: visibility },
        });
        setProgress(null);
        if (result.failures.length > 0) {
          setBatchError(
            `${result.successCount} 件成功、${result.failures.length} 件失敗`,
          );
        }
        dispatch({ type: "clear" });
        await router.invalidate();
        onClose();
      } catch (e) {
        setProgress(null);
        const err = extractSerializedError(e);
        if (
          err.kind === "validation" &&
          err.fieldErrors?.noteIds !== undefined
        ) {
          setBatchError("一度に変更できるのは 100 件までです");
        } else {
          setError(err);
        }
      }
    });
  };

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="公開設定を一括変更"
    >
      <form className="dialog" onSubmit={submit}>
        <h2 className="dialog-title">
          {ids.length} 件のノートの公開設定を変更
        </h2>
        <fieldset className="field">
          <legend>新しい公開状態</legend>
          {(["private", "unlisted", "public"] as const).map((v) => (
            <label key={v} className="radio-row">
              <input
                type="radio"
                name={radioName}
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              <span>
                {v === "private"
                  ? "非公開"
                  : v === "unlisted"
                    ? "限定公開"
                    : "公開"}
              </span>
            </label>
          ))}
        </fieldset>
        {progress !== null ? (
          <p className="form-progress" aria-live="polite">
            {progress}
          </p>
        ) : null}
        {error !== null ? (
          <p className="form-error" role="alert">
            {displayError(error)}
          </p>
        ) : null}
        {batchError !== null ? (
          <p className="form-error" role="alert">
            {batchError}
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
            disabled={isPending}
          >
            {isPending ? "適用中..." : "適用"}
          </button>
        </div>
      </form>
    </div>
  );
}
