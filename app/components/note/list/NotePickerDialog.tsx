"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { searchInternalLinkTargetsFn } from "../actions";
import { nextSuggestionIndex } from "../editor/internalLinkSuggest";
import {
  dialogActions,
  dialogTitle,
  field,
  fieldControl,
  pillBtn,
} from "../styles";

type NoteSuggestion = Extract<InternalLinkSuggestion, { kind: "note" }>;

type Status = "idle" | "loading" | "ready" | "error";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onSelect: (noteId: string) => void;
}>;

const DEBOUNCE_MS = 100;

/**
 * Title-prefix note picker rendered inside a modal `Dialog`. Selecting a
 * note calls `onSelect(noteId)` — navigation is the parent's job (see
 * ADR-006). Reuses `searchInternalLinkTargetsFn` and filters tag-kind
 * suggestions client-side (ADR-003).
 *
 * The combobox + listbox structure follows WAI-ARIA 1.2: the listbox is
 * only rendered when `status !== "idle"`, the empty-result message is a
 * sibling `<p aria-live="polite">` (not an option), and Enter is gated
 * on `event.isComposing === false` to keep IME confirmation safe.
 */
export function NotePickerDialog({ open, onClose, onSelect }: Props) {
  const search = useServerFn(searchInternalLinkTargetsFn);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly NoteSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<SerializedError | null>(null);

  const listboxId = useId();
  const optionIdBase = useId();

  // Reset internal state whenever the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setItems([]);
    setSelectedIndex(0);
    setStatus("idle");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setStatus("idle");
      setItems([]);
      setSelectedIndex(0);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const { suggestions } = await searchRef.current({
          data: { query: trimmed, limit: 20 },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const notes = suggestions.filter(
          (s): s is NoteSuggestion => s.kind === "note",
        );
        setItems(notes);
        setSelectedIndex(0);
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(extractSerializedError(e));
        setItems([]);
        setSelectedIndex(0);
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const hasListbox = status !== "idle";
  const selectedOptionId =
    status === "ready" && items.length > 0
      ? `${optionIdBase}-${selectedIndex}`
      : undefined;

  const commit = (noteId: string) => {
    onSelect(noteId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (items.length === 0) return;
      event.preventDefault();
      setSelectedIndex((current) =>
        nextSuggestionIndex(current, "down", items.length),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      setSelectedIndex((current) =>
        nextSuggestionIndex(current, "up", items.length),
      );
      return;
    }
    if (event.key === "Enter") {
      // IME-safe: confirming a kana → kanji conversion fires Enter while
      // `isComposing === true`. Skip in that case so the picker only
      // commits on an intentional Enter (ADR-005).
      if (event.nativeEvent.isComposing) return;
      if (items.length === 0) return;
      event.preventDefault();
      const selected = items[selectedIndex];
      if (selected !== undefined) {
        commit(selected.noteId as unknown as string);
      }
    }
  };

  const statusMessage = (() => {
    switch (status) {
      case "idle":
        return "タイトルの先頭一致でノートを検索できます";
      case "loading":
        return "検索中…";
      case "ready":
        return items.length === 0
          ? "該当するノートが見つかりません。タイトルの先頭の文字を変えて検索してください"
          : `${items.length} 件`;
      case "error":
        return displayError(error);
    }
  })();

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="ノートを選択">
      <h2 className={dialogTitle}>ノートを選択</h2>
      <div className={field}>
        <input
          type="search"
          inputMode="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasListbox}
          aria-busy={status === "loading"}
          {...(hasListbox ? { "aria-controls": listboxId } : {})}
          {...(selectedOptionId !== undefined
            ? { "aria-activedescendant": selectedOptionId }
            : {})}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="タイトルの先頭を入力"
          className={fieldControl}
        />
        <p
          aria-live="polite"
          className="text-[13px] text-ink-tertiary"
          data-status={status}
          {...(status === "error" ? { role: "alert" } : {})}
        >
          {statusMessage}
        </p>
        {hasListbox && status === "ready" && items.length > 0 ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="ノート候補"
            className="max-h-[320px] overflow-y-auto rounded-md border border-hairline bg-bg py-1"
          >
            {items.map((item, idx) => {
              const isActive = idx === selectedIndex;
              const optionId = `${optionIdBase}-${idx}`;
              return (
                <button
                  key={item.noteId as unknown as string}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive || undefined}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface data-[active]:bg-surface"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onMouseDown={(e) => {
                    // Block the row from stealing focus before onClick runs
                    // (input must keep focus so subsequent typing stays
                    // routed to the combobox).
                    e.preventDefault();
                    commit(item.noteId as unknown as string);
                  }}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-surface text-xs font-medium text-ink-secondary">
                    N
                  </span>
                  <span className="flex-1 truncate">{item.title}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className={dialogActions}>
        <button type="button" className={pillBtn} onClick={onClose}>
          キャンセル
        </button>
      </div>
    </Dialog>
  );
}
