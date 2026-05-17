import type { EditorMode } from "./editorState";

/**
 * Pure tab control for the editor mode. All three modes (HTML /
 * FrontMatter / WYSIWYG) are enabled — the placeholder-disabled WYSIWYG
 * state from Issue #1 ADR-002 is resolved by P12 (Issue #9).
 */
export type EditorModeSwitchProps = Readonly<{
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}>;

type Tab = Readonly<{
  mode: EditorMode;
  label: string;
}>;

const TABS: readonly Tab[] = [
  { mode: "html", label: "HTML" },
  { mode: "frontMatter", label: "FrontMatter" },
  { mode: "wysiwyg", label: "WYSIWYG" },
];

export function EditorModeSwitch({ mode, onChange }: EditorModeSwitchProps) {
  return (
    <div className="editor-mode-switch" role="tablist" aria-label="編集モード">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          aria-selected={mode === tab.mode}
          className={`pill-btn${mode === tab.mode ? " primary" : ""}`}
          onClick={() => onChange(tab.mode)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
