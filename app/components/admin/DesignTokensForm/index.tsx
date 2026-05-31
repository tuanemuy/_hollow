"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { DesignTokenDTO } from "@/core/application/dto/adminSettings";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { resetDesignTokensFn, updateDesignTokensFn } from "./action";

type TokenEntry = {
  key: string;
  value: string;
  /** Built-in default value, or `null` for an ad-hoc override key. */
  defaultValue: string | null;
};

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

const BADGE_CLASS =
  "inline-flex items-center h-5 px-2 rounded-pill bg-accent-surface text-accent text-xs font-medium";

function dtoToEntries(
  designTokens: Readonly<Record<string, DesignTokenDTO>>,
  designTokenDefaults: Readonly<Record<string, string>>,
): TokenEntry[] {
  return Object.entries(designTokens).map(([key, dto]) => ({
    key,
    value: dto.value,
    defaultValue: designTokenDefaults[key] ?? null,
  }));
}

/**
 * Collect entries to send to the wholesale `updateDesignTokens`. Empty values
 * (an empty field means "back to default"; the VO forbids empty) and
 * keyless rows are skipped. The usecase additionally drops default-equal
 * entries, so sending them here is harmless (double defence).
 */
function entriesToRecord(
  entries: readonly TokenEntry[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key.length === 0) continue;
    if (entry.value.trim().length === 0) continue;
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

function isOverriddenRow(entry: TokenEntry): boolean {
  // Ad-hoc override keys have no default to compare against and are always
  // an override; curated keys are overridden when the value differs from
  // the built-in default.
  if (entry.defaultValue === null) return true;
  return entry.value !== entry.defaultValue;
}

export function DesignTokensForm({
  designTokens,
  designTokenDefaults,
}: {
  designTokens: Readonly<Record<string, DesignTokenDTO>>;
  designTokenDefaults: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const updateTokens = useServerFn(updateDesignTokensFn);
  const resetTokens = useServerFn(resetDesignTokensFn);

  const [entries, setEntries] = useState<TokenEntry[]>(() =>
    dtoToEntries(designTokens, designTokenDefaults),
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
        await routerInvalidate(router);
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
        await routerInvalidate(router);
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

  // Design tokens are persisted wholesale (no per-key reset usecase exists).
  // "既定に戻す" therefore rewrites the whole override set:
  // - curated default key: snap the row's value back to its default, then
  //   resend all entries (the usecase drops the now-default-equal entry, so
  //   the override disappears) — the row itself stays visible.
  // - ad-hoc override key (no default): remove the row entirely, then resend.
  const onRowReset = (index: number) => {
    const target = entries[index];
    if (target === undefined) return;
    const nextEntries =
      target.defaultValue === null
        ? entries.filter((_, i) => i !== index)
        : entries.map((entry, i) =>
            i === index ? { ...entry, value: entry.defaultValue ?? "" } : entry,
          );
    startRowResetTransition(async () => {
      setRowResetError(null);
      try {
        const record = entriesToRecord(nextEntries);
        await updateTokens({ data: { tokens: record } });
        setEntries(nextEntries);
        await routerInvalidate(router);
      } catch (caught) {
        setRowResetError(extractSerializedError(caught));
      }
    });
  };

  const onAddRow = () => {
    setEntries((current) => [
      ...current,
      { key: "", value: "", defaultValue: null },
    ]);
  };

  const summary = state.error !== null ? displayError(state.error) : "";
  const resetSummary = resetError !== null ? displayError(resetError) : "";
  const rowResetSummary =
    rowResetError !== null ? displayError(rowResetError) : "";
  const busy = isPending || isResetting || isRowResetting;
  const anyOverridden = entries.some(isOverriddenRow);

  return (
    <>
      <form action={formAction}>
        <p className="text-sm text-ink-secondary m-0 mb-5">
          ビルトインの既定値が初期表示されています。値を変更して保存すると上書きされ、既定値のままの行は永続化されません。設定したトークンはエクスポート時の
          CSS に注入されます。トークンの一覧は{" "}
          <code className="font-mono text-xs">spec/design/tokens.md</code>{" "}
          を参照してください。
        </p>

        {entries.length === 0 ? (
          <div className={CARD_CLASS}>
            <p className="m-0 text-sm text-ink-secondary">
              トークンがありません。「+ トークンを追加」から追加してください。
            </p>
          </div>
        ) : (
          <div className={CARD_CLASS}>
            {entries.map((entry, index) => {
              const overridden = isOverriddenRow(entry);
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: token rows are reorderable only by add/remove, position is stable within a render
                  key={index}
                  className="grid grid-cols-[220px_1fr] gap-3 py-2 items-start border-b border-hairline last:border-b-0"
                >
                  <div className="flex flex-col gap-1 pt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className={`${INPUT_CLASS} font-mono text-xs text-ink-secondary h-8`}
                        value={entry.key}
                        placeholder="--color-accent"
                        onChange={(event) =>
                          onRowChange(index, { key: event.target.value })
                        }
                        disabled={busy || entry.defaultValue !== null}
                        aria-label={`トークン名 ${index + 1}`}
                      />
                      {overridden ? (
                        <span className={BADGE_CLASS}>上書き中</span>
                      ) : null}
                    </div>
                    {entry.defaultValue !== null ? (
                      <p className="text-xs text-ink-tertiary font-mono break-all">
                        既定値: {entry.defaultValue}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
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
                      data-overridden={overridden || undefined}
                      onChange={(event) =>
                        onRowChange(index, { value: event.target.value })
                      }
                      disabled={busy}
                      aria-label={`トークン値 ${index + 1}`}
                    />
                    <button
                      type="button"
                      className={BTN_SM_DESTRUCTIVE_CLASS}
                      onClick={() => onRowReset(index)}
                      disabled={busy || !overridden}
                      aria-label={`${entry.key.trim().length === 0 ? "この行" : entry.key} を既定に戻す`}
                    >
                      {entry.defaultValue === null ? "削除" : "既定に戻す"}
                    </button>
                  </div>
                </div>
              );
            })}
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
            disabled={busy || !anyOverridden}
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
        confirmIcon={RotateCcw}
        isPending={isResetting}
        onConfirm={onConfirmReset}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
