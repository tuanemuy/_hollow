# PR Review #002 — refactor(adminSettings): align assertEnvOverride apiKey trim with ADR-002 (length>0)

**PR:** #431
**Date:** 2026-06-03
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

### General Review

#### Blockers
- なし

#### Warnings
- なし

前回 **[W-001]**（`apiKeySource: "env"` + whitespace apiKey で `EnvOverrideMissingKey` を throw しなくなる経路のテスト欠落）は解消済み。`service.test.ts` に `it("does not throw when source is 'env' and env.apiKey is whitespace-only")` を追加し、`apiKeySource: "env"` + `apiKey: "   "` で throw せず `cfg` をそのまま返すことを検証。旧 `trim().length === 0` 実装下では throw して失敗する真の回帰ガード。

#### Notes
- **[N-001]** テスト 10 ケース全 PASS。新規ケースの命名・期待値も正確。
- **[N-002]** 既存反転テスト（db 起点で env override 強制）と新規ケース（env 起点で throw 抑制）が `length === 0` 判定の表裏を漏れなく押さえており、カバレッジ過不足なし。
- **[N-003]** プロダクションコードの変更は `service.ts:49` の 1 行のみ。スコープ逸脱なし。ADR-002 と完全整合。
- **[N-004]** plan.md のケース数表記に軽微な不一致 → 本ラウンドで「全6ケース」のハードコード記述を一般化して解消。

---

## Design Decisions

特になし。
