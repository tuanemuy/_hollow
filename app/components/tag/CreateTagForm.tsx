"use client";

import { useId, useRef } from "react";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { FORM_ERROR } from "../layout/styles";
import { TAG_NAME_MAX_LENGTH } from "./schema";
import { TAG_CREATE_FORM, TAG_CREATE_INPUT } from "./styles";

type Props = {
  // Optimistic creation is owned by the parent `TagList` (same `useOptimistic`
  // projection as rename / delete). This form only collects the name and hands
  // it off; it keeps no optimistic row state of its own (ADR-002).
  onCreate: (name: string) => void;
  // Surfaced directly under the form because the created row is not yet
  // committed — the optimistic add lives in the list, but its error belongs
  // next to the input that produced it.
  error: SerializedError | null;
  // Pending flag from the parent's create transition. Optional (defaults to
  // false) so existing callers/tests are unaffected.
  isPending?: boolean;
};

export function CreateTagForm({ onCreate, error, isPending = false }: Props) {
  const nameId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = inputRef.current?.value.trim() ?? "";
    // Empty input is a no-op (preserves the old `useActionState` early return).
    if (name.length === 0) return;
    // Clear the input *before* handing off to `onCreate`. This both readies the
    // field for the next name and is what actually guards against double-submit:
    // a rapid second Enter/click sees an empty input and is dropped by the
    // `name.length === 0` early return above (S-002).
    if (inputRef.current) inputRef.current.value = "";
    onCreate(name);
  };

  return (
    <form onSubmit={submit} className={TAG_CREATE_FORM}>
      <label htmlFor={nameId} className="sr-only">
        新しいタグ
      </label>
      <input
        ref={inputRef}
        id={nameId}
        name="name"
        type="text"
        maxLength={TAG_NAME_MAX_LENGTH}
        placeholder="新しいタグを追加"
        className={TAG_CREATE_INPUT}
        disabled={isPending}
      />
      <button
        type="submit"
        className={`${pillBtn} ${pillBtnPrimary}`}
        data-primary=""
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? "追加中..." : "追加"}
      </button>
      {error !== null ? (
        <p className={`${FORM_ERROR} w-full`} role="alert">
          {displayError(error)}
        </p>
      ) : null}
    </form>
  );
}
