"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState } from "react";
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
  CHAR_COUNTER,
  CURRENT_VALUE,
  CURRENT_VALUE_STRONG,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_TEXTAREA,
  FORM,
  INPUT_GROUP,
  INPUT_GROUP_INPUT,
  INPUT_GROUP_PREFIX,
  SECTION,
  SECTION_DESC,
  SECTION_DIVIDER,
  SECTION_TITLE,
  SUCCESS_MSG,
  URL_PREVIEW,
} from "../styles";
import { changeUsernameFn, updateProfileFn } from "./action";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

export function ProfileForm({
  user,
  appUrl,
}: {
  user: UserDTO;
  appUrl: string;
}) {
  const router = useRouter();
  const updateProfile = useServerFn(updateProfileFn);
  const changeUsername = useServerFn(changeUsernameFn);

  const displayNameId = useId();
  const bioId = useId();
  const bioCounterId = useId();
  const usernameId = useId();
  const usernameHintId = useId();

  const [bioCount, setBioCount] = useState(user.bio?.length ?? 0);
  const [newUsername, setNewUsername] = useState("");

  // Normalize a trailing slash before joining `/u/<username>` (same as
  // `NoteDetail.tsx`). When `appUrl` is empty (env unset) we fall back to a
  // relative `/u/...` rather than fabricating a dummy host.
  const urlBase = appUrl.replace(/\/$/, "");
  const previewUsername = newUsername.trim() || user.username;
  const urlPrefix = urlBase === "" ? "/u/" : `${urlBase}/u/`;
  const urlPreview = `${urlPrefix}${previewUsername}`;

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
      setNewUsername("");
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
      <p className={SECTION_DESC}>
        公開プロフィールページや共有時の表示に使われます。
      </p>

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
            onChange={(e) => setBioCount(e.target.value.length)}
            disabled={profilePending}
            aria-describedby={bioCounterId}
            className={FIELD_TEXTAREA}
          />
          <p id={bioCounterId} className={CHAR_COUNTER}>
            {bioCount} / {BIO_MAX}
          </p>
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
            data-primary=""
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
          <div className={INPUT_GROUP}>
            <span className={INPUT_GROUP_PREFIX}>{urlPrefix}</span>
            <input
              id={usernameId}
              name="newUsername"
              type="text"
              maxLength={USERNAME_MAX}
              disabled={usernamePending}
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              aria-describedby={usernameHintId}
              className={INPUT_GROUP_INPUT}
            />
          </div>
          <p className={URL_PREVIEW}>{urlPreview}</p>
          <p id={usernameHintId} className={FIELD_HINT}>
            ユーザー名は30日に1回まで変更できます。
          </p>
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
            data-primary=""
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
