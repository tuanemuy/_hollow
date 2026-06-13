"use client";

import { Check, ChevronDown, ChevronRight, Folder, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Popover } from "@/components/common/Popover";
import { pillBtn } from "@/components/common/styles";
import { DeleteDirectoryDialog } from "@/components/directory/DeleteDirectoryDialog";
import { RenameDirectoryDialog } from "@/components/directory/RenameDirectoryDialog";
import type { FlatDirectory } from "../loaders";
import {
  clampActiveIndex,
  nextActiveIndex,
  visibleDirectoryOptions,
} from "./directoryTreeModel";
import {
  dirDropdownPanel,
  dirDropdownSearch,
  dirPillTrigger,
  dirTreeItem,
  dirTreeItemNew,
} from "./styles";

/**
 * Single-pill directory selector for the editor row (P12, Issue #689
 * ADR-003). Replaces the old two-field `variant="row"` with the mock's
 * `.dir-pill` trigger + `.dir-dropdown` tree.
 *
 * a11y model: WAI-ARIA combobox (search input) + sibling popup listbox.
 * Real focus stays on the search input; ArrowUp/Down move
 * `aria-activedescendant` over the *visible* option flat list (the
 * collapsible tree plus the trailing "create" option). Enter selects the
 * active option; Escape / outside-click / Tab-out close via `Popover`.
 * `useRovingMenu` (real-focus roving) is intentionally not used.
 *
 * Selection contract is unchanged: existing pick → `onSelectExisting(id)`,
 * inline new directory → `onSetPendingName(name)`. The orchestrator keeps
 * the `directoryId` XOR `pendingDirectoryName` exclusivity.
 */
export type DirectoryTreeSelectProps = Readonly<{
  tree: readonly FlatDirectory[];
  directoryId: string | null;
  pendingDirectoryName: string | null;
  onSelectExisting: (id: string | null) => void;
  onSetPendingName: (name: string | null) => void;
  disabled?: boolean;
  allowExistingActions?: boolean;
  label?: string;
}>;

