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
    <section>
      <h2>プロフィール</h2>

      <form action={profileAction}>
        <label htmlFor={displayNameId}>表示名</label>
        <input
          id={displayNameId}
          name="displayName"
          type="text"
          defaultValue={user.displayName}
          maxLength={DISPLAY_NAME_MAX}
          disabled={profilePending}
          required
        />
        {profileFieldErrors?.displayName !== undefined ? (
          <p role="alert">{profileFieldErrors.displayName[0]}</p>
        ) : null}

        <label htmlFor={bioId}>自己紹介</label>
        <textarea
          id={bioId}
          name="bio"
          rows={4}
          maxLength={BIO_MAX}
          defaultValue={user.bio ?? ""}
          disabled={profilePending}
        />
        {profileFieldErrors?.bio !== undefined ? (
          <p role="alert">{profileFieldErrors.bio[0]}</p>
        ) : null}

        <button type="submit" disabled={profilePending}>
          {profilePending ? "保存中..." : "保存"}
        </button>
        {profileSummary !== "" ? <p role="alert">{profileSummary}</p> : null}
        {profileState.ok ? <p aria-live="polite">保存しました</p> : null}
      </form>

      <hr />

      <h2>ユーザー名（URL）</h2>
      <p>
        現在: <strong>@{user.username}</strong>
      </p>
      <form action={usernameAction}>
        <label htmlFor={usernameId}>新しいユーザー名</label>
        <input
          id={usernameId}
          name="newUsername"
          type="text"
          maxLength={USERNAME_MAX}
          disabled={usernamePending}
          required
        />
        {usernameFieldErrors !== undefined ? (
          <p role="alert">{usernameFieldErrors[0]}</p>
        ) : null}
        <button type="submit" disabled={usernamePending}>
          {usernamePending ? "変更中..." : "ユーザー名を変更"}
        </button>
        {usernameSummary !== "" ? <p role="alert">{usernameSummary}</p> : null}
        {usernameState.ok ? <p aria-live="polite">変更しました</p> : null}
      </form>
    </section>
  );
}
