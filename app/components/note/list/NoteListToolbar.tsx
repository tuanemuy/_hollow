"use client";

import { Bookmark, CheckSquare } from "lucide-react";
import { useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnGhost, pillBtnIcon } from "@/components/common/styles";
import type { NoteListSearch } from "../schema";
import { DisplayModeSwitch } from "./DisplayModeSwitch";
import { SaveViewDialog } from "./SaveViewDialog";
import { useSelection } from "./SelectionContext";
import { TOOLBAR_ICON_BTN } from "./styles";

// 選択 / ビューとして保存はアイコンのみ（#626 ADR-005）。aria-label は全環境
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
 * saved-view switching lives in the heading trigger (`ViewSwitcher`).
 */
export function NoteListToolbar({ search, hasAnyFilter }: Props) {
  const { state, dispatch } = useSelection();
  const [open, setOpen] = useState(false);
  // ビューとして保存 is `aria-disabled` (not `disabled`) so keyboard / SR
  // users can still reach it and hear WHY it is unavailable via
  // `aria-describedby` — a native `disabled` button is unfocusable and the
  // `title`-only reason never reaches them (`.issue/649/adr.md` ADR-010).
  const saveDisabled = !hasAnyFilter && search.q === undefined;
  const saveReasonId = useId();

  return (
    <>
      <div className="inline-flex items-center gap-2 max-sm:gap-1 flex-wrap">
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
          onClick={() => {
            if (saveDisabled) return;
            setOpen(true);
          }}
          aria-disabled={saveDisabled || undefined}
          aria-describedby={saveDisabled ? saveReasonId : undefined}
          aria-label="ビューとして保存"
          title={saveDisabled ? "条件が設定されていません" : "ビューとして保存"}
        >
          <Icon icon={Bookmark} />
        </button>
        {saveDisabled ? (
          <span id={saveReasonId} className="sr-only">
            条件が設定されていません
          </span>
        ) : null}
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
