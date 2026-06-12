"use client";

import { useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Popover } from "@/components/common/Popover";
import { menuPanel } from "@/components/common/styles";
import { useRovingMenu } from "@/components/common/useRovingMenu";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../schema";
import {
  ALL_NOTES_VIEW_NAME,
  homeHeadingText,
  resolveViewName,
  viewSwitcherAriaLabel,
} from "./listSelectors";

// 見出し=トリガー（#626 R2 ADR-004）。装飾は chevron と hover の surface のみに留め、
// `-ml` で押下面のパディング分を相殺してテキスト左端を保つ。グローバルな
// `whitespace-nowrap` ではなく折り返し（`overflow-wrap:anywhere`）を許す。
// モバイルはタッチ配慮で min-h 44px（mock `view-switcher` の明示指定）。
const TRIGGER =
  "inline-flex items-center gap-2.5 max-sm:gap-2 -ml-2.5 max-sm:-ml-2 px-2.5 max-sm:px-2 py-0.5 rounded-md text-left whitespace-normal [overflow-wrap:anywhere] max-sm:min-h-[44px] transition-colors motion-reduce:transition-none hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

// パネルは h1 の外（Popover コンテナ直下）に出るが、見出しサイズを継承しない
// よう書体をリセットする。
const PANEL = `absolute left-0 top-full mt-1 z-40 ${menuPanel} min-w-[240px] max-w-[calc(100vw-2rem)] text-sm font-regular tracking-normal leading-normal`;

const OPTION_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none hover:bg-surface focus-visible:bg-surface data-[active]:bg-surface data-[active]:font-medium [overflow-wrap:anywhere]";

type Props = {
  search: NoteListSearch;
  savedViews: readonly SavedViewDTO[];
};

/**
 * Page heading as the saved-view switching trigger (#626 ADR-004 / #649).
 * The `<h1>` shows the current view name (or the search phrasing while a
 * keyword search is active — `.issue/649/adr.md` ADR-005) and opens a
 * `role="listbox"` dropdown of すべてのノート + the saved views. Selecting
 * navigates with the same URL contract the old toolbar `<select>` had
 * (#215 / #219).
 */
export function ViewSwitcher({ search, savedViews }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLElement | null>(null);

  const viewName = resolveViewName(search.viewId, savedViews);
  const headingText = homeHeadingText(search.q, viewName);
  const ariaLabel = viewSwitcherAriaLabel(search.q, viewName);

  // すべてのノート (index 0) + 保存ビュー。
  const itemCount = savedViews.length + 1;
  const selectedIndex =
    search.viewId === undefined
      ? 0
      : savedViews.findIndex((v) => v.id === search.viewId) + 1;
  const initialIndex = selectedIndex < 0 ? 0 : selectedIndex;

  const roving = useRovingMenu({
    open,
    itemCount,
    panelRef,
    itemRole: "option",
    initialIndex,
  });

  const onSelectView = (viewId: string) => {
    if (viewId === "") {
      // Issue #215: `page` / `limit` are dropped so the URL collapses to
      // `/` (or `/?display=...`) — `noteListSearchSchema` fills the
      // defaults on parse.
      startTransition(async () => {
        try {
          await router.navigate({
            to: "/",
            search: (prev) => {
              const p = prev as Partial<NoteListSearch>;
              return {
                display: p.display,
              };
            },
          });
        } catch {
          // Navigation cancelled/superseded — nothing to settle here.
        }
      });
      return;
    }
    // `display` is intentionally dropped from the URL here. The server
    // fn detects "viewId present + display absent" and redirects with
    // `display = view.displayMode` (Issue #219 ADR-002), so the URL
    // ends up normalised to the SavedView's stored mode. Keeping a
    // stale `prev.display` would suppress that redirect.
    startTransition(async () => {
      try {
        await router.navigate({
          to: "/",
          search: () => ({ viewId }),
        });
      } catch {
        // Navigation cancelled/superseded — nothing to settle here.
      }
    });
  };

  return (
    <div className="mb-[10px]">
      <Popover
        open={open}
        onOpenChange={setOpen}
        haspopup="listbox"
        label="ビューを切り替え"
        panelClassName={PANEL}
        panelRef={(node) => {
          panelRef.current = node;
        }}
        onMenuKeyDown={roving.onKeyDown}
        trigger={(triggerProps) => (
          <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink">
            <button
              {...triggerProps}
              type="button"
              aria-label={ariaLabel}
              title="ビューを切り替え"
              className={TRIGGER}
            >
              {headingText}
              <ChevronDown
                className="size-[18px] max-sm:size-4 shrink-0 text-ink-tertiary"
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </h1>
        )}
      >
        {({ close }) => {
          const select = (viewId: string) => {
            // Focus returns to the trigger BEFORE the navigation kicks in
            // (usePopover's Dialog-connection order).
            close();
            onSelectView(viewId);
          };
          return (
            <>
              <button
                type="button"
                role="option"
                aria-selected={search.viewId === undefined}
                data-active={search.viewId === undefined || undefined}
                tabIndex={roving.getTabIndex(0)}
                onClick={() => select("")}
                className={OPTION_ITEM}
              >
                {ALL_NOTES_VIEW_NAME}
              </button>
              {savedViews.map((view, i) => {
                const selected = view.id === search.viewId;
                return (
                  <button
                    key={view.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-active={selected || undefined}
                    tabIndex={roving.getTabIndex(i + 1)}
                    onClick={() => select(view.id)}
                    className={OPTION_ITEM}
                  >
                    {view.name}
                  </button>
                );
              })}
            </>
          );
        }}
      </Popover>
    </div>
  );
}
