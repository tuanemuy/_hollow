# PR Review #001 — refactor(adminSettings): align assertEnvOverride apiKey trim with ADR-002 (length>0)

**PR:** #431
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 4
- Verdict: **BLOCKED**（W-001 をこの PR で修正するため）

---

### General Review

#### Blockers
- なし

#### Warnings
- **[W-001]** 反転テストが旧仕様を弾く設計にはなっているが、本 PR の本質である「`apiKeySource: "env"` 宣言 + whitespace apiKey で `EnvOverrideMissingKey` を throw しなくなる」経路のテストが欠落
  - 場所: `app/core/domain/adminSettings/__tests__/service.test.ts:83-95`
  - 理由: `apiKeySource: "env"` + `apiKey: null` で throw するケース（既存）はあるが、その対になる「`apiKeySource: "env"` + `apiKey: "   "` では throw しない」ケースが欠けており、ADR-002 整合の主目的に対するカバレッジ漏れがある。
  - 提案: `apiKeySource: "env"` + `apiKey: "   "` で throw せず `cfg` を返す（`toBe(cfg)`）ことを検証するケースを追加する。
  - **対応: この PR で修正**

#### Notes
- **[N-001]** `service.ts:49` の変更は `serverCloudflare.ts` の 4 field（すべて `!== undefined && .length > 0`）と完全に整合し、ADR-002「trim しない、4 field 共通」と正しく揃っている。
- **[N-002]** スコープ逸脱なし。`testLLMConnection.ts:88` と `valueObject.ts:224` は plan.md でスコープ外と明記され、変更されていない。
- **[N-003]** `null` 判定が維持され、env 未設定時の挙動は不変。ADR-008 の follow-up 方針を正しく実施。
- **[N-004]** テスト 9 ケース全 PASS、ブラウザ検証不要の判断も妥当。

---

## Design Decisions

特になし（ADR-002 / ADR-008 で方針確定済み）。
