# PR Review #001 — 設定画面ナビゲーション: /settings 直アクセスのリダイレクトとサブページの staleTime キャッシュ化 (#487)

**PR:** #492
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 9
- Verdict: **APPROVED**

レビュー観点: Frontend（TanStack Router / ルート設定 / RSC）、Correctness（キャッシュ整合性）の2視点を並列実施。両視点とも Blocker・Warning ゼロ。

---

## Frontend

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `beforeLoad` 無条件 `throw redirect` のイディオムは正しい。`component` 不要、ルートID `/_app/settings/` は `_app/tags/index.tsx` と同じ index 規則。`redirect({ to: "/settings/profile" })` の型安全性は typecheck 成功で担保。
- **[N-002]** `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` は4ファイルとも `app/routes/_app/route.tsx:82` と文字列レベルで完全一致。TC-003 で鮮度担保を実証。
- **[N-003]** `routeTree.gen.ts` の差分は生成結果として妥当（import 追加・index ルート登録・`FileRoutesBy*` への追加が一貫）。手作業破壊なし。
- **[N-004]** 既存挙動への退行リスク低。`UserMenu` の `/settings` 遷移は「空白 main」→「/settings/profile リダイレクト」へ改善。サブナビのアクティブ表示も profile が正しく `data-active`。
- **[N-005]** CLAUDE.md 規約準拠。index.tsx の唯一のコメントは WHY を説明する適切なもの。typecheck/format クリーン、lint 警告は本PR非対象ファイルのみ。

## Correctness

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 鮮度ロジックは全 mutation 経路で成立を実コード確認。プリフィル値は各 leaf loader の RSC（`requireCurrentUser()` を毎回フレッシュに読む）由来で、`routerInvalidate` が leaf を invalidate するため `staleTime: Infinity` でも編集直後に再実行される。Profile（displayName/bio→全 invalidate, username→routerInvalidate）、Security（password/email/revokeAll の3経路）、Prompts（save/clear）すべて invalidate 呼び出しあり。漏れなし。
- **[N-002]** `EmailChangeConfirm` は全 invalidate（`_app` 含む）後に `/` or `/login` へ誘導。security の cached `user.email` が残る経路なし。
- **[N-003]** account-delete は `clearCache` + `/` navigate。アカウント消滅のため鮮度概念が存在しない。
- **[N-004]** index redirect と認証ガードの評価順: 未認証 `/settings` は「index `beforeLoad` redirect → /settings/profile → `_app` loader が / へ」の二段リダイレクト。net 到達点は `/` で TC-004 で実機確認済み。`/settings/profile` 自身は redirect を持たずループなし。leaf がガードをすり抜けても `requireCurrentUser()` が `/login` へ二重防御。stale プリフィル露出経路なし。

---

## Design Decisions

このラウンドで新たな設計判断なし（ADR-001 / ADR-002 が計画段階で確定済み、レビューで妥当性を実コード確認）。
