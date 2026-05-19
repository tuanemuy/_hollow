"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { resetDesignTokensFn, updateDesignTokensFn } from "./action";

type TokenEntry = { key: string; value: string };

type FormState = {
  error: SerializedError | null;
  success: boolean;
};

const initialState: FormState = { error: null, success: false };

const BTN_BASE =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:opacity-50 disabled:cursor-not-allowed";

const BTN_CLASS = `${BTN_BASE} bg-surface text-ink hover:not-disabled:bg-surface-hover`;
const BTN_PRIMARY_CLASS = `${BTN_BASE} bg-accent text-white hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed`;
const BTN_DESTRUCTIVE_CLASS = `${BTN_BASE} bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`;

const BTN_SM_CLASS =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-xs font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_SM_DESTRUCTIVE_CLASS = `${BTN_SM_CLASS} bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`;

const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";

const CARD_CLASS = "border border-hairline rounded-lg p-5 bg-bg mb-5";

function tokensToEntries(
  tokens: Readonly<Record<string, string>>,
): TokenEntry[] {
  return Object.entries(tokens).map(([key, value]) => ({ key, value }));
}

function entriesToRecord(
  entries: readonly TokenEntry[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key.length === 0) continue;
    out[key] = entry.value;
  }
  return out;
}

function isColorValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("rgb") ||
    trimmed.startsWith("oklch") ||
    trimmed.startsWith("hsl")
  );
}

export function DesignTokensForm({
  initialTokens,
}: {
  initialTokens: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const updateTokens = useServerFn(updateDesignTokensFn);
  const resetTokens = useServerFn(resetDesignTokensFn);

  const [entries, setEntries] = useState<TokenEntry[]>(() =>
    tokensToEntries(initialTokens),
  );
  const [isResetting, startResetTransition] = useTransition();
  const [resetError, setResetError] = useState<SerializedError | null>(null);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async () => {
      try {
        const record = entriesToRecord(entries);
        await updateTokens({ data: { tokens: record } });
        await router.invalidate();
        return { error: null, success: true };
      } catch (caught) {
        return { error: extractSerializedError(caught), success: false };
      }
    },
    initialState,
  );

  const onReset = () => {
    startResetTransition(async () => {
      setResetError(null);
      try {
        await resetTokens({ data: {} });
        setEntries([]);
        await router.invalidate();
      } catch (caught) {
        setResetError(extractSerializedError(caught));
      }
    });
  };

  const onRowChange = (index: number, patch: Partial<TokenEntry>) => {
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };
  const onRowRemove = (index: number) => {
    setEntries((current) => current.filter((_, i) => i !== index));
  };
  const onAddRow = () => {
    setEntries((current) => [...current, { key: "", value: "" }]);
  };

  const summary = state.error !== null ? displayError(state.error) : "";
  const resetSummary = resetError !== null ? displayError(resetError) : "";

  return (
    <form action={formAction}>
      <p className="text-sm text-ink-secondary m-0 mb-5">
        ここで設定したトークンはエクスポート時の CSS に注入されます（DB
        値が空の場合はビルトインの既定値が使われます）。
      </p>

      {entries.length === 0 ? (
        <div className={CARD_CLASS}>
          <p className="m-0 text-sm text-ink-secondary">
            上書きトークンは登録されていません。「+
            トークンを追加」から追加してください。
          </p>
        </div>
      ) : (
        <div className={CARD_CLASS}>
          {entries.map((entry, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: token rows are reorderable only by add/remove, position is stable within a render
              key={index}
              className="grid grid-cols-[220px_1fr] gap-3 py-2 items-center border-b border-hairline last:border-b-0"
            >
              <input
                type="text"
                className={`${INPUT_CLASS} font-mono text-xs text-ink-secondary`}
                value={entry.key}
                placeholder="--color-accent"
                onChange={(event) =>
                  onRowChange(index, { key: event.target.value })
                }
                disabled={isPending}
                aria-label={`トークン名 ${index + 1}`}
              />
              <div className="flex items-center gap-2">
                {isColorValue(entry.value) ? (
                  <span
                    className="w-6 h-6 shrink-0 rounded-sm border border-hairline"
                    style={{ background: entry.value }}
                    aria-hidden="true"
                  />
                ) : null}
                <input
                  type="text"
                  className={`${INPUT_CLASS} flex-1 font-mono text-xs h-8 px-[10px] py-[6px]`}
                  value={entry.value}
                  onChange={(event) =>
                    onRowChange(index, { value: event.target.value })
                  }
                  disabled={isPending}
                  aria-label={`トークン値 ${index + 1}`}
                />
                <button
                  type="button"
                  className={BTN_SM_DESTRUCTIVE_CLASS}
                  onClick={() => onRowRemove(index)}
                  disabled={isPending}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={BTN_CLASS}
        onClick={onAddRow}
        disabled={isPending}
      >
        ＋ トークンを追加
      </button>

      <div className="flex gap-3 justify-end pt-6 border-t border-hairline mt-10">
        <button
          type="button"
          className={BTN_DESTRUCTIVE_CLASS}
          onClick={onReset}
          disabled={isResetting}
        >
          {isResetting ? "リセット中..." : "初期値リセット"}
        </button>
        <div className="flex-1" />
        {state.success && state.error === null ? (
          <span className="text-success text-sm">保存しました</span>
        ) : null}
        {summary !== "" ? (
          <span className="text-error text-sm">{summary}</span>
        ) : null}
        {resetSummary !== "" ? (
          <span className="text-error text-sm">{resetSummary}</span>
        ) : null}
        <button
          type="submit"
          className={BTN_PRIMARY_CLASS}
          disabled={isPending}
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
