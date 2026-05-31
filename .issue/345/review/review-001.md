# PR Review #001 — refactor(routes): 認証必須ルートのガードを共通化し /exports・/views にも適用する

**PR:** #375
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（いずれも本ラウンドで解消／検証済み）
- Notes: 多数（良好）
- Verdict: **APPROVED**（Blocker 0、Warning 2 はいずれも解消）

3視点（Security / 認証・認可、アーキテクチャ整合性 / presentation 層責務、Frontend / ルーティング正しさ）で並列レビュー。

---

## Security / 認証・認可

#### Blockers
- なし

#### Notes（要点）
- 認証判定の向き・境界が各ルートで正しく適用（認証必須系=`requireAuthenticatedRoute`、ゲスト専用系=`redirectAuthenticatedRoute`、取り違えなし）。
- deleted/suspended ユーザー境界が維持（`authMiddleware.getCurrentUser` 経由で null 化 → `/login`）。
- `beforeLoad` が一次ガードとして機能し、レイアウト子ルート・単一ページとも loader 到達前に未認証を弾く。バイパス経路なし。
- 多層防御（子 RSC の `requireCurrentUser`）温存。server-only 境界の漏洩なし。
- スコープ除外（`/admin`・`_app`・`/media`）の判断が妥当。認証必須なのにガード漏れのルートは残っていない。

## アーキテクチャ整合性 / presentation 層責務

#### Blockers
- なし

#### Warnings
- **[W-001]** `authMiddleware.redirectIfAuthenticated`（および同様に未使用の `requireCurrentUser`）が dead code として確定。新 `authGuard.redirectAuthenticatedRoute` の「紛らわしい dead な双子」になっている。
  - 場所: `app/core/presentation/authMiddleware.ts:69-80`（修正前）
  - **→ 解消:** grep で両関数が全コードベースから未参照（static/dynamic とも import なし、実使用の `requireCurrentUser` はすべて `@/lib/server/currentUser` 由来）であることを確認のうえ、両 throw 型ヘルパーと未使用化した `redirect`・`HOME_SEARCH` import を削除。同一機能（認証ガード）内で完結する軽微な掃除のため本PRで対応。typecheck・biome 通過。

#### Notes（要点）
- ADR-001 のレイヤー判断（authGuard 分離・動的 import 作法）妥当。
- RSC manifest 登録は `pnpm build` 成功・SSR 307 で機能確認済み。
- 裸の関数参照 `beforeLoad: requireAuthenticatedRoute` は typecheck 通過（フォールバック不要）。
- 重複排除粒度（redirect 込みヘルパー）適切。import 整理・命名・JSDoc が規約と一貫。

## Frontend / ルーティング正しさ

#### Blockers
- なし

#### Warnings
- **[W-001]** 共有 `createServerFn`（`checkAuthenticated`）が暗黙登録（import 元ルートが server グラフに引き込む）に依存し、既存の `__root.tsx` 明示登録作法から外れて見える。client 遷移系（manual-test で SKIP）が未検証。
  - 場所: `app/core/presentation/authGuard.ts`、`app/routes/__root.tsx:16-26`
  - **→ 解消（検証により棄却）:** `__root.tsx` の side-effect import はコメント明記の通り「`"use client"` コンポーネントからしか到達しない server-fn（フォームの action 系）」専用。`beforeLoad` ガードは server-rendered なルートモジュール経由で到達するため別カテゴリで、移設前のインライン版ガード（settings/login/signup）も `__root.tsx` 登録なしで本番稼働しており、暗黙登録は実証済みの仕組み。さらに**クライアント遷移を実機検証**: 未認証で `/login` を開き「アカウント作成」リンク（@e2）をクリック → SPA 遷移で `/signup` に到達し、`/signup` の `redirectAuthenticatedRoute` beforeLoad がクライアント側で共有 `checkAuthenticated` を RPC 呼び出して正常にフォーム描画（「server function not registered」エラーなし）。client グラフでの登録・呼び出しが動作することを確認したため、`__root.tsx` への追加は不要と判断。

#### Notes（要点）
- レイアウト（beforeLoad + Outlet + errorComponent）共存、単一ページの beforeLoad→loader 順、検索パラメータ正規化リダイレクトとの相互作用、いずれも正しい。
- 削除 import の整理は正確（settings の `HOME_SEARCH` は Home リンクで実使用が残り正しく保持）。未使用 import なし。
- login/signup 逆向きガードの回帰なし。

---

## Design Decisions

本ラウンドの修正に伴う設計判断を adr.md ADR-003 に追記（dead code 削除の方針）。

---

## 修正サマリー

| 指摘 | 対応 |
|------|------|
| Arch W-001（dead な `redirectIfAuthenticated`/`requireCurrentUser`） | authMiddleware から両関数 + 未使用 import（`redirect`, `HOME_SEARCH`）を削除 |
| Frontend W-001（共有 server-fn の client 登録未検証） | client 遷移（/login → /signup）を実機検証し動作確認。コード変更不要と判断 |

Blocker 0、Warning 2 はいずれも解消（1件は修正、1件は検証により棄却）。Round 2 で最終確認する。
