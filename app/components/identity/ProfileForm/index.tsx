"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { formatJstDateTime } from "@/components/common/dateFormat";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  finalizeMediaUploadFn,
  presignMediaUploadFn,
} from "@/components/media/actions";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { BIO_MAX, DISPLAY_NAME_MAX, USERNAME_MAX } from "../schema";
import {
  ACTION_ROW,
  ACTION_ROW_SPACER,
  AVATAR_ACTIONS,
  AVATAR_IMG,
  AVATAR_LARGE,
  AVATAR_ROW,
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SM,
  BTN_SM_DANGER,
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
import { nextUsernameChangeAt } from "./usernameCooldown";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

// Client-side avatar guards. Mirror the help text "PNG または JPEG、5MB まで"
// so the displayed constraints match the enforced ones (#543 ADR-004,
// #571 ADR-004). The 512px / square recommendation is *not* enforced.
const AVATAR_ACCEPT = "image/png,image/jpeg";
const AVATAR_ALLOWED_MIME = ["image/png", "image/jpeg"];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// Tri-state pending avatar selection (vs the persisted `user.avatarMediaId`):
// - undefined: unchanged (omit from update payload)
// - string:    a freshly finalized mediaId to set
// - null:      explicit removal
type AvatarPending =
  | { kind: "unchanged" }
  | { kind: "set"; mediaId: string }
  | { kind: "remove" };

type AvatarUpload =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string };

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

