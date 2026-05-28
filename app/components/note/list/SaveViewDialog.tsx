"use client";

import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
  radioRow,
} from "@/components/common/styles";
import { createSavedViewFn } from "@/components/view/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import type { NoteListSearch } from "../schema";
import { searchToViewQuery, selectDisplay } from "./listSelectors";

const homeRoute = getRouteApi("/_app/");

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
  const titleId = useId();
  // `search.display` is stale here because Issue #219 excluded `display`
  // from the home `loaderDeps`, so the server-rendered `search` prop is
  // pinned to the value at first load. Read the latest mode from the URL
  // directly so saving from tile / calendar persists the correct
  // `displayMode`.
  const displayMode = homeRoute.useSearch({ select: selectDisplay });

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
            displayMode,
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
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!isPending}
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          現在のフィルタをビューとして保存
        </h2>
        <div className={field}>
          <label htmlFor={nameId} className={fieldLabel}>
            名前
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            className={fieldControl}
          />
        </div>
        <fieldset className={field}>
          <legend className={fieldLabel}>公開範囲</legend>
          <label className={radioRow}>
            <input
              type="radio"
              name="view-kind"
              checked={kind === "personal"}
              onChange={() => setKind("personal")}
            />
            個人用
          </label>
          <label className={radioRow}>
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
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
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
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
