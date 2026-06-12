"use client";

import { useFormStatus } from "react-dom";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";

/**
 * Submit button that derives its pending state from the nearest parent
 * `<form action={…}>` via `useFormStatus()` — the React 19 primitive for
 * reading a form's submission status from a child component, without the
 * parent threading a `pending` boolean down by hand.
 *
 * Use **only** inside a `<form action>` (server-action) form. Inside such a
 * form the button shows `pendingLabel`, becomes `disabled`, and reports
 * `aria-busy` while the action is in flight. Outside an action form
 * `useFormStatus().pending` is always `false`, so this renders as a plain
 * enabled submit button — do not use it to reflect `useActionState` pending
 * that lives in the same component (just disable a normal button there).
 *
 * `disabled` is OR-combined with the form pending state for buttons whose
 * enabled-ness also depends on non-form state (e.g. a lockout flag).
 *
 * Styling defaults to the primary pill (`primary` defaults to `true`, which
 * emits `data-primary` so `pillBtn`'s `data-[primary]:` accent variant fires).
 * Pass a non-primary `className` (e.g. a surface / ghost pill) **with**
 * `primary={false}` so the `data-primary` flag does not linger and force the
 * accent colours onto an overridden style.
 */
export function SubmitButton({
  label,
  pendingLabel,
  disabled = false,
  primary = true,
  className = `${pillBtn} ${pillBtnPrimary}`,
}: Readonly<{
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
      data-primary={primary ? "" : undefined}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
