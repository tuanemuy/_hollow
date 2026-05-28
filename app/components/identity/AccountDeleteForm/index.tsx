"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { USERNAME_MAX } from "../schema";
import { deleteAccountFn } from "./action";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

export function AccountDeleteForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const deleteAccount = useServerFn(deleteAccountFn);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [draft, setDraft] = useState("");

  const inputId = useId();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const confirmation = String(formData.get("confirmation") ?? "");
      try {
        await deleteAccount({ data: { confirmation } });
        // 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）
        await router.invalidate();
        await router.navigate({ to: "/", search: HOME_SEARCH });
        return { error: null, ok: true };
      } catch (e) {
        return { error: extractSerializedError(e), ok: false };
      }
    },
    initial,
  );

  const fieldErrors =
    state.error?.kind === "validation"
      ? state.error.fieldErrors?.confirmation
      : undefined;
  const summary =
    state.error !== null && fieldErrors === undefined
      ? displayError(state.error)
      : "";

  const canConfirm = draft === user.username;

  if (!confirmDialog) {
    return (
      <section>
        <h2>アカウント削除</h2>
        <p>
          アカウントを削除すると、ノート、メディア、公開リンク、進行中の
          エクスポートジョブを含むすべてのデータが失われます。この操作は
          取り消せません。
        </p>
        <button
          type="button"
          onClick={() => setConfirmDialog(true)}
          disabled={isPending}
        >
          続けて削除する
        </button>
      </section>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${inputId}-heading`}
    >
      <h2 id={`${inputId}-heading`}>本当にアカウントを削除しますか？</h2>
      <p>
        確認のため、ユーザー名 <code>{user.username}</code>{" "}
        をそのまま入力してください。
      </p>
      <form action={formAction}>
        <label htmlFor={inputId}>ユーザー名（確認）</label>
        <input
          id={inputId}
          name="confirmation"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={USERNAME_MAX}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          disabled={isPending}
          aria-invalid={fieldErrors !== undefined}
        />
        {fieldErrors !== undefined ? (
          <p role="alert">{fieldErrors[0]}</p>
        ) : null}
        <button
          type="submit"
          disabled={isPending || !canConfirm}
          aria-disabled={!canConfirm}
        >
          {isPending ? "削除中..." : "アカウントを完全に削除する"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmDialog(false);
            setDraft("");
          }}
          disabled={isPending}
        >
          キャンセル
        </button>
        {summary !== "" ? <p role="alert">{summary}</p> : null}
      </form>
    </section>
  );
}
