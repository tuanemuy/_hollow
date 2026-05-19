"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  FIELD_INPUT,
  FIELD_LABEL,
  FORM_ERROR,
  PILL_BTN,
} from "../layout/styles";
import { createTagFn } from "./actions";
import { TAG_NAME_MAX_LENGTH } from "./schema";

type FormState = { error: SerializedError | null };
const initial: FormState = { error: null };

export function CreateTagForm() {
  const router = useRouter();
  const createTag = useServerFn(createTagFn);
  const nameId = useId();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const name = String(formData.get("name") ?? "").trim();
      if (name.length === 0) return { error: null };
      try {
        await createTag({ data: { name } });
        await router.invalidate();
        return { error: null };
      } catch (e) {
        return { error: extractSerializedError(e) };
      }
    },
    initial,
  );

  return (
    <form action={formAction} className="flex gap-2 items-end mt-4 flex-wrap">
      <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
        <label htmlFor={nameId} className={FIELD_LABEL}>
          新しいタグ
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          maxLength={TAG_NAME_MAX_LENGTH}
          placeholder="タグ名"
          disabled={isPending}
          required
          className={FIELD_INPUT}
        />
      </div>
      <button
        type="submit"
        className={PILL_BTN}
        data-primary=""
        disabled={isPending}
      >
        {isPending ? "作成中..." : "追加"}
      </button>
      {state.error !== null ? (
        <p className={`${FORM_ERROR} w-full`} role="alert">
          {displayError(state.error)}
        </p>
      ) : null}
    </form>
  );
}
