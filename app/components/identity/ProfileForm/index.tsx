"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { BIO_MAX, DISPLAY_NAME_MAX, USERNAME_MAX } from "../schema";
import {
  ACTION_ROW,
  BTN_PRIMARY,
  CURRENT_VALUE,
  CURRENT_VALUE_STRONG,
  FIELD,
  FIELD_ERROR,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_TEXTAREA,
  FORM,
  SECTION,
  SECTION_DIVIDER,
  SECTION_TITLE,
  SUCCESS_MSG,
} from "../styles";
import { changeUsernameFn, updateProfileFn } from "./action";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

export function ProfileForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const updateProfile = useServerFn(updateProfileFn);
  const changeUsername = useServerFn(changeUsernameFn);

  const displayNameId = useId();
  const bioId = useId();
  const usernameId = useId();

  const [profileState, profileAction, profilePending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const displayName = String(formData.get("displayName") ?? "").trim();
    const bio = String(formData.get("bio") ?? "");
    try {
      await updateProfile({
        data: {
          displayName,
          bio: bio.length === 0 ? null : bio,
        },
      });
      // Header の displayName / avatar を更新するため _app も invalidate（rule 3）
      await router.invalidate();
      return { error: null, ok: true };
    } catch (e) {
      return { error: extractSerializedError(e), ok: false };
    }
  }, initial);

  const [usernameState, usernameAction, usernamePending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const newUsername = String(formData.get("newUsername") ?? "").trim();
    try {
      await changeUsername({ data: { newUsername } });
      await routerInvalidate(router);
      return { error: null, ok: true };
    } catch (e) {
      return { error: extractSerializedError(e), ok: false };
    }
  }, initial);

  const profileFieldErrors =
    profileState.error?.kind === "validation"
      ? profileState.error.fieldErrors
      : undefined;
  const profileSummary =
    profileState.error !== null && profileFieldErrors === undefined
      ? displayError(profileState.error)
      : "";

  const usernameFieldErrors =
    usernameState.error?.kind === "validation"
      ? usernameState.error.fieldErrors?.newUsername
      : undefined;
  const usernameSummary =
    usernameState.error !== null && usernameFieldErrors === undefined
      ? displayError(usernameState.error)
      : "";

  return (
    <section className={SECTION}>
      <h2 className={SECTION_TITLE}>プロフィール</h2>

      <form action={profileAction} className={FORM}>
        <div className={FIELD}>
          <label htmlFor={displayNameId} className={FIELD_LABEL}>
            表示名
          </label>
          <input
            id={displayNameId}
            name="displayName"
            type="text"
            defaultValue={user.displayName}
            maxLength={DISPLAY_NAME_MAX}
            disabled={profilePending}
            required
            className={FIELD_INPUT}
          />
          {profileFieldErrors?.displayName !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {profileFieldErrors.displayName[0]}
            </p>
          ) : null}
        </div>

        <div className={FIELD}>
          <label htmlFor={bioId} className={FIELD_LABEL}>
            自己紹介
          </label>
          <textarea
            id={bioId}
            name="bio"
            rows={4}
            maxLength={BIO_MAX}
            defaultValue={user.bio ?? ""}
            disabled={profilePending}
            className={FIELD_TEXTAREA}
          />
          {profileFieldErrors?.bio !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {profileFieldErrors.bio[0]}
            </p>
          ) : null}
        </div>

        <div className={ACTION_ROW}>
          <button
            type="submit"
            disabled={profilePending}
            className={BTN_PRIMARY}
          >
            {profilePending ? "保存中..." : "保存"}
          </button>
        </div>
        {profileSummary !== "" ? (
          <p role="alert" className={FIELD_ERROR}>
            {profileSummary}
          </p>
        ) : null}
        {profileState.ok ? (
          <p aria-live="polite" className={SUCCESS_MSG}>
            保存しました
          </p>
        ) : null}
      </form>

      <hr className={SECTION_DIVIDER} />

      <h2 className={SECTION_TITLE}>ユーザー名（URL）</h2>
      <p className={CURRENT_VALUE}>
        現在: <strong className={CURRENT_VALUE_STRONG}>@{user.username}</strong>
      </p>
      <form action={usernameAction} className={FORM}>
        <div className={FIELD}>
          <label htmlFor={usernameId} className={FIELD_LABEL}>
            新しいユーザー名
          </label>
          <input
            id={usernameId}
            name="newUsername"
            type="text"
            maxLength={USERNAME_MAX}
            disabled={usernamePending}
            required
            className={FIELD_INPUT}
          />
          {usernameFieldErrors !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {usernameFieldErrors[0]}
            </p>
          ) : null}
        </div>
        <div className={ACTION_ROW}>
          <button
            type="submit"
            disabled={usernamePending}
            className={BTN_PRIMARY}
          >
            {usernamePending ? "変更中..." : "ユーザー名を変更"}
          </button>
        </div>
        {usernameSummary !== "" ? (
          <p role="alert" className={FIELD_ERROR}>
            {usernameSummary}
          </p>
        ) : null}
        {usernameState.ok ? (
          <p aria-live="polite" className={SUCCESS_MSG}>
            変更しました
          </p>
        ) : null}
      </form>
    </section>
  );
}
