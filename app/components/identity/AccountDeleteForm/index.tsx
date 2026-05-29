"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { PILL_BTN } from "@/components/layout/styles";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { USERNAME_MAX } from "../schema";
import { deleteAccountFn } from "./action";

export function AccountDeleteForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const deleteAccount = useServerFn(deleteAccountFn);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputId = useId();

  const fieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.confirmation : undefined;
  const summary =
    error !== null && fieldErrors === undefined ? displayError(error) : "";

  const onConfirm = () => {
    if (draft !== user.username) return;
    startTransition(async () => {
      try {
        await deleteAccount({ data: { confirmation: draft } });
        // 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）
        await router.invalidate();
        await router.navigate({ to: "/", search: HOME_SEARCH });
        setError(null);
      } catch (e) {
        const next = extractSerializedError(e);
        const isFieldValidation =
          next.kind === "validation" &&
          next.fieldErrors?.confirmation !== undefined;
        if (!isFieldValidation) {
          setConfirmOpen(false);
        }
        setError(next);
      }
    });
  };

  const closeDialog = () => {
    setConfirmOpen(false);
    setDraft("");
    setError(null);
  };

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
        className={PILL_BTN}
        data-danger=""
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
      >
        <Icon icon={Trash2} />
        続けて削除する
      </button>
      {summary !== "" ? <p role="alert">{summary}</p> : null}
      <ConfirmDialog
        open={confirmOpen}
        title="本当にアカウントを削除しますか？"
        description={
          <>
            <p>
              確認のため、ユーザー名 <code>{user.username}</code>{" "}
              をそのまま入力してください。
            </p>
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
            <p className="text-xs text-ink-tertiary">
              ユーザー名が一致すると削除が実行されます。Tab
              キーで入力欄に移動できます。
            </p>
          </>
        }
        confirmLabel="アカウントを完全に削除する"
        confirmIcon={Trash2}
        isPending={isPending}
        onConfirm={onConfirm}
        onClose={closeDialog}
      />
    </section>
  );
}
