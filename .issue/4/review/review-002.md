# PR Review #002 — test(identity): add integration tests for RevokeAllOtherSessions, RequestEmailChange, VerifyEmailChange

**PR:** #40
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 4
- Verdict: **APPROVED**

---

### General Review

#### Blockers

なし

#### Warnings

- **[W-001]** `expect.fail("should have thrown")` が `catch` ブロックに到達する構造（既存パターンと同一、本PR新規導入ではない）
  - 場所: `app/core/application/identity/__tests__/identity.integration.test.ts:939-947`
  - 理由: 動作はするが診断性が低い。ただし既存コード全体で統一使用されており本PR固有の問題ではない
  - 提案: 将来的に `await expect(promise).rejects.toSatisfy(isBusinessRuleError)` 形式にリファクタ（本PRスコープ外）

- **[W-002]** `VerifyEmailChange / email_taken` テストで `signUp` が `instanceSettings` のデフォルトフォールバックに暗黙依存（動作は正しい）
  - 場所: `app/core/application/identity/__tests__/identity.integration.test.ts:1081-1090`
  - 理由: `truncateIdentityTables` が `instanceSettings` を削除するが、アダプターが `default()` にフォールバックするため安全に動作する
  - 提案: 現状変更不要

#### Notes

- **[N-001]** B-001 修正（`storedValue.payload.newEmail` の直接 assert）が正確
- **[N-002]** B-002 修正（firstToken が `token_not_found`、secondToken でメアド変更）が spec の「旧 token 無効化、新 token 発行」を正確に反映
- **[N-003]** `readVerificationToken` ヘルパーが `email_change` の payload を保持しつつトークンを rewrite するため、新規テストとのメカニズム整合性あり
- **[N-004]** 3 describe ブロックの挿入位置がすべて plan.md の指示通り

---

## Design Decisions

特になし
