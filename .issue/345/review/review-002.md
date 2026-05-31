# PR Review #002 — refactor(routes): 認証必須ルートのガードを共通化し /exports・/views にも適用する

**PR:** #375
**Date:** 2026-05-31
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良好）
- Verdict: **APPROVED**

review-001 の修正（authMiddleware の dead code 削除）反映後の状態を、2視点（Security + 掃除整合 / アーキテクチャ + 最終確認）で並列再レビュー。両視点とも Blocker・Warning ゼロ。

---

## Security / 認証・認可 + 掃除整合（Round 2）

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要点）
- 削除した `redirectIfAuthenticated` / authMiddleware版 `requireCurrentUser` への参照ゼロを確認（残るヒットは JSDoc 文言のみ）。実使用の `requireCurrentUser` は全 50+ 箇所すべて `@/lib/server/currentUser` 由来で退行参照なし。
- 残った authMiddleware export（setSessionCookie/clearSessionCookie/getCurrentUser/SESSION_COOKIE_NAME）の使われ方が正しい。deleted/suspended 境界は `getCurrentUser` → authGuard の1経路に集約。
- 認証ガードの向き・境界・バイパスに回帰なし。多層防御温存。server-only 境界の漏洩なし。typecheck クリーン。

## アーキテクチャ整合性 / 最終確認（Round 2）

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要点）
- dead code 削除の完全性 OK（2関数 + `redirect`・`HOME_SEARCH` import 除去、削除し残し・残骸なし）。authMiddleware は3 export に責務集約、ADR-003 と一致。
- 未使用 import 残存なし。型エラーなし（裸の関数参照のフォールバック不要を確証）。biome は変更9ファイルで No fixes。
- authGuard.ts の責務・配置・JSDoc が規約準拠（module-private な checkAuthenticated、動的 import で server-only 境界保持、WHY に絞った JSDoc）。
- plan / adr と実装が整合。redirect 向き割当が正確。settings の HOME_SEARCH 保持・login/signup の削除判断が各ファイルで正確。

---

## Design Decisions

特になし（ADR-001〜003 で記録済み）。

---

## 最終判定

**APPROVED。** Round 1 の Warning 2件（Arch W-001=修正、Frontend W-001=client 遷移実機検証により棄却）はいずれも解消済み。Round 2 で両視点とも Blocker 0・Warning 0 を確認したため、レビューループを完了する（1ラウンドクリーン）。PR を Ready for review に切り替える。
