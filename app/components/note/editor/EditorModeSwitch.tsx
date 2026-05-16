import type { EditorMode } from "./editorState";

/**
 * Pure tab control for the editor mode. The `wysiwyg` tab is wired in
 * disabled with a tooltip — see ADR-002 (本格 WYSIWYG は別 Issue で対応).
 */
export type EditorModeSwitchProps = Readonly<{
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}>;

type Tab = Readonly<{
  mode: EditorMode;
  label: string;
  disabled?: boolean;
  title?: string;
}>;

const TABS: readonly Tab[] = [
  { mode: "html", label: "HTML" },
  { mode: "frontMatter", label: "FrontMatter" },
  {
    mode: "wysiwyg-disabled",
    label: "WYSIWYG",
    disabled: true,
    title: "WYSIWYG モードは別 Issue で対応予定",
  },
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
          aria-disabled={tab.disabled === true}
          disabled={tab.disabled === true}
          title={tab.title}
          className={`pill-btn${mode === tab.mode ? " primary" : ""}`}
          onClick={() => {
            if (tab.disabled === true) return;
            onChange(tab.mode);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
