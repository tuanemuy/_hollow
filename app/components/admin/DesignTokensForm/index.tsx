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
      <p className="admin-form-section-desc">
        ここで設定したトークンはエクスポート時の CSS に注入されます（DB
        値が空の場合はビルトインの既定値が使われます）。
      </p>

      {entries.length === 0 ? (
        <div
          className="admin-card"
          style={{ marginBottom: "var(--admin-space-5)" }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "var(--admin-text-sm)",
              color: "var(--admin-color-ink-secondary)",
            }}
          >
            上書きトークンは登録されていません。「+
            トークンを追加」から追加してください。
          </p>
        </div>
      ) : (
        <div
          className="admin-card"
          style={{ marginBottom: "var(--admin-space-5)" }}
        >
          {entries.map((entry, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: token rows are reorderable only by add/remove, position is stable within a render
              key={index}
              className="admin-token-row"
            >
              <input
                type="text"
                className="admin-input admin-token-key"
                value={entry.key}
                placeholder="--color-accent"
                onChange={(event) =>
                  onRowChange(index, { key: event.target.value })
                }
                disabled={isPending}
                aria-label={`トークン名 ${index + 1}`}
              />
              <div className="admin-token-input-wrap">
                {isColorValue(entry.value) ? (
                  <span
                    className="admin-token-swatch"
                    style={{ background: entry.value }}
                    aria-hidden="true"
                  />
                ) : null}
                <input
                  type="text"
                  className="admin-input admin-token-input"
                  value={entry.value}
                  onChange={(event) =>
                    onRowChange(index, { value: event.target.value })
                  }
                  disabled={isPending}
                  aria-label={`トークン値 ${index + 1}`}
                />
                <button
                  type="button"
                  className="admin-btn sm destructive"
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
        className="admin-btn"
        onClick={onAddRow}
        disabled={isPending}
      >
        ＋ トークンを追加
      </button>

      <div className="admin-form-footer">
        <button
          type="button"
          className="admin-btn destructive"
          onClick={onReset}
          disabled={isResetting}
        >
          {isResetting ? "リセット中..." : "初期値リセット"}
        </button>
        <div style={{ flex: 1 }} />
        {state.success && state.error === null ? (
          <span
            style={{
              color: "var(--admin-color-success)",
              fontSize: "var(--admin-text-sm)",
            }}
          >
            保存しました
          </span>
        ) : null}
        {summary !== "" ? (
          <span
            style={{
              color: "var(--admin-color-error)",
              fontSize: "var(--admin-text-sm)",
            }}
          >
            {summary}
          </span>
        ) : null}
        {resetSummary !== "" ? (
          <span
            style={{
              color: "var(--admin-color-error)",
              fontSize: "var(--admin-text-sm)",
            }}
          >
            {resetSummary}
          </span>
        ) : null}
        <button
          type="submit"
          className="admin-btn primary"
          disabled={isPending}
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
