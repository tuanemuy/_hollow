"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { Bookmark, Plus, Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { UploadButton } from "@/components/ingestion/UploadButton";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../schema";
import { DisplayModeSwitch } from "./DisplayModeSwitch";
import { SaveViewDialog } from "./SaveViewDialog";

type Props = {
  search: NoteListSearch;
  savedViews: readonly SavedViewDTO[];
  hasAnyFilter: boolean;
};

export function NoteListToolbar({ search, savedViews, hasAnyFilter }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSelectView = (viewId: string) => {
    if (viewId === "") {
      // Issue #215: `page` / `limit` are dropped so the URL collapses to
      // `/` (or `/?display=...`) — `noteListSearchSchema` fills the
      // defaults on parse.
      startTransition(() => {
        router.navigate({
          to: "/",
          search: (prev) => {
            const p = prev as Partial<NoteListSearch>;
            return {
              display: p.display,
            };
          },
        });
      });
      return;
    }
    // `display` is intentionally dropped from the URL here. The server
    // fn detects "viewId present + display absent" and redirects with
    // `display = view.displayMode` (Issue #219 ADR-002), so the URL
    // ends up normalised to the SavedView's stored mode. Keeping a
    // stale `prev.display` would suppress that redirect.
    startTransition(() => {
      router.navigate({
        to: "/",
        search: () => ({ viewId }),
      });
    });
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2 flex-wrap">
          <DisplayModeSwitch />
          {savedViews.length > 0 ? (
            <select
              aria-label="保存済みビュー"
              value={search.viewId ?? ""}
              onChange={(e) => onSelectView(e.target.value)}
              disabled={isPending}
              className="h-9 px-3 rounded-md border border-hairline bg-surface text-sm text-ink"
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
        <div className="inline-flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className={pillBtn}
            onClick={() => setOpen(true)}
            disabled={!hasAnyFilter && search.q === undefined}
            title={
              !hasAnyFilter && search.q === undefined
                ? "条件が設定されていません"
                : undefined
            }
          >
            <Icon icon={Bookmark} />
            ビューとして保存
          </button>
          <Link
            to="/notes/new"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
          >
            <Icon icon={Plus} />
            新規作成
          </Link>
          <UploadButton className={pillBtn}>
            <Icon icon={Upload} />
            アップロード
          </UploadButton>
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