function formatTimestamp(iso: string): string {
  return formatJstDateTime(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(d: Date): string {
  return formatJstDateTime(d.toISOString(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
  const presignMediaUpload = useServerFn(presignMediaUploadFn);
  const finalizeMediaUpload = useServerFn(finalizeMediaUploadFn);

  const displayNameId = useId();
  const bioId = useId();
  const bioCounterId = useId();
  const usernameId = useId();
  const usernameHintId = useId();

  const [bioCount, setBioCount] = useState(user.bio?.length ?? 0);
  const [newUsername, setNewUsername] = useState("");
  const [avatar, setAvatar] = useState<AvatarPending>({ kind: "unchanged" });
  const [avatarUpload, setAvatarUpload] = useState<AvatarUpload>({
    kind: "idle",
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  // The "次に変更できる日付" hint derives from the current time (`new Date()`
  // in the cooldown calc below), which differs between the SSR and client
  // render, so it must appear only after mount — server and first client
  // render agree (both omit), then the value appears. ("最終保存" shares the
  // gate.) Date formatting itself is SSR-safe now that it goes through the
  // JST-pinned `formatJstDateTime` (#821). See `.issue/571/adr.md` ADR-007.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Resolve which avatar (if any) to render. Pending selection wins over the
  // persisted value so the preview reflects unsaved changes.
  const previewAvatarId =
    avatar.kind === "set"
      ? avatar.mediaId
      : avatar.kind === "remove"
        ? null
        : user.avatarMediaId;

  // "次に変更できる日付" hint — only shown while the cooldown is still active.
  // Gated on `mounted` because it depends on the current time / local tz.
  const nextChange = mounted
    ? nextUsernameChangeAt(user.lastUsernameChangedAt, new Date())
    : null;

  // Normalize a trailing slash before joining `/u/<username>` (same as
  // `NoteDetail.tsx`). When `appUrl` is empty (env unset) we fall back to a
  // relative `/u/...` rather than fabricating a dummy host.
  const urlBase = appUrl.replace(/\/$/, "");
  const previewUsername = newUsername.trim() || user.username;
  const urlPrefix = urlBase === "" ? "/u/" : `${urlBase}/u/`;
  const urlPreview = `${urlPrefix}${previewUsername}`;

  const runAvatarUpload = async (file: File) => {
    if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
      setAvatarUpload({
        kind: "error",
        message: "PNG または JPEG を選択してください。",
      });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarUpload({
        kind: "error",
        message: "ファイルサイズは5MBまでです。",
      });
      return;
    }
    setAvatarUpload({ kind: "uploading" });
    try {
      const presigned = await presignMediaUpload({
        data: { kind: "avatar", mimeType: file.type, byteSize: file.size },
      });
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed with status ${putRes.status}`);
      }
      const finalized = await finalizeMediaUpload({
        data: { mediaId: presigned.mediaId },
      });
      setAvatar({ kind: "set", mediaId: finalized.mediaId });
      setAvatarUpload({ kind: "idle" });
    } catch (e) {
      setAvatarUpload({
        kind: "error",
        message: displayError(extractSerializedError(e)),
      });
    }
  };

  const onAvatarPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    void runAvatarUpload(file);
  };

  const onAvatarRemove = () => {
    setAvatar({ kind: "remove" });
    setAvatarUpload({ kind: "idle" });
  };

  const onReset = () => {
    // The text fields are uncontrolled (defaultValue); restore their initial
    // values imperatively, then sync the bio counter and avatar pending state.
    if (displayNameRef.current !== null) {
      displayNameRef.current.value = user.displayName;
    }
    if (bioRef.current !== null) {
      bioRef.current.value = user.bio ?? "";
    }
    setBioCount(user.bio?.length ?? 0);
    setAvatar({ kind: "unchanged" });
    setAvatarUpload({ kind: "idle" });
  };

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
          // Tri-state: omit when unchanged, send id to set, `null` to remove.
          ...(avatar.kind === "set"
            ? { avatarMediaId: avatar.mediaId }
            : avatar.kind === "remove"
              ? { avatarMediaId: null }
              : {}),
        },
      });
      setAvatar({ kind: "unchanged" });
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
          <span className={FIELD_LABEL}>アバター</span>
          <div className={AVATAR_ROW}>
            <span className={AVATAR_LARGE} aria-hidden="true">
              {previewAvatarId !== null ? (
                <img
                  src={`/media/${previewAvatarId}`}
                  alt=""
                  className={AVATAR_IMG}
                />
              ) : (
                initials(user.displayName)
              )}
            </span>
            <div className={AVATAR_ACTIONS}>
              <input
                ref={avatarInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                aria-label="アバター画像を選択"
                onChange={onAvatarPick}
                disabled={profilePending || avatarUpload.kind === "uploading"}
                className="sr-only"
              />
              <button
                type="button"
                className={BTN_SM}
                data-sm=""
                disabled={profilePending || avatarUpload.kind === "uploading"}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUpload.kind === "uploading"
                  ? "アップロード中…"
                  : "アップロード"}
              </button>
              {previewAvatarId !== null ? (
                <button
                  type="button"
                  className={BTN_SM_DANGER}
                  data-ghost-danger=""
                  data-sm=""
                  disabled={profilePending || avatarUpload.kind === "uploading"}
                  onClick={onAvatarRemove}
                >
                  削除
                </button>
              ) : null}
            </div>
          </div>
          <p className={FIELD_HINT}>
            推奨: 正方形 512×512px 以上、PNG または JPEG、5MB まで。
          </p>
          {avatarUpload.kind === "uploading" ? (
            <p aria-live="polite" className={FIELD_HINT}>
              アバターをアップロード中…
            </p>
          ) : null}
          {avatarUpload.kind === "error" ? (
            <p role="alert" className={FIELD_ERROR}>
              {avatarUpload.message}
            </p>
          ) : null}
        </div>

        <div className={FIELD}>
          <label htmlFor={displayNameId} className={FIELD_LABEL}>
            表示名
          </label>
          <input
            ref={displayNameRef}
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
            ref={bioRef}
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
          <SubmitButton
            label="保存"
            pendingLabel="保存中..."
            disabled={avatarUpload.kind === "uploading"}
            className={BTN_PRIMARY}
          />
          <button
            type="button"
            disabled={profilePending}
            className={BTN_SECONDARY}
            onClick={onReset}
          >
            リセット
          </button>
          <div className={ACTION_ROW_SPACER} />
          {mounted ? (
            <span className={FIELD_HINT}>
              最終保存: {formatTimestamp(user.lastSavedAt)}
            </span>
          ) : null}
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
            {nextChange !== null
              ? `次に変更できるのは${formatDay(nextChange)}以降です。`
              : ""}
          </p>
          {usernameFieldErrors !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {usernameFieldErrors[0]}
            </p>
          ) : null}
        </div>
        <div className={ACTION_ROW}>
          <SubmitButton
            label="ユーザー名を変更"
            pendingLabel="変更中..."
            className={BTN_PRIMARY}
          />
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
