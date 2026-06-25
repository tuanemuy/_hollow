"use client";

import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { useRovingTablist } from "@/components/common/useRovingTablist";
import type { EditorMode, EditorSurface } from "./editorState";
import { editorModeTabs } from "./styles";

/**
 * Stable DOM id of the tab activating `mode`. Shared with `NoteEditor` (the
 * body tabpanel's `aria-labelledby` points back at the active tab) so the
 * tab ↔ panel association is wired by static naming, not generated ids
 * (Issue #776 ADR-002).
 */
export const editorModeTabId = (mode: EditorMode): string =>
  `editor-mode-tab-${mode}`;

/**
 * Stable DOM id of the single editor-body tabpanel. Every tab's
 * `aria-controls` points at this one id (APG "single panel, swapped content"
 * variant); the panel always hosts exactly one mounted body editor.
 */
export const EDITOR_BODY_PANEL_ID = "editor-body-panel";

// `focus-visible` accent outline (matches `DISPLAY_SEGMENTED_BTN`) — `pillBtn`
// has none of its own, so the tabs get the #660 segmented parity here (#776).
const tabFocusVisible =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/**
 * Pure tab control for the editor body-content mode. The set of visible
 * tabs is driven by the render `surface` (Issue #233 ADR-001 / spec
 * C2-4). FrontMatter is no longer a tab (Issue #697); its editor is
 * permanently mounted below the body editor in `NoteEditor`:
 *
 * - `surface === "new"`  → `wysiwyg` / `html` (no `inline` because a
 *   brand-new note has no rendered HTML to keep structurally intact).
 * - `surface === "edit"` → `inline` / `wysiwyg` / `html`
 *   (Issue #696 / spec P12 "WYSIWYG モード（新規 + 既存）"). The `inline`
 *   tab is labelled "ビジュアル" to mirror spec C2-4's "ビジュアル ⇄ HTML"
 *   toggle nomenclature and stays first so the default `edit` mode keeps
 *   its tab position; `wysiwyg` follows it (Issue #696 ADR-003). The
 *   actual switch to `wysiwyg` is gated in `NoteEditor` by a
 *   decoration-loss confirmation when the current HTML contains tags
 *   TipTap cannot round-trip.
 *
 * All HTML / WYSIWYG modes were fully enabled by P12 (Issue #9),
 * resolving the placeholder-disabled WYSIWYG state from Issue #1
 * ADR-002.
 */
export type EditorModeSwitchProps = Readonly<{
  surface: EditorSurface;
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}>;

type Tab = Readonly<{
  mode: EditorMode;
  label: string;
}>;

const TABS_NEW: readonly Tab[] = [
  { mode: "wysiwyg", label: "WYSIWYG" },
  { mode: "html", label: "HTML" },
];

const TABS_EDIT: readonly Tab[] = [
  { mode: "inline", label: "ビジュアル" },
  { mode: "wysiwyg", label: "WYSIWYG" },
  { mode: "html", label: "HTML" },
];

export function EditorModeSwitch({
  surface,
  mode,
  onChange,
}: EditorModeSwitchProps) {
  const tabs = surface === "new" ? TABS_NEW : TABS_EDIT;
  // APG Tabs with manual activation (Issue #776 ADR-002): arrows move focus
  // only; activation stays the native `<button>` click so `onChange`'s
  // unsaved / decoration-loss confirm gates never fire on arrow traversal.
  const roving = useRovingTablist({
    manualActivation: true,
    count: tabs.length,
    selectedIndex: tabs.findIndex((t) => t.mode === mode),
  });
  return (
    <div
      ref={roving.containerRef}
      className={editorModeTabs}
      role="tablist"
      aria-label="編集モード"
      aria-orientation="horizontal"
      onKeyDown={roving.onKeyDown}
    >
      {tabs.map((tab, index) => {
        const isActive = mode === tab.mode;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            id={editorModeTabId(tab.mode)}
            aria-selected={isActive}
            aria-controls={EDITOR_BODY_PANEL_ID}
            data-primary={isActive || undefined}
            tabIndex={roving.getTabIndex(index)}
            className={`${pillBtn} ${pillBtnPrimary} ${tabFocusVisible}`}
            onClick={() => onChange(tab.mode)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
