"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { toggleRegistrationPolicyFn } from "./action";

type Props = {
  initial: Readonly<{ open: boolean; closedReason: string | null }>;
};

const BTN_PRIMARY_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed";

const TEXTAREA_CLASS =
  "w-full min-h-[140px] px-3 py-[10px] bg-surface border border-transparent rounded-md font-mono text-xs text-ink leading-relaxed outline-none resize-y transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none focus:bg-bg focus:border-hairline-strong";

export function RegistrationForm({ initial }: Props) {
  const router = useRouter();
  const toggle = useServerFn(toggleRegistrationPolicyFn);

  const [open, setOpen] = useState(initial.open);
  const [reason, setReason] = useState(initial.closedReason ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const reasonId = useId();

  const onToggleSwitch = () => {
    const next = !open;
    setOpen(next);
    startTransition(async () => {
      setError(null);
      try {
        await toggle({
          data: { open: next, closedReason: reason },
        });
        await router.invalidate();
        setSavedAt(Date.now());
      } catch (caught) {
        setOpen(!next);
        setError(extractSerializedError(caught));
      }
    });
  };

  const onSaveReason = () => {
    startTransition(async () => {
      setError(null);
      try {
        await toggle({
          data: { open, closedReason: reason },
        });
        await router.invalidate();
        setSavedAt(Date.now());
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <>
      <section className="flex items-center gap-4 border border-hairline rounded-lg p-5 mb-6">
        <div className="flex-1 min-w-0">
          <div className="text-md font-medium mb-[2px]">サインアップ公開</div>
          <div className="text-sm text-ink-secondary">
            現在の状態: <strong>{open ? "公開中" : "停止中"}</strong>
          </div>
        </div>
        <button
          type="button"
          className="relative w-12 h-7 shrink-0 rounded-pill bg-surface transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none aria-checked:bg-accent after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-[22px] after:h-[22px] after:rounded-full after:bg-white after:shadow-xs after:transition-transform after:duration-[var(--duration-base)] after:ease-[var(--ease-standard)] motion-reduce:after:transition-none aria-checked:after:translate-x-5"
          role="switch"
          aria-checked={open}
          aria-label="サインアップ公開を切り替え"
          onClick={onToggleSwitch}
          disabled={isPending}
        />
      </section>

      <div className="flex items-start gap-3 mb-6 px-5 py-4 rounded-lg text-sm text-ink bg-accent-surface">
        <div className="flex-1 text-ink">
          <strong className="block mb-[2px] font-semibold">
            既存ユーザーには影響しません
          </strong>
          停止状態にしても、登録済みのユーザーは通常通りログイン・利用できます。サインアップ画面のみが「停止中」表示に切り替わります。
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-semibold tracking-tight m-0">
          停止中の表示文言
        </h2>
        <p className="text-sm text-ink-secondary m-0 mb-4">
          サインアップ停止状態のとき、サインアップ画面に表示されるメッセージ。Markdown
          非対応。
        </p>
        <label
          className="block text-sm font-medium text-ink mb-[6px]"
          htmlFor={reasonId}
        >
          表示文言
        </label>
        <textarea
          id={reasonId}
          className={TEXTAREA_CLASS}
          spellCheck={false}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isPending}
          placeholder="現在、新規登録を停止しています。"
        />
        <p className="text-xs text-ink-tertiary mt-1">
          空欄の場合はデフォルト文言が使用されます。
        </p>
      </section>

      <div className="flex gap-3 justify-end pt-6 border-t border-hairline mt-10">
        {savedAt !== null && error === null ? (
          <span className="text-success text-sm">保存しました</span>
        ) : null}
        {summary !== "" ? (
          <span className="text-error text-sm">{summary}</span>
        ) : null}
        <button
          type="button"
          className={BTN_PRIMARY_CLASS}
          onClick={onSaveReason}
          disabled={isPending}
        >
          {isPending ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </>
  );
}
