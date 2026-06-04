"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  field,
  fieldControl,
  pillBtn,
} from "@/components/common/styles";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { searchInternalLinkTargetsFn } from "../actions";
import { nextSuggestionIndex } from "../editor/internalLinkSuggest";

type NoteSuggestion = Extract<InternalLinkSuggestion, { kind: "note" }>;

type Status = "idle" | "loading" | "ready" | "error";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onSelect: (noteId: string) => void;
  isPending?: boolean;
}>;

const DEBOUNCE_MS = 100;

const SR_ONLY =
  "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]";

/**
 * Title-prefix note picker rendered inside a modal `Dialog`. Selecting a
 * note calls `onSelect(noteId)` — navigation is the parent's job (see
 * ADR-006). Reuses `searchInternalLinkTargetsFn` and filters tag-kind
 * suggestions client-side (ADR-003).
 *
 * The combobox + listbox structure follows WAI-ARIA 1.2: the listbox is
 * only rendered when ready & items > 0, `aria-expanded` / `aria-controls`
 * track that same condition so we never reference a non-existent element,
 * and Enter is gated on `event.isComposing === false` to keep IME
 * confirmation safe.
 */
export function NotePickerDialog({
  open,
  onClose,
  onSelect,
  isPending = false,
}: Props) {
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

  const inputId = useId();
  const listboxId = useId();
  const optionIdBase = useId();
  const titleId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The parent `Dialog` already unmounts this subtree when `open` becomes
  // false, so this reset is a double safety net — kept explicit so a future
  // change to the Dialog mount behavior cannot silently leak stale state
  // (query / items / selectedIndex) into the next open.
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

  const hasListbox = status === "ready" && items.length > 0;
  const selectedOptionId = hasListbox
    ? `${optionIdBase}-${selectedIndex}`
    : undefined;

  // Keep the active option in view when keyboard navigation moves the
  // virtual focus past the listbox's scrollable max-height.
  useEffect(() => {
    if (!hasListbox) return;
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [hasListbox, selectedIndex]);

  const commit = (noteId: string) => {
    if (isPending) return;
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
        commit(selected.noteId);
      }
    }
  };

  const hint = "タイトルの先頭一致でノートを検索できます";
  const liveMessage = (() => {
    switch (status) {
      case "idle":
        return "";
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
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!isPending}
    >
      <h2 id={titleId} className={dialogTitle}>
        ノートを選択
      </h2>
      <div className={field}>
        <label htmlFor={inputId} className={SR_ONLY}>
          ノートタイトル
        </label>
        <input
          id={inputId}
          type="search"
          inputMode="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hasListbox}
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
        {status === "idle" ? (
          <p className="text-sm text-ink-tertiary">{hint}</p>
        ) : (
          <p
            aria-live="polite"
            aria-busy={status === "loading"}
            className="text-sm text-ink-tertiary"
            data-status={status}
            {...(status === "error" ? { role: "alert" } : {})}
          >
            {liveMessage}
          </p>
        )}
        {hasListbox ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="ノート候補"
            className="max-h-[320px] overflow-y-auto rounded-md border border-hairline bg-bg py-1"
          >
            {items.map((item, idx) => {
              const id = item.noteId;
              const isActive = idx === selectedIndex;
              const optionId = `${optionIdBase}-${idx}`;
              return (
                <button
                  key={id}
                  id={optionId}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive || undefined}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface data-[active]:bg-surface"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onMouseDown={(e) => {
                    // Keep focus on the combobox input so subsequent typing
                    // stays routed there. Commit happens in onClick below
                    // (fires for both mouse and touch / Pointer Events).
                    e.preventDefault();
                  }}
                  onClick={() => commit(id)}
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
