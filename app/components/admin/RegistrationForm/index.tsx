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
      <section className="admin-toggle-card">
        <div className="admin-toggle-card-body">
          <div className="admin-toggle-card-label">サインアップ公開</div>
          <div className="admin-toggle-card-state">
            現在の状態: <strong>{open ? "公開中" : "停止中"}</strong>
          </div>
        </div>
        <button
          type="button"
          className="admin-switch"
          role="switch"
          aria-checked={open}
          aria-label="サインアップ公開を切り替え"
          onClick={onToggleSwitch}
          disabled={isPending}
        />
      </section>

      <div className="admin-banner info">
        <div className="admin-banner-body">
          <strong>既存ユーザーには影響しません</strong>
          停止状態にしても、登録済みのユーザーは通常通りログイン・利用できます。サインアップ画面のみが「停止中」表示に切り替わります。
        </div>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-title">停止中の表示文言</h2>
        <p className="admin-section-desc">
          サインアップ停止状態のとき、サインアップ画面に表示されるメッセージ。Markdown
          非対応。
        </p>
        <label className="admin-field-label" htmlFor={reasonId}>
          表示文言
        </label>
        <textarea
          id={reasonId}
          className="admin-textarea"
          spellCheck={false}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={isPending}
          placeholder="現在、新規登録を停止しています。"
        />
        <p className="admin-field-hint">
          空欄の場合はデフォルト文言が使用されます。
        </p>
      </section>

      <div className="admin-form-footer">
        {savedAt !== null && error === null ? (
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
        <button
          type="button"
          className="admin-btn primary"
          onClick={onSaveReason}
          disabled={isPending}
        >
          {isPending ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </>
  );
}
