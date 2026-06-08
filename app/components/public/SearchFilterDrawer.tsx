"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import { SlidersHorizontal, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { suggestPublicTagsFn, suggestPublicUsersFn } from "./searchActions";
import {
  PERIOD_LABELS,
  SEARCH_PERIODS,
  type SearchPeriod,
} from "./searchPeriod";
import {
  ACTIVE_CHIP,
  ACTIVE_CHIP_AVATAR,
  ACTIVE_CHIP_REMOVE,
  ACTIVE_CHIPS,
  ACTIVE_CHIPS_CLEAR,
  DRAWER,
  DRAWER_APPLY,
  DRAWER_BACKDROP,
  DRAWER_BODY,
  DRAWER_CLOSE,
  DRAWER_FOOTER,
  DRAWER_HEADER,
  DRAWER_RESET,
  DRAWER_TITLE,
  FACET_COUNT,
  FACET_HEADER,
  FACET_HINT,
  FACET_ITEM,
  FACET_LABEL,
  FACET_LIST,
  FACET_RADIO,
  FACET_SECTION,
  FACET_SELECTED_COUNT,
  FACET_TITLE,
  FILTER_BTN,
  FILTER_BTN_BADGE,
  SUGGESTION_AVATAR,
  SUGGESTION_EMPTY,
  SUGGESTION_ITEM,
  SUGGESTION_LABEL,
  SUGGESTIONS,
  TOKEN,
  TOKEN_AVATAR,
  TOKEN_FIELD,
  TOKEN_INPUT,
  TOKEN_LABEL,
  TOKEN_REMOVE,
} from "./styles";

const route = getRouteApi("/search");

const SUGGEST_DEBOUNCE_MS = 200;

