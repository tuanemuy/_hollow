# PR Review #001 — test(identity): add integration tests for RevokeAllOtherSessions, RequestEmailChange, VerifyEmailChange

**PR:** #40
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 3
- Notes: 3
- Verdict: **BLOCKED**

---

### General Review

#### Blockers

- **[B-001]** `RequestEmailChange` の正常系テストが spec の期待結果「payload に newEmail」を検証していない
  - 場所: `app/core/application/identity/__tests__/identity.integration.test.ts:892-896`
  - 理由: spec には「email_change challenge 発行 (payload に newEmail)」と明記されているが、テストは `verificationRows.length === 1` のみ確認。payload が欠如していると silent failure になる。
  - 提案: `verificationRows[0]` の `value` を `JSON.parse` し、`decoded.payload.newEmail === "new_eml001@example.com"` を assert する。

- **[B-002]** spec の `RequestEmailChange` テーブル「既存 email_change token 保有 → 旧 token 無効化、新 token 発行」ケースが未実装
  - 場所: `describe("RequestEmailChange")` ブロック内に対応する `it` がない
  - 理由: spec/testcases/identity/index.md の `RequestEmailChange` テーブル 2 行目の重要な冪等性保証が未テスト。計画書にも記載漏れがあった。
  - 提案: `it("invalidates the prior token when re-issued")` を追加し、2 回の `requestEmailChange` で firstToken が consume 不能、secondToken で成功することを確認する。

#### Warnings

- **[W-001]** `RevokeAllOtherSessions` に 0 セッション境界ケース未テスト（spec 外）
- **[W-002]** `activeMember` ヘルパーと外側 `const container = getContainer()` の暗黙的同一性（既存パターン踏襲）
- **[W-003]** expired token テストで `identifier` で絞り込んでいる点（動作上問題なし）

#### Notes

- **[N-001]** `RevokeAllOtherSessions` の多層アサーションが意図明確で良い
- **[N-002]** `VerifyEmailChange / email_taken` の競合状態シミュレーションアプローチが正確
- **[N-003]** seed 文字列の重複なし

---

## Design Decisions

特になし
