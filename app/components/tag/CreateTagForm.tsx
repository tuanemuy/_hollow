"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
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
    <form
      action={formAction}
      style={{
        display: "flex",
        gap: "var(--space-2)",
        alignItems: "end",
        marginTop: "var(--space-4)",
        flexWrap: "wrap",
      }}
    >
      <div
        className="field"
        style={{ flex: 1, marginBottom: 0, minWidth: 200 }}
      >
        <label htmlFor={nameId}>新しいタグ</label>
        <input
          id={nameId}
          name="name"
          type="text"
          maxLength={TAG_NAME_MAX_LENGTH}
          placeholder="タグ名"
          disabled={isPending}
          required
        />
      </div>
      <button type="submit" className="pill-btn primary" disabled={isPending}>
        {isPending ? "作成中..." : "追加"}
      </button>
      {state.error !== null ? (
        <p className="form-error" role="alert" style={{ width: "100%" }}>
          {displayError(state.error)}
        </p>
      ) : null}
    </form>
  );
}
