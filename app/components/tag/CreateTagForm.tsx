"use client";

import { useId, useRef, useState } from "react";
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
};

export function CreateTagForm({ onCreate, error }: Props) {
  const nameId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against double-submit (rapid Enter / click) while an optimistic add
  // is mid-flight — replaces the `useActionState` `isPending` guard (S-002).
  const [submitting, setSubmitting] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const name = inputRef.current?.value.trim() ?? "";
    // Empty input is a no-op (preserves the old `useActionState` early return).
    if (name.length === 0) return;
    setSubmitting(true);
    // Clear immediately so the optimistic row owns the feedback and the input
    // is ready for the next name; React 19 batches this with the parent's
    // transition start.
    if (inputRef.current) inputRef.current.value = "";
    onCreate(name);
    setSubmitting(false);
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
      />
      <button
        type="submit"
        className={`${pillBtn} ${pillBtnPrimary}`}
        data-primary=""
      >
        追加
      </button>
      {error !== null ? (
        <p className={`${FORM_ERROR} w-full`} role="alert">
          {displayError(error)}
        </p>
      ) : null}
    </form>
  );
}
