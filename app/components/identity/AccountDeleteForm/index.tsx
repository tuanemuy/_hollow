"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnDanger } from "@/components/common/styles";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { USERNAME_MAX } from "../schema";
import {
  ACTION_ROW,
  FIELD_ERROR,
  SECTION,
  SECTION_DESC,
  SECTION_TITLE,
} from "../styles";
import { deleteAccountFn } from "./action";

export function AccountDeleteForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const deleteAccount = useServerFn(deleteAccountFn);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const fieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.confirmation : undefined;
  const summary =
    error !== null && fieldErrors === undefined ? displayError(error) : "";

  const onConfirm = () => {
    if (draft !== user.username) {
      setError({
        kind: "validation",
        code: null,
        message: "ユーザー名が一致しません",
        fieldErrors: { confirmation: ["ユーザー名が一致しません"] },
      });
      return;
    }
    startTransition(async () => {
      try {
        await deleteAccount({ data: { confirmation: draft } });
        // 過去訪問で cached された _app match に残る旧 userDto を破棄する（navigate との race 回避）
        router.clearCache({ filter: (match) => match.routeId === "/_app" });
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
    // error は保持: summary 表示寿命は「次のトリガー開」または「次の submit 成功」まで
  };

  return (
    <section className={SECTION}>
      <h2 className={SECTION_TITLE}>アカウント削除</h2>
      <p className={SECTION_DESC}>
        アカウントを削除すると、ノート、メディア、公開リンク、進行中の
        エクスポートジョブを含むすべてのデータが失われます。この操作は
        取り消せません。
      </p>
      <div className={ACTION_ROW}>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnDanger}`}
          data-danger=""
          onClick={() => {
            setError(null);
            setDraft("");
            setConfirmOpen(true);
          }}
          disabled={isPending}
        >
          <Icon icon={Trash2} />
          続けて削除する
        </button>
      </div>
      {summary !== "" ? (
        <p role="alert" aria-live="polite" className={FIELD_ERROR}>
          {summary}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="本当にアカウントを削除しますか？"
        description={
          <>
            <p>
              確認のため、ユーザー名 <code>{user.username}</code>{" "}
              をそのまま入力してください。
            </p>
            <label htmlFor={inputId}>
              ユーザー名 <code>{user.username}</code> を入力
            </label>
            <input
              id={inputId}
              name="confirmation"
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error?.kind === "validation") setError(null);
              }}
              maxLength={USERNAME_MAX}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              required
              disabled={isPending}
              aria-invalid={fieldErrors !== undefined && fieldErrors.length > 0}
              aria-describedby={
                // error 優先順で読み上げる: SR は aria-describedby の id 順に読む
                [
                  fieldErrors !== undefined && fieldErrors.length > 0
                    ? errorId
                    : null,
                  hintId,
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            />
            {fieldErrors !== undefined && fieldErrors.length > 0 ? (
              <p id={errorId} role="alert">
                {fieldErrors[0]}
              </p>
            ) : null}
            <p id={hintId} className="text-xs text-ink-tertiary">
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
