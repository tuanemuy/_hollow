"use client";

import { useId } from "react";
import { field, fieldControl, fieldLabel } from "@/components/common/styles";
import { CodeHighlight } from "../content/CodeHighlight";

/**
 * HTML edit pane with a sanitized-on-save preview folded under
 * `<details>`. The preview renders raw HTML through
 * `dangerouslySetInnerHTML` so the user sees their markup with browser
 * default styling; the sanitizer runs on the server inside `saveNote` /
 * `createNote` (note: the preview is therefore advisory — the actual
 * persisted HTML is the sanitized form).
 */
export type HtmlEditorProps = Readonly<{
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}>;

export function HtmlEditor({ value, onChange, disabled }: HtmlEditorProps) {
  const textareaId = useId();
  return (
    <div>
      <div className={field}>
        <label htmlFor={textareaId} className={fieldLabel}>
          本文（HTML）
        </label>
        <textarea
          id={textareaId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="<p>ここに本文を書きます…</p>"
          rows={18}
          disabled={disabled}
          spellCheck={false}
          // The editor pane uses a 480px floor (mock `.editor`) instead of
          // the shared `fieldTextarea` (320px), which other forms keep (#669).
          className={`${fieldControl} font-mono text-mono min-h-[480px] resize-y`}
        />
      </div>
      <details className="mt-2 rounded-md border border-hairline bg-surface-elevated">
        <summary className="cursor-pointer px-4 py-2 text-sm text-ink-secondary">
          プレビュー（保存時にサニタイズされます）
        </summary>
        <div
          className="note-detail-content border-t border-hairline p-4"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: preview-only; the persisted form is sanitized server-side at save time
          dangerouslySetInnerHTML={{ __html: value }}
        />
        <CodeHighlight contentKey={value} />
      </details>
    </div>
  );
}
