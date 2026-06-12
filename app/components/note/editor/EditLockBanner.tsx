import type { EditLockState } from "./editorState";

/**
 * Pure banner shown when another user holds the editor lock, or when
 * lock acquisition failed with a non-fatal error. `acquired` /
 * `released` / `unknown` render nothing — the editor stays usable
 * without a banner in those states.
 */
export type EditLockBannerProps = Readonly<{
  lock: EditLockState;
}>;

export function EditLockBanner({ lock }: EditLockBannerProps) {
  if (lock.state !== "denied") return null;
  return (
    <div
      className="mb-4 flex flex-col gap-1 rounded-md bg-warning-surface px-4 py-3 text-sm text-ink"
      role="status"
      aria-live="polite"
    >
      <strong className="font-semibold">他のユーザーが編集中です。</strong>
      <span>
        編集は続行できますが、保存時に競合が発生する可能性があります。
      </span>
    </div>
  );
}
