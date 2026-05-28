import type { AnyRouter } from "@tanstack/react-router";

export const APP_SHELL_ROUTE_ID = "/_app";

type InvalidateOpts = NonNullable<Parameters<AnyRouter["invalidate"]>[0]>;
type InvalidateFilter = NonNullable<InvalidateOpts["filter"]>;

/**
 * `router.invalidate()` のラッパー。デフォルトで `_app` layout route を
 * 除外し、AppShell loader の `staleTime: Infinity` を mutation 後にも
 * 維持する。
 *
 * 以下のいずれかに該当する mutation でのみ生の `router.invalidate()`
 * を直接呼ぶこと（AppShell を再評価させたいケース）:
 *   rule 1. 認証状態が変わる（未認証 ⇄ 認証）
 *   rule 2. Sidebar の directory tree を改変する
 *   rule 3. Header の `displayName` を改変する
 *
 * `sync` / `forcePending` を必要とする場合はラッパーを拡張するか
 * 生の `router.invalidate()` を使う。経緯は `.issue/293/adr.md`
 * ADR-010 と `.issue/299/adr.md` を参照。
 */
export function routerInvalidate(
  router: AnyRouter,
  filter?: InvalidateFilter,
): Promise<void> {
  return router.invalidate({
    filter: filter ?? ((match) => match.routeId !== APP_SHELL_ROUTE_ID),
  });
}
