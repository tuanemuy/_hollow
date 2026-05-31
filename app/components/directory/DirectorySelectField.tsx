"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldControl, fieldLabel } from "@/components/common/styles";
import { nextSuggestionIndex } from "@/components/note/editor/internalLinkSuggest";

/**
 * One row in the listbox. `depth` drives the visual indent only; the
 * hierarchy is conveyed to screen readers through `path` (e.g.
 * `/Documents/Work`) rendered as the option's accessible text. `role="option"`
 * does NOT support `aria-level`, so it is intentionally omitted (see #388
 * ADR-001) — the path text carries the ancestor chain instead.
 */
type DirectoryOption = Readonly<{
  id: string;
  name: string;
  path: string;
  depth: number;
}>;

/**
 * Inline, single-select directory picker with a client-side search filter
 * and depth-indented hierarchy display. Drops into a Dialog / fieldset as a
 * scalable replacement for the depth-prefixed `<select>`.
 *
 * Follows the `NotePickerDialog` combobox + listbox pattern (WAI-ARIA 1.2):
 * the listbox is rendered only when matches exist, `aria-expanded` /
 * `aria-controls` / `aria-activedescendant` reference it only while it
 * exists, and Enter is gated on `isComposing === false` for IME safety.
 * Unlike `NotePickerDialog` the data is supplied via `options` — filtering is
 * purely client-side, so there is no server call or debounce.
 *
 * The picker owns no domain logic: cyclic exclusion, root-label synthesis,
 * and the existing-vs-new two-mode structure are all handled by callers
 * (see #388 ADR-002). `null` is the canonical "nothing selected" value; no
 * explicit empty option is rendered.
 */
export type DirectorySelectFieldProps = Readonly<{
  options: readonly DirectoryOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Synthesizes a fixed first option (e.g. MoveDirectoryDialog's "（ルート）"). */
  includeRootOption?: Readonly<{ id: string; label: string }>;
  label: string;
  id?: string;
  placeholder?: string;
  /** Status text shown when the filter matches nothing. */
  emptyLabel?: string;
  disabled?: boolean;
}>;

type Row = Readonly<{
  id: string;
  primary: string;
  secondary: string | null;
  depth: number;
}>;

export function DirectorySelectField({
  options,
  value,
  onChange,
  includeRootOption,
  label,
  id,
  placeholder = "ディレクトリを検索",
  emptyLabel = "該当するディレクトリが見つかりません",
  disabled = false,
}: DirectorySelectFieldProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const generatedInputId = useId();
  const inputId = id ?? generatedInputId;
  const labelId = useId();
  const listboxId = useId();
  const optionIdBase = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = options.map((opt) => ({
      id: opt.id,
      primary: opt.name === "" ? opt.path : opt.name,
      secondary: opt.name === "" ? null : opt.path,
      depth: opt.depth,
    }));
    if (includeRootOption !== undefined) {
      base.unshift({
        id: includeRootOption.id,
        primary: includeRootOption.label,
        secondary: null,
        depth: 0,
      });
    }
    return base;
  }, [options, includeRootOption]);

  const filtered = useMemo<Row[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return rows;
    return rows.filter(
      (r) =>
        r.primary.toLowerCase().includes(trimmed) ||
        (r.secondary?.toLowerCase().includes(trimmed) ?? false),
    );
  }, [rows, query]);

  // Keep the active index in range as the filter narrows the list.
  useEffect(() => {
    setActiveIndex((current) =>
      filtered.length === 0 ? 0 : Math.min(current, filtered.length - 1),
    );
  }, [filtered.length]);

  const hasListbox = filtered.length > 0;
  const activeOptionId = hasListbox
    ? `${optionIdBase}-${activeIndex}`
    : undefined;

  useEffect(() => {
    if (!hasListbox) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [hasListbox, activeIndex]);

  const selectedRow = value === null ? null : rows.find((r) => r.id === value);

  const commit = (rowId: string) => {
    if (disabled) return;
    onChange(rowId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) =>
        nextSuggestionIndex(current, "down", filtered.length),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) =>
        nextSuggestionIndex(current, "up", filtered.length),
      );
      return;
    }
    if (event.key === "Enter") {
      // IME-safe: skip Enter fired while a kana → kanji conversion is being
      // confirmed so the picker only commits on an intentional Enter.
      if (event.nativeEvent.isComposing) return;
      if (filtered.length === 0) return;
      event.preventDefault();
      const row = filtered[activeIndex];
      if (row !== undefined) commit(row.id);
    }
  };

  const statusMessage =
    filtered.length === 0 ? emptyLabel : `${filtered.length} 件`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} id={labelId} className={fieldLabel}>
        {label}
      </label>
      {selectedRow !== undefined && selectedRow !== null ? (
        <p className="text-[13px] text-ink" data-selected="">
          選択中: {selectedRow.primary}
          {selectedRow.secondary !== null ? (
            <span className="text-ink-tertiary">
              {" "}
              （{selectedRow.secondary}）
            </span>
          ) : null}
        </p>
      ) : null}
      <input
        id={inputId}
        type="search"
        inputMode="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={hasListbox}
        {...(hasListbox ? { "aria-controls": listboxId } : {})}
        {...(activeOptionId !== undefined
          ? { "aria-activedescendant": activeOptionId }
          : {})}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={fieldControl}
      />
      <p
        aria-live="polite"
        className="text-[13px] text-ink-tertiary"
        data-empty={filtered.length === 0 || undefined}
      >
        {statusMessage}
      </p>
      {hasListbox ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className="max-h-[280px] overflow-y-auto rounded-md border border-hairline bg-bg py-1"
        >
          {filtered.map((row, idx) => {
            const isActive = idx === activeIndex;
            const isSelected = row.id === value;
            const optionId = `${optionIdBase}-${idx}`;
            return (
              <button
                key={row.id}
                id={optionId}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isActive || undefined}
                data-selected={isSelected || undefined}
                style={{ paddingLeft: `${12 + row.depth * 16}px` }}
                className="flex w-full flex-col items-start gap-0.5 py-2 pr-3 text-left text-sm text-ink hover:bg-surface data-[active]:bg-surface data-[selected]:font-medium"
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  // Keep focus on the combobox input; commit on click.
                  e.preventDefault();
                }}
                onClick={() => commit(row.id)}
              >
                <span className="w-full truncate">{row.primary}</span>
                {row.secondary !== null ? (
                  <span className="w-full truncate text-[12px] text-ink-tertiary">
                    {row.secondary}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
