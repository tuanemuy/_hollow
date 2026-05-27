"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:opacity-50 disabled:cursor-not-allowed";

const BTN_CLASS = `${BTN_BASE} bg-surface text-ink hover:not-disabled:bg-surface-hover`;
const BTN_PRIMARY_CLASS = `${BTN_BASE} bg-accent text-white hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed`;
const BTN_DESTRUCTIVE_CLASS = `${BTN_BASE} bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`;

const BTN_SM_CLASS =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-xs font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_SM_DESTRUCTIVE_CLASS = `${BTN_SM_CLASS} bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`;

const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";

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
  const [isRowResetting, startRowResetTransition] = useTransition();
  const [rowResetError, setRowResetError] = useState<SerializedError | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const onConfirmReset = () => {
    startResetTransition(async () => {
      setResetError(null);
      try {
        await resetTokens({ data: {} });
        setEntries([]);
        await router.invalidate();
        setConfirmOpen(false);
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

  // Persist row removal immediately so the operator's "reset this row" intent
  // is a single click rather than "remove row + Save" (Issue #218 plan Step 8).
  // Rows whose key is empty have never been persisted and can be dropped
  // locally without a server round-trip.
  const onRowRemove = (index: number) => {
    const target = entries[index];
    if (target === undefined) return;
    const nextEntries = entries.filter((_, i) => i !== index);
    if (target.key.trim().length === 0) {
      setEntries(nextEntries);
      return;
    }
    startRowResetTransition(async () => {
      setRowResetError(null);
      try {
        const record = entriesToRecord(nextEntries);
        await updateTokens({ data: { tokens: record } });
        setEntries(nextEntries);
        await router.invalidate();
      } catch (caught) {
        setRowResetError(extractSerializedError(caught));
      }
    });
  };

  const onAddRow = () => {
    setEntries((current) => [...current, { key: "", value: "" }]);
  };

  const summary = state.error !== null ? displayError(state.error) : "";
  const resetSummary = resetError !== null ? displayError(resetError) : "";
  const rowResetSummary =
    rowResetError !== null ? displayError(rowResetError) : "";
  const busy = isPending || isResetting || isRowResetting;

  return (
    <>
      <form action={formAction}>
        <p className="text-sm text-ink-secondary m-0 mb-5">
          ここで設定したトークンはエクスポート時の CSS に注入されます（DB
          値が空の場合はビルトインの既定値が使われます）。既定値の一覧は{" "}
          <code className="font-mono text-xs">spec/design/tokens.md</code>{" "}
          を参照してください。
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
                  disabled={busy}
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
                    disabled={busy}
                    aria-label={`トークン値 ${index + 1}`}
                  />
                  <button
                    type="button"
                    className={BTN_SM_DESTRUCTIVE_CLASS}
                    onClick={() => onRowRemove(index)}
                    disabled={busy}
                    aria-label={`${entry.key.trim().length === 0 ? "この行" : entry.key} を既定に戻す`}
                  >
                    既定に戻す
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
          disabled={busy}
        >
          ＋ トークンを追加
        </button>

        <div className="flex gap-3 justify-end pt-6 border-t border-hairline mt-10">
          <button
            type="button"
            className={BTN_DESTRUCTIVE_CLASS}
            onClick={() => setConfirmOpen(true)}
            disabled={busy || entries.length === 0}
          >
            {isResetting ? "リセット中..." : "すべてリセット"}
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
          {rowResetSummary !== "" ? (
            <span className="text-error text-sm">{rowResetSummary}</span>
          ) : null}
          <button type="submit" className={BTN_PRIMARY_CLASS} disabled={busy}>
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="すべてのデザイントークンをリセットしますか？"
        description="すべての上書きが削除され、ビルトインの既定値に戻ります。この操作は取り消せません。"
        confirmLabel={isResetting ? "リセット中..." : "リセット"}
        isPending={isResetting}
        onConfirm={onConfirmReset}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
