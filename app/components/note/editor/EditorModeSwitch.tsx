import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import type { EditorMode, EditorSurface } from "./editorState";
import { editorModeTabs } from "./styles";

/**
 * Pure tab control for the editor mode. The set of visible tabs is
 * driven by the render `surface` (Issue #233 ADR-001 / spec C2-4):
 *
 * - `surface === "new"`  → `wysiwyg` / `frontMatter` / `html` (no
 *   `inline` because a brand-new note has no rendered HTML to keep
 *   structurally intact).
 * - `surface === "edit"` → `inline` / `frontMatter` / `html`. The
 *   `inline` tab is labelled "ビジュアル" to mirror spec C2-4's
 *   "ビジュアル ⇄ HTML" toggle nomenclature; `wysiwyg` is reserved for
 *   the new-note surface.
 *
 * All HTML / FrontMatter / WYSIWYG modes were fully enabled by P12
 * (Issue #9), resolving the placeholder-disabled WYSIWYG state from
 * Issue #1 ADR-002.
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
  { mode: "frontMatter", label: "FrontMatter" },
  { mode: "html", label: "HTML" },
];

const TABS_EDIT: readonly Tab[] = [
  { mode: "inline", label: "ビジュアル" },
  { mode: "frontMatter", label: "FrontMatter" },
  { mode: "html", label: "HTML" },
];

export function EditorModeSwitch({
  surface,
  mode,
  onChange,
}: EditorModeSwitchProps) {
  const tabs = surface === "new" ? TABS_NEW : TABS_EDIT;
  return (
    <div className={editorModeTabs} role="tablist" aria-label="編集モード">
      {tabs.map((tab) => {
        const isActive = mode === tab.mode;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-primary={isActive || undefined}
            className={`${pillBtn} ${pillBtnPrimary}`}
            onClick={() => onChange(tab.mode)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