export function DirectoryTreeSelect({
  tree,
  directoryId,
  pendingDirectoryName,
  onSelectExisting,
  onSetPendingName,
  disabled = false,
  allowExistingActions = false,
  label = "ディレクトリ",
}: DirectoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const labelId = useId();
  const listboxId = useId();
  const optionIdBase = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLElement | null)[]>([]);

  const selected = useMemo(
    () =>
      directoryId === null ? null : tree.find((d) => d.id === directoryId),
    [tree, directoryId],
  );

  const options = useMemo(
    () => visibleDirectoryOptions(tree, expanded, query),
    [tree, expanded, query],
  );

  // Keep the active index pointing at a real option as the visible set
  // changes (filter narrows, a branch collapses).
  useEffect(() => {
    setActiveIndex((current) => clampActiveIndex(current, options.length));
  }, [options.length]);

  const hasListbox = options.length > 0;
  const activeOptionId = hasListbox
    ? `${optionIdBase}-${activeIndex}`
    : undefined;

  useEffect(() => {
    if (!open || !hasListbox) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, hasListbox, activeIndex]);

  useEffect(() => {
    if (!open) {
      // Reset transient panel state on close so the next open starts clean.
      setQuery("");
      setCreating(false);
      setNewName("");
      return;
    }
    // Focus the search input each time the panel opens so the combobox
    // owns focus immediately (the trigger keeps `aria-expanded`).
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (creating) newNameRef.current?.focus();
  }, [creating]);

  const triggerLabel =
    pendingDirectoryName !== null
      ? `新規: ${pendingDirectoryName}`
      : selected !== undefined && selected !== null
        ? selected.path
        : "ディレクトリを選択";

  const canShowActions =
    allowExistingActions &&
    directoryId !== null &&
    selected !== undefined &&
    selected !== null;

  const toggleExpand = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectOptionAt = (index: number, close: () => void) => {
    const option = options[index];
    if (option === undefined) return;
    if (option.kind === "create") {
      setCreating(true);
      return;
    }
    onSelectExisting(option.id);
    close();
  };

  const commitNewName = (close: () => void) => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    onSetPendingName(trimmed);
    close();
  };

  const onSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    close: () => void,
  ) => {
    if (event.key === "ArrowDown") {
      if (!hasListbox) return;
      event.preventDefault();
      setActiveIndex((current) =>
        nextActiveIndex(current, "down", options.length),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      if (!hasListbox) return;
      event.preventDefault();
      setActiveIndex((current) =>
        nextActiveIndex(current, "up", options.length),
      );
      return;
    }
    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      if (!hasListbox) return;
      event.preventDefault();
      selectOptionAt(activeIndex, close);
    }
  };

  // Rename / Delete dialogs are opened only after closing the non-modal
  // popover (focus returns to the trigger first) so the disappearing
  // option is not captured by the dialog's `previousActiveRef`.
  const openRename = (close: () => void) => {
    close();
    setRenameOpen(true);
  };
  const openDelete = (close: () => void) => {
    close();
    setDeleteOpen(true);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span
        id={labelId}
        className="text-xs uppercase tracking-[0.06em] text-ink-tertiary"
      >
        {label}
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          setOpen(next);
        }}
        haspopup="dialog"
        label={label}
        panelClassName={dirDropdownPanel}
        clampToViewport
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            disabled={disabled}
            className={dirPillTrigger}
          >
            <Icon icon={Folder} size={16} className="text-ink-secondary" />
            <span className="truncate">{triggerLabel}</span>
            <Icon icon={ChevronDown} size={16} className="text-ink-tertiary" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={hasListbox}
              aria-labelledby={labelId}
              {...(hasListbox ? { "aria-controls": listboxId } : {})}
              {...(activeOptionId !== undefined
                ? { "aria-activedescendant": activeOptionId }
                : {})}
              value={query}
              placeholder="ディレクトリ名で検索…"
              aria-label="ディレクトリ検索"
              className={dirDropdownSearch}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => onSearchKeyDown(e, close)}
            />
            {hasListbox ? (
              <div id={listboxId} role="listbox" aria-labelledby={labelId}>
                {options.map((option, index) => {
                  const isActive = index === activeIndex;
                  const optionId = `${optionIdBase}-${index}`;
                  if (option.kind === "create") {
                    return (
                      <div key="__create__">
                        <div className="my-1 h-px bg-hairline" />
                        <button
                          id={optionId}
                          ref={(el) => {
                            optionRefs.current[index] = el;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive || undefined}
                          className={dirTreeItemNew}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setCreating(true)}
                        >
                          <Icon icon={Plus} size={16} />
                          新規ディレクトリを作成…
                        </button>
                      </div>
                    );
                  }
                  const isSelected = option.id === directoryId;
                  const indent = 8 + option.depth * 16;
                  return (
                    <div key={option.id} className="relative">
                      {option.hasChildren ? (
                        // Caret is a sibling button (not nested inside the
                        // option button — that would be invalid HTML) that
                        // toggles expansion without selecting. The keyboard
                        // path drives expansion implicitly via search /
                        // ancestor auto-expand; this is the pointer
                        // affordance for browsing.
                        <button
                          type="button"
                          aria-label={
                            option.expanded
                              ? `${option.name} を折りたたむ`
                              : `${option.name} を展開`
                          }
                          aria-expanded={option.expanded}
                          className="absolute top-1.5 z-10 inline-flex text-ink-tertiary outline-none"
                          style={{ left: `${indent}px` }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => toggleExpand(option.id)}
                        >
                          <Icon
                            icon={option.expanded ? ChevronDown : ChevronRight}
                            size={16}
                          />
                        </button>
                      ) : null}
                      <button
                        id={optionId}
                        ref={(el) => {
                          optionRefs.current[index] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive || undefined}
                        data-selected={isSelected || undefined}
                        className={dirTreeItem}
                        style={{ paddingLeft: `${indent + 22}px` }}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onSelectExisting(option.id);
                          close();
                        }}
                      >
                        <Icon
                          icon={Folder}
                          size={16}
                          className="text-ink-tertiary"
                        />
                        <span className="truncate">{option.name}</span>
                        {isSelected ? (
                          <Icon
                            icon={Check}
                            size={16}
                            className="ml-auto text-accent-ink"
                          />
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {creating ? (
              <div className="mt-1 flex items-center gap-2 px-1 pb-1">
                <input
                  ref={newNameRef}
                  type="text"
                  value={newName}
                  placeholder="新しいディレクトリ名"
                  aria-label="新しいディレクトリ名"
                  className={dirDropdownSearch}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      commitNewName(close);
                    }
                  }}
                />
              </div>
            ) : null}

            {canShowActions ? (
              <>
                <div className="my-1 h-px bg-hairline" />
                <div className="flex gap-2 px-1 pb-1">
                  <button
                    type="button"
                    className={pillBtn}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openRename(close)}
                  >
                    リネーム
                  </button>
                  <button
                    type="button"
                    className={pillBtn}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openDelete(close)}
                  >
                    削除
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </Popover>

      {canShowActions ? (
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
      ) : null}
    </div>
  );
}
