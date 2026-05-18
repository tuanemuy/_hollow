"use client";

import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { createSavedViewFn } from "@/components/view/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import type { NoteListSearch } from "../schema";
import { searchToViewQuery } from "./listSelectors";

type Props = {
  open: boolean;
  onClose: () => void;
  search: NoteListSearch;
};

export function SaveViewDialog({ open, onClose, search }: Props) {
  const create = useServerFn(createSavedViewFn);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"personal" | "public">("personal");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();

  if (!open) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    setError(null);
    const payload = searchToViewQuery(search);
    startTransition(async () => {
      try {
        await create({
          data: {
            name: name.trim(),
            kind,
            query: {
              tagNames: [...payload.query.tagNames],
              directoryId: payload.query.directoryId,
              dateRange: payload.query.dateRange,
              keyword: payload.query.keyword,
              referencingNoteId: payload.query.referencingNoteId ?? null,
              visibilityFilter: [...payload.query.visibilityFilter],
            },
            displayMode: payload.displayMode,
            calendarDateKey: "updated",
            sort: { by: "updatedAt", direction: "desc" },
            isDefault: false,
          },
        });
        setName("");
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
      aria-label="ビューとして保存"
    >
      <form className="dialog" onSubmit={submit}>
        <h2 className="dialog-title">現在のフィルタをビューとして保存</h2>
        <div className="field">
          <label htmlFor={nameId}>名前</label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </div>
        <fieldset className="field">
          <legend>公開範囲</legend>
          <label className="radio-row">
            <input
              type="radio"
              name="view-kind"
              checked={kind === "personal"}
              onChange={() => setKind("personal")}
            />
            個人用
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="view-kind"
              checked={kind === "public"}
              onChange={() => setKind("public")}
            />
            インスタンス内で共有
          </label>
        </fieldset>
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
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
