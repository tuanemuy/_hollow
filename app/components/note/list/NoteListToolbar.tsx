"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useState, useTransition } from "react";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";
import { DisplayModeSwitch } from "./DisplayModeSwitch";
import { SaveViewDialog } from "./SaveViewDialog";

type Props = {
  display: DisplayMode;
  search: NoteListSearch;
  savedViews: readonly SavedViewDTO[];
  hasAnyFilter: boolean;
};

export function NoteListToolbar({
  display,
  search,
  savedViews,
  hasAnyFilter,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSelectView = (viewId: string) => {
    if (viewId === "") {
      startTransition(() => {
        router.navigate({
          to: "/",
          search: (prev: NoteListSearch) => ({
            display: prev.display,
            page: prev.page,
            limit: prev.limit,
          }),
        });
      });
      return;
    }
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          page: prev.page,
          limit: prev.limit,
          viewId,
        }),
      });
    });
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <DisplayModeSwitch current={display} />
          {savedViews.length > 0 ? (
            <select
              aria-label="保存済みビュー"
              value={search.viewId ?? ""}
              onChange={(e) => onSelectView(e.target.value)}
              disabled={isPending}
            >
              <option value="">保存ビューを選択</option>
              {savedViews.map((view) => (
                <option
                  key={view.id as unknown as string}
                  value={view.id as unknown as string}
                >
                  {view.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="toolbar-right">
          <button
            type="button"
            className="pill-btn"
            onClick={() => setOpen(true)}
            disabled={!hasAnyFilter && search.q === undefined}
            title={
              !hasAnyFilter && search.q === undefined
                ? "条件が設定されていません"
                : undefined
            }
          >
            ビューとして保存
          </button>
          <Link to="/notes/new" className="pill-btn primary">
            新規作成
          </Link>
          <Link to="/upload" className="pill-btn">
            アップロード
          </Link>
        </div>
      </div>
      <SaveViewDialog
        open={open}
        onClose={() => setOpen(false)}
        search={search}
      />
    </>
  );
}