function initials(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

type PeriodFacet = Readonly<{ period: SearchPeriod; count: number }>;

type Props = Readonly<{
  // Facet totals computed server-side from the current keyword + filters.
  // The footer "N 件を表示" reflects the count of the selected period.
  facets: readonly PeriodFacet[];
}>;

const selectKeyword = (s: { q?: string | undefined }): string => s.q ?? "";
const selectUsername = (s: { username?: string | undefined }): string | null =>
  s.username ?? null;
const selectTags = (s: {
  tags?: readonly string[] | undefined;
}): readonly string[] => s.tags ?? [];
const selectPeriod = (s: {
  period?: SearchPeriod | undefined;
}): SearchPeriod | null => s.period ?? null;

/**
 * Client island for the P32 search filter affordances: the「フィルター」
 * button (with active-count badge), the active-filter chip row, and the
 * right-slide filter drawer (user / tag combobox + period radio).
 *
 * URL is the single source of truth for *confirmed* values — selecting a
 * user / tag / period writes `username` / `tags` / `period` search params,
 * which the loader threads into `searchPublicNotes`. Combobox *suggestions*
 * are fetched per-keystroke via `suggest*Fn` (debounced) and never touch the
 * URL. Bound to `getRouteApi("/search")`; the auth-side islands
 * (`/_app/`, `/u/$username/`) are not reusable here.
 */
export function SearchFilterDrawer({ facets }: Props) {
  const router = useRouter();
  const keyword = route.useSearch({ select: selectKeyword });
  const username = route.useSearch({ select: selectUsername });
  const tags = route.useSearch({ select: selectTags });
  const period = route.useSearch({ select: selectPeriod });

  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeCount =
    (username !== null ? 1 : 0) + tags.length + (period !== null ? 1 : 0);

  const facetByPeriod = new Map(facets.map((f) => [f.period, f.count]));
  const selectedPeriodCount =
    period !== null
      ? (facetByPeriod.get(period) ?? 0)
      : (facetByPeriod.get("all") ?? 0);

  // Mutate the URL search params, preserving the keyword + pagination reset.
  const navigate = useCallback(
    (patch: {
      username?: string | null;
      tags?: readonly string[];
      period?: SearchPeriod | null;
    }) => {
      startTransition(() => {
        // The `/search` route's strict search schema rejects the open
        // `Record` reducer shape under `exactOptionalPropertyTypes`; the
        // returned params are re-validated by the route's `validateSearch` on
        // commit, so the structural cast here is safe.
        router.navigate({
          to: "/search",
          search: (prev) => {
            const next: Record<string, unknown> = {
              ...(prev as Record<string, unknown>),
            };
            // Any filter change resets pagination.
            next.cursor = undefined;
            if ("username" in patch) {
              next.username =
                patch.username === null ? undefined : patch.username;
            }
            if ("tags" in patch) {
              next.tags =
                patch.tags && patch.tags.length > 0 ? patch.tags : undefined;
            }
            if ("period" in patch) {
              next.period = patch.period === null ? undefined : patch.period;
            }
            return next as never;
          },
        });
      });
    },
    [router],
  );

  const close = useCallback(() => setOpen(false), []);

  // Esc closes the drawer; focus lands on the close button when it opens.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const removeTag = (tag: string) =>
    navigate({ tags: tags.filter((t) => t !== tag) });
  const addTag = (tag: string) => {
    if (tags.includes(tag)) return;
    navigate({ tags: [...tags, tag] });
  };

  const clearAll = () => navigate({ username: null, tags: [], period: null });

  return (
    <>
      <button
        type="button"
        className={FILTER_BTN}
        data-active={activeCount > 0 || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal
          className="size-[14px]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        フィルター
        {activeCount > 0 ? (
          <span className={FILTER_BTN_BADGE}>{activeCount}</span>
        ) : null}
      </button>

      {activeCount > 0 ? (
        <div className={ACTIVE_CHIPS}>
          {username !== null ? (
            <span className={ACTIVE_CHIP}>
              <span className={ACTIVE_CHIP_AVATAR} aria-hidden="true">
                {initials(username)}
              </span>
              @{username}
              <button
                type="button"
                aria-label={`@${username} を解除`}
                className={ACTIVE_CHIP_REMOVE}
                onClick={() => navigate({ username: null })}
              >
                <X className="size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {tags.map((tag) => (
            <span key={tag} className={ACTIVE_CHIP}>
              #{tag}
              <button
                type="button"
                aria-label={`#${tag} を解除`}
                className={ACTIVE_CHIP_REMOVE}
                onClick={() => removeTag(tag)}
              >
                <X className="size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
          {period !== null ? (
            <span className={ACTIVE_CHIP}>
              {PERIOD_LABELS[period]}
              <button
                type="button"
                aria-label={`${PERIOD_LABELS[period]} を解除`}
                className={ACTIVE_CHIP_REMOVE}
                onClick={() => navigate({ period: null })}
              >
                <X className="size-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className={ACTIVE_CHIPS_CLEAR}
            onClick={clearAll}
          >
            すべて解除
          </button>
        </div>
      ) : null}

      {/* Backdrop: click-to-close. `aria-hidden` keeps it out of the AT tree;
          keyboard close is handled by the global Esc listener above. */}
      <div
        className={DRAWER_BACKDROP}
        data-open={open || undefined}
        aria-hidden="true"
        onClick={close}
      />
      <aside
        className={DRAWER}
        data-open={open || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Keep the panel out of the tab order / AT tree while closed so the
        // off-screen comboboxes are not reachable behind the page.
        inert={!open}
        aria-hidden={open ? undefined : "true"}
      >
        <div className={DRAWER_HEADER}>
          <div id={titleId} className={DRAWER_TITLE}>
            フィルター
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className={DRAWER_CLOSE}
            aria-label="閉じる"
            onClick={close}
          >
            <X className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>

        <div className={DRAWER_BODY}>
          <UserFacet
            username={username}
            onSelect={(name) => navigate({ username: name })}
            onClear={() => navigate({ username: null })}
          />
          <TagFacet selected={tags} onAdd={addTag} onRemove={removeTag} />
          <PeriodFacetSection
            selected={period}
            facetByPeriod={facetByPeriod}
            onSelect={(p) => navigate({ period: p })}
          />
        </div>

        <div className={DRAWER_FOOTER}>
          <button type="button" className={DRAWER_RESET} onClick={clearAll}>
            すべてリセット
          </button>
          <button type="button" className={DRAWER_APPLY} onClick={close}>
            {keyword.trim().length > 0
              ? `${selectedPeriodCount} 件を表示`
              : "閉じる"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Facet sections
// ---------------------------------------------------------------------------

type UserSuggestion = Readonly<{ username: string; displayName: string }>;

function UserFacet({
  username,
  onSelect,
  onClear,
}: Readonly<{
  username: string | null;
  onSelect: (username: string) => void;
  onClear: () => void;
}>) {
  const listId = useId();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<readonly UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useDebouncedSuggest(
    input,
    async (prefix, isCurrent) => {
      const { suggestions: result } = await suggestPublicUsersFn({
        data: { prefix },
      });
      if (!isCurrent()) return;
      setSuggestions(result);
      setOpen(true);
    },
    () => {
      setSuggestions([]);
      setOpen(false);
    },
  );

  return (
    <div className={FACET_SECTION}>
      <div className={FACET_HEADER}>
        <div className={FACET_TITLE}>ユーザー</div>
        {username !== null ? (
          <div className={FACET_SELECTED_COUNT}>1 件選択中</div>
        ) : null}
      </div>
      <div className={TOKEN_INPUT}>
        {username !== null ? (
          <span className={TOKEN}>
            <span className={TOKEN_LABEL}>
              <span className={TOKEN_AVATAR} aria-hidden="true">
                {initials(username)}
              </span>
              @{username}
            </span>
            <button
              type="button"
              aria-label={`@${username} を解除`}
              className={TOKEN_REMOVE}
              onClick={onClear}
            >
              <X className="size-[11px]" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <input
          type="text"
          className={TOKEN_FIELD}
          placeholder="ユーザー名を入力…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
      </div>
      <div id={listId} role="listbox" hidden={!open} aria-label="ユーザー候補">
        {open ? (
          suggestions.length > 0 ? (
            <div className={SUGGESTIONS}>
              {suggestions.map((s) => (
                <button
                  key={s.username}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={SUGGESTION_ITEM}
                  onClick={() => {
                    onSelect(s.username);
                    setInput("");
                    setSuggestions([]);
                    setOpen(false);
                  }}
                >
                  <span className={SUGGESTION_LABEL}>
                    <span className={SUGGESTION_AVATAR} aria-hidden="true">
                      {initials(s.displayName || s.username)}
                    </span>
                    @{s.username}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={SUGGESTIONS}>
              <div className={SUGGESTION_EMPTY}>候補がありません</div>
            </div>
          )
        ) : null}
      </div>
      <div className={FACET_HINT}>
        ユーザー名の一部を入力すると候補が表示されます
      </div>
    </div>
  );
}

function TagFacet({
  selected,
  onAdd,
  onRemove,
}: Readonly<{
  selected: readonly string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}>) {
  const listId = useId();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);

  useDebouncedSuggest(
    input,
    async (prefix, isCurrent) => {
      const { suggestions: result } = await suggestPublicTagsFn({
        data: { prefix },
      });
      if (!isCurrent()) return;
      setSuggestions(result.map((r) => r.name));
      setOpen(true);
    },
    () => {
      setSuggestions([]);
      setOpen(false);
    },
  );

  const visible = suggestions.filter((name) => !selected.includes(name));

  return (
    <div className={FACET_SECTION}>
      <div className={FACET_HEADER}>
        <div className={FACET_TITLE}>タグ</div>
        {selected.length > 0 ? (
          <div className={FACET_SELECTED_COUNT}>{selected.length} 件選択中</div>
        ) : null}
      </div>
      <div className={TOKEN_INPUT}>
        {selected.map((tag) => (
          <span key={tag} className={TOKEN}>
            <span className={TOKEN_LABEL}>#{tag}</span>
            <button
              type="button"
              aria-label={`#${tag} を解除`}
              className={TOKEN_REMOVE}
              onClick={() => onRemove(tag)}
            >
              <X className="size-[11px]" strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          type="text"
          className={TOKEN_FIELD}
          placeholder="タグ名を入力…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => visible.length > 0 && setOpen(true)}
        />
      </div>
      <div id={listId} role="listbox" hidden={!open} aria-label="タグ候補">
        {open ? (
          visible.length > 0 ? (
            <div className={SUGGESTIONS}>
              {visible.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={SUGGESTION_ITEM}
                  onClick={() => {
                    onAdd(name);
                    setInput("");
                    setSuggestions([]);
                    setOpen(false);
                  }}
                >
                  <span className={SUGGESTION_LABEL}>#{name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={SUGGESTIONS}>
              <div className={SUGGESTION_EMPTY}>候補がありません</div>
            </div>
          )
        ) : null}
      </div>
      <div className={FACET_HINT}>
        タグ名の一部を入力すると候補が表示されます
      </div>
    </div>
  );
}

function PeriodFacetSection({
  selected,
  facetByPeriod,
  onSelect,
}: Readonly<{
  selected: SearchPeriod | null;
  facetByPeriod: ReadonlyMap<SearchPeriod, number>;
  onSelect: (period: SearchPeriod) => void;
}>) {
  return (
    <div className={FACET_SECTION}>
      <div className={FACET_HEADER}>
        <div className={FACET_TITLE}>期間</div>
      </div>
      <div className={FACET_LIST}>
        {SEARCH_PERIODS.map((p) => (
          <label key={p} className={FACET_ITEM}>
            <input
              type="radio"
              name="search-period"
              className={FACET_RADIO}
              checked={selected === p}
              onChange={() => onSelect(p)}
            />
            <span className={FACET_LABEL}>{PERIOD_LABELS[p]}</span>
            <span className={FACET_COUNT}>{facetByPeriod.get(p) ?? 0}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Debounced suggestion fetch. Runs `fetcher` after the user stops typing for
 * `SUGGEST_DEBOUNCE_MS`; an empty / whitespace input clears via `onEmpty`
 * without a round trip. A monotonic request id drops stale responses so a
 * slow earlier fetch cannot overwrite a newer one (race guard).
 */
function useDebouncedSuggest(
  input: string,
  fetcher: (prefix: string, isCurrent: () => boolean) => Promise<void>,
  onEmpty: () => void,
) {
  const requestId = useRef(0);
  // Hold the latest callbacks in a ref so the effect can depend on `input`
  // alone (the callbacks are recreated each render but behaviourally stable).
  const fetcherRef = useRef(fetcher);
  const onEmptyRef = useRef(onEmpty);
  fetcherRef.current = fetcher;
  onEmptyRef.current = onEmpty;

  useEffect(() => {
    const prefix = input.trim();
    if (prefix.length === 0) {
      onEmptyRef.current();
      return;
    }
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      void fetcherRef
        .current(prefix, () => id === requestId.current)
        .catch(() => {
          // A failed suggestion fetch is non-fatal; leave the prior list.
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input]);
}
