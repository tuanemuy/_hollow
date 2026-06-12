"use client";

import { Bookmark, CheckSquare } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnGhost, pillBtnIcon } from "@/components/common/styles";
import type { NoteListSearch } from "../schema";
import { DisplayModeSwitch } from "./DisplayModeSwitch";
import { SaveViewDialog } from "./SaveViewDialog";
import { useSelection } from "./SelectionContext";
import { TOOLBAR_ICON_BTN } from "./styles";

// 選択 / ビューとして保存はアイコンのみ（#626 R2 ADR-005）。aria-label は全環境
// 必須、title は常時レンダー（`.issue/649/adr.md` ADR-003）。
const ICON_BTN = `${pillBtn} ${pillBtnGhost} ${pillBtnIcon} ${TOOLBAR_ICON_BTN}`;

type Props = {
  search: NoteListSearch;
  hasAnyFilter: boolean;
};

/**
 * Right-hand action group of the page-meta row: 選択 / ビューとして保存 /
 * 表示モード segmented (#626 ADR-001/005/007). The 新規作成 / アップロード
 * CTAs live in the global header only (#626 ADR-002, #628 ADR-001/003) and
 * the saved-view `<select>` moved into the heading trigger (`ViewSwitcher`).
 */
export function NoteListToolbar({ search, hasAnyFilter }: Props) {
  const { state, dispatch } = useSelection();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="inline-flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className={ICON_BTN}
          data-ghost=""
          data-icon=""
          data-on={state.mode || undefined}
          aria-pressed={state.mode}
          aria-label="選択モード"
          title="選択モード"
          onClick={() => dispatch({ type: "toggleSelectMode" })}
        >
          <Icon icon={CheckSquare} />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          data-ghost=""
          data-icon=""
          onClick={() => setOpen(true)}
          disabled={!hasAnyFilter && search.q === undefined}
          aria-label="ビューとして保存"
          title={
            !hasAnyFilter && search.q === undefined
              ? "条件が設定されていません"
              : "ビューとして保存"
          }
        >
          <Icon icon={Bookmark} />
        </button>
        <DisplayModeSwitch />
      </div>
      <SaveViewDialog
        open={open}
        onClose={() => setOpen(false)}
        search={search}
      />
    </>
  );
}
