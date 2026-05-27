"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { field, fieldControl, fieldLabel } from "@/components/common/styles";
import type { FlatDirectory } from "../loaders";

/**
 * Directory selector for the editor.
 *
 * Two-mode UI: pick an existing directory from a depth-indented
 * `<select>`, or type a brand-new directory name. The new name is held
 * by the orchestrator as `pendingDirectoryName` until save, at which
 * point it is created via `createDirectoryFn` and the resolved id is
 * passed to `createNoteFn` / `saveNoteFn`.
 *
 * `legendSlot` (optional) renders an inline node next to the
 * "ディレクトリ" legend text. Used by `IngestionPreviewForm` to attach
 * the "AI suggestion" caption; left unused by the regular note editor.
 */
export type DirectoryPickerProps = Readonly<{
  tree: readonly FlatDirectory[];
  directoryId: string | null;
  pendingDirectoryName: string | null;
  onSelectExisting: (id: string | null) => void;
  onSetPendingName: (name: string | null) => void;
  disabled?: boolean;
  legendSlot?: ReactNode;
}>;

export function DirectoryPicker({
  tree,
  directoryId,
  pendingDirectoryName,
  onSelectExisting,
  onSetPendingName,
  disabled,
  legendSlot,
}: DirectoryPickerProps) {
  const selectId = useId();
  const newId = useId();
  const usingNew = pendingDirectoryName !== null;

  return (
    <fieldset className="mb-4 rounded-lg border border-hairline p-4">
      <legend className="inline-flex items-center gap-2 px-2 text-[13px] font-medium text-ink-secondary">
        <span>ディレクトリ</span>
        {legendSlot}
      </legend>
      <div className={field}>
        <label htmlFor={selectId} className={fieldLabel}>
          既存ディレクトリ
        </label>
        <select
          id={selectId}
          value={directoryId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onSelectExisting(v.length === 0 ? null : v);
          }}
          disabled={disabled === true || usingNew}
          className={fieldControl}
        >
          <option value="">未選択</option>
          {tree.map((node) => (
            <option key={node.id} value={node.id}>
              {"  ".repeat(node.depth)}
              {node.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={newId} className={fieldLabel}>
          または新規ディレクトリ名
        </label>
        <input
          id={newId}
          type="text"
          value={pendingDirectoryName ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onSetPendingName(v.length === 0 ? null : v);
          }}
          placeholder="新しいディレクトリ名を入力すると保存時に自動作成"
          disabled={disabled}
          className={fieldControl}
        />
      </div>
    </fieldset>
  );
}
