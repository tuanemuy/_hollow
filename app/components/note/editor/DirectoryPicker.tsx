"use client";

import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";
import {
  field,
  fieldControl,
  fieldLabel,
  pillBtn,
} from "@/components/common/styles";
import { DeleteDirectoryDialog } from "@/components/directory/DeleteDirectoryDialog";
import { DirectorySelectField } from "@/components/directory/DirectorySelectField";
import { RenameDirectoryDialog } from "@/components/directory/RenameDirectoryDialog";
import { MAX_DIRECTORY_DEPTH } from "@/core/domain/directory/valueObject";
import type { FlatDirectory } from "../loaders";
import { dirRowPillInput } from "./styles";

/**
 * Directory selector for the editor.
 *
 * Two-mode UI: pick an existing directory from the searchable
 * `DirectorySelectField`, or type a brand-new directory name. The new name is held
 * by the orchestrator as `pendingDirectoryName` until save, at which
 * point it is created via `createDirectoryFn` and the resolved id is
 * passed to `createNoteFn` / `saveNoteFn`.
 *
 * `legendSlot` (optional) renders an inline node next to the
 * "ディレクトリ" legend text. Used by `IngestionPreviewForm` to attach
 * the "AI suggestion" caption; left unused by the regular note editor.
 *
 * `allowExistingActions` (default `false`) is an opt-in switch that
 * surfaces "Rename" / "Delete" buttons next to the existing-directory
 * picker when a real directory is selected (i.e. `directoryId !== null`).
 * `NoteEditor` opts in; `IngestionPreviewForm` does not — physically
 * deleting an LLM-suggested directory mid-preview would break the
 * preview state contract (commit would NotFoundError, AI badges would
 * desync).
 *
 * `allowNestedPath` (default `false`) is an ingestion-only opt-in: when
 * true the new-name input accepts a `/`-delimited nested path (e.g.
 * `技術/AI`) and the hint reflects that. NoteEditor leaves it false — its
 * `pendingDirectoryName` flows straight into `DirectoryName.create`, which
 * rejects `/` as a forbidden char, so a single name is the only valid
 * input there. See .issue/363/adr.md ADR-004.
 *
 * `variant` (default `"fieldset"`) switches the container styling only —
 * behaviour, controls and a11y structure are identical. `"fieldset"` keeps
 * the bordered fieldset used by `IngestionPreviewForm`; `"row"` is the
 * compact editor presentation matching the P12 mock's `.dir-row` (small
 * uppercase label + one wrap-allowed row, `mb-3`). See `.issue/669/adr.md`
 * ADR-002.
 */
export type DirectoryPickerProps = Readonly<{
  tree: readonly FlatDirectory[];
  directoryId: string | null;
  pendingDirectoryName: string | null;
  onSelectExisting: (id: string | null) => void;
  onSetPendingName: (name: string | null) => void;
  disabled?: boolean;
  legendSlot?: ReactNode;
  allowExistingActions?: boolean;
  allowNestedPath?: boolean;
  variant?: "fieldset" | "row";
}>;

export function DirectoryPicker({
  tree,
  directoryId,
  pendingDirectoryName,
  onSelectExisting,
  onSetPendingName,
  disabled,
  legendSlot,
  allowExistingActions = false,
  allowNestedPath = false,
  variant = "fieldset",
}: DirectoryPickerProps) {
  const selectId = useId();
  const newId = useId();
  const usingNew = pendingDirectoryName !== null;
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = useMemo(
    () =>
      directoryId === null ? null : tree.find((d) => d.id === directoryId),
    [tree, directoryId],
  );

  const canShowActions =
    allowExistingActions === true &&
    directoryId !== null &&
    selected !== undefined &&
    selected !== null;

  const newNameLabel = allowNestedPath
    ? "または新規ディレクトリパス"
    : "または新規ディレクトリ名";

  const selectField = (
    <DirectorySelectField
      id={selectId}
      label="既存ディレクトリ"
      options={tree}
      value={directoryId}
      onChange={onSelectExisting}
      disabled={disabled === true || usingNew}
      clearable
      // The row variant renders its own visible "ディレクトリ" label, so the
      // field's label goes sr-only to avoid a double label.
      labelHidden={variant === "row"}
    />
  );

  const actionButtons = canShowActions ? (
    <div className="inline-flex gap-2">
      <button
        type="button"
        className={pillBtn}
        onClick={() => setRenameOpen(true)}
        disabled={disabled}
      >
        リネーム
      </button>
      <button
        type="button"
        className={pillBtn}
        onClick={() => setDeleteOpen(true)}
        disabled={disabled}
      >
        削除
      </button>
    </div>
  ) : null;

  const newNameInput = (props: { className: string }) => (
    <input
      id={newId}
      type="text"
      value={pendingDirectoryName ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onSetPendingName(v.length === 0 ? null : v);
      }}
      placeholder={
        allowNestedPath
          ? "例: 技術/AI（/ 区切りで階層を指定）保存時に自動作成"
          : "新しいディレクトリ名を入力すると保存時に自動作成"
      }
      disabled={disabled}
      className={props.className}
    />
  );

  const dialogs = canShowActions ? (
    <>
      <RenameDirectoryDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        directoryId={selected.id}
        currentName={selected.name}
      />
      <DeleteDirectoryDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        directoryId={selected.id}
        directoryName={selected.name}
        onDeleted={() => onSelectExisting(null)}
      />
    </>
  ) : null;

  if (variant === "row") {
    return (
      <div className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 pt-1 text-xs uppercase tracking-[0.06em] text-ink-tertiary">
          ディレクトリ
          {legendSlot}
        </span>
        <div className="min-w-0 flex-1 basis-56">{selectField}</div>
        {actionButtons}
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={newId} className="sr-only">
            {newNameLabel}
          </label>
          {newNameInput({ className: dirRowPillInput })}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <fieldset className="mb-4 rounded-lg border border-hairline p-4">
      <legend className="inline-flex items-center gap-2 px-2 text-sm font-medium text-ink-secondary">
        <span>ディレクトリ</span>
        {legendSlot}
      </legend>
      <div className={field}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{selectField}</div>
          {actionButtons}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={newId} className={fieldLabel}>
          {newNameLabel}
        </label>
        {newNameInput({ className: fieldControl })}
        {allowNestedPath ? (
          <p className="text-[11px] text-ink-tertiary">
            {`「/」区切りで階層（最大${MAX_DIRECTORY_DEPTH}階層）を指定できます（例: 技術/AI）。`}
          </p>
        ) : null}
      </div>

      {dialogs}
    </fieldset>
  );
}
