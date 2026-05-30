# PR Review #002 — feat(#315): admin の自己 demote/suspend を禁止（自己操作ガード）

**PR:** #338
**Date:** 2026-05-30
**Round:** 2回目（ユーザーレビュー指摘の反映）

---

## Summary

- Blockers: 0
- Warnings: 1 → 修正済み
- Notes: -
- Verdict: **APPROVED**

review-001 で APPROVED 後、ユーザーから「冗長になっていないか」の指摘。精査の結果、実コードに 1 件の冗長を確認し修正した。

---

## 指摘と対応

#### [W-001] `demoteAdmin` の `assertNotLastAdmin` が `assertNotSelf` 導入後に冗長（修正済み）
- 場所: `app/core/application/identity/demoteAdmin.ts`
- 理由: demote で `last_admin_protected`（`adminCount <= 1`）に到達するには target が admin かつ admin が 1 人＝その唯一の admin が actor（actor===target）であることが必須（member への demote は `demoteToMember` が `AlreadyMember` で弾く）。`assertNotSelf` が actor===target を全て塞ぐため、最後の admin は demote では二度と落とせず、`assertNotLastAdmin` は発火経路を失い完全に冗長。加えて suspend(早期)／demote(後置) のガード配置が非対称だった。
- 対応:
  - `demoteAdmin` から `assertNotLastAdmin` + `countAdmins()` を除去し、`assertNotSelf` を authz チェック直後（`findById(target)` 前）に移動。suspend と対称化。
  - 既存テスト `rejects demoting the last admin` を `self_operation_not_allowed` 期待に更新、テスト名を `rejects an admin demoting their own account (sole admin)` に変更。
  - last-admin 保護のドメインヘルパーは `deleteAccount`（自己アカウント削除）で引き続き到達・必要なため残置。
  - ADR-003 を最終決定に改訂、plan.md ステップ 3・6・リスク節を更新。

## 検証

- `pnpm typecheck` / `pnpm lint:fix` クリーン（`countAdmins` 未使用エラーなし）。
- `pnpm test`（unit 2783 + integration 469）全 green。自己 demote（単独 admin / 別 admin 在席）・自己 suspend の各ケース緑。

## Design Decisions

- ADR-003 を「demote の冗長な last-admin チェックを除去し対称化」に最終確定（review 経緯も記録）。
