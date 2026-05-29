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
 * **同時にこの JSDoc にも対象 leaf を追記すること**。
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
}: UseAuthGuardEffectInput): void {
  const router = useRouter();
  const shellUserId = shellUserDto?.id ?? null;
  useEffect(() => {
    if (shellUserId !== null && leafAuthenticated === false) {
      void appShellInvalidate(router);
    }
  }, [shellUserId, leafAuthenticated, router]);
}
