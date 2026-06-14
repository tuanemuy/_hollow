import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { appShellInvalidate } from "./routerInvalidate";

type UseAuthGuardEffectInput = {
  leafAuthenticated: boolean;
  shellUserDto: UserDTO | null;
};

/**
 * leaf 側 server fn で `user === null` を観測したタイミングを client
 * 側で捕捉し、defensive redirect とは独立に `_app` の cached AppShell
 * を破棄して再評価させるための hook。
 *
 * **配置規約: authenticated / unauthenticated 両 branch を持つ leaf
 * に必ず配置すること**。現状の対象 leaf は `_app/index.tsx` の
 * `HomeRoute` のみ。`_app` 配下に「leaf で direct unauthenticated state
 * を表示する別 route」を追加する場合、その leaf にも本 hook を配置し、
 * **同時にこの JSDoc にも対象 leaf を追記すること**。配置した leaf は
 * **戻り値（不整合中フラグ）で未認証 UI をガードすること**（下記参照）。
 *
 * `_app.loader` の `staleTime: Infinity` により、SPA 遷移では親 loader
 * は再評価されず cached `userDto` が残り続ける。leaf 側 server fn が
 * 既存セッションの失効を検出して redirect しても、redirect 先（同一
 * `_app` 配下）の AppShell は前ユーザーのままになる問題への対処。
 *
 * 発火条件は次の **不整合** を観測した時のみ:
 *   - `shellUserDto !== null` （shell キャッシュに前ユーザーが残っている）
 *   - **かつ** `leafAuthenticated === false` （leaf 観測は未認証）
 *
 * fresh 未認証訪問者（cached も null、observed も false）では発火しない。
 * これにより Issue #293 の「初回 1 RPC、以降 0 RPC」を regression なしに
 * 維持しつつ、セッション失効シナリオでだけ AppShell を再評価する。
 *
 * `useEffect` 内では await できないため `appShellInvalidate(router)` は
 * fire-and-forget で呼ぶ。背景は `.issue/300/adr.md` ADR-001。
 *
 * 戻り値（`boolean`）は **不整合中フラグ**: `true` = 不整合観測中
 * （invalidate を fire 済み・AppShell 再評価待ち）。呼び出し側は
 * `true` の間、未認証 UI ではなく中立 UI を描画して 1 フレームの
 * ちらつきを防ぐべき（Issue #732）。`useEffect` は中立 UI が描かれて
 * いる間に invalidate を解決し、AppShell 再評価（`userDto: null`）で
 * 正規 UI（未認証なら LandingPage）に収束する。不整合判定の SSOT は
 * 本 hook 内（`isAuthMismatch`）に置き、発火条件と戻り値を同一定数から
 * 導出して呼び出し側にロジックを二重化させない（背景は
 * `.issue/732/adr.md` ADR-002）。
 *
 * 実装注:
 *   - user identity の判定は `shellUserDto.id` のみで行う（属性差異では
 *     再発火しない）。`displayName` 等の更新は rule 3 mutation 側で
 *     生 `router.invalidate()` を使い AppShell を再評価する
 *   - `router` 自体は TanStack Router の singleton で referentially
 *     stable なので、依存配列に入れても余計な再発火は発生しない
 */
export function useAuthGuardEffect({
  leafAuthenticated,
  shellUserDto,
}: UseAuthGuardEffectInput): boolean {
  const router = useRouter();
  const shellUserId = shellUserDto?.id ?? null;
  const isAuthMismatch = shellUserId !== null && leafAuthenticated === false;
  useEffect(() => {
    // Recompute from the dep-array inputs rather than closing over
    // `isAuthMismatch` so the dep array stays keyed on the raw values: a
    // mismatch→mismatch user switch (u1→u2) must still re-fire invalidate,
    // which keying on the derived boolean (stuck `true`) would skip (#732
    // preserves #300's per-id re-fire contract).
    if (shellUserId !== null && leafAuthenticated === false) {
      void appShellInvalidate(router);
    }
  }, [shellUserId, leafAuthenticated, router]);
  return isAuthMismatch;
}
