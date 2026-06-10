# PR Review #002 — feat(#574): P23 プロンプトプレビュー（LLM実行プレビュー機構）

**PR:** #629
**Date:** 2026-06-10
**Round:** 2回目（Round 1 修正の再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 1（schema コメントの stale）
- Notes: 多数（Round 1 指摘の解消を確認）
- Verdict: **BLOCKED**（Warning 1件を本ラウンドで解消）

---

## Use Case / Domain / Adapter（Round 2）

#### Blockers
- なし

#### Warnings
- **[B2-W-001]** `app/core/adapters/d1/schema.ts:801-802` の `prompt_preview_counters` 定義コメントが旧 ADR-003 前提（「Stale buckets accumulate … pruner concern out of scope」）のまま。ADR-009 で adapter 内 opportunistic cleanup に決定済みで実装もそうなっているのに、このコメントだけ stale。→ コメントを ADR-009 準拠（tryConsume が同一呼び出しで当該 user の古い window 行を削除し ~1 行に bound）に更新。

#### Notes
- B1-W-001 解消確認（未知 BRE も `llm_preview_unavailable` に集約、専用文言に着地）。
- B1-W-002 解消確認（消費は LLM 前・失敗時 refund なしの安全側設計を JSDoc + ADR-008 に明記）。
- B1-W-003 解消確認（race 機序コメントを「retry 無し・per-statement write lock 直列化」に修正）。
- B1-W-007 解消確認（cleanup predicate `and(eq(userId), lt(windowStart, current))` で他ユーザー行・現在行・未来行を保護。mapDbError 配下）。
- N（参考）: cleanup DELETE が throw すると claim 成立済みでも tryConsume 全体が失敗扱い（実害極小・安全側で許容、ADR-009 のトレードオフと整合）。

## Test（Round 2）

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- B1-W-004 解消確認（新規4コードの専用文言を `toContain` で1件ずつ固定、文言は errorDisplay.ts と一致）。
- B1-W-005 解消確認（metadata 経路 `suggestMetadata` reject の LLM エラー翻訳 (d2) 追加）。
- B1-W-006 解消確認（`LLM_FAILURE_CODE` 共有定数 + ADR-007 コメント）。
- cleanup の integration アサート2件（user ごと最新1行・他ユーザー行を消さない）追加、偽陽性なし。
- 備考: 未知 BRE 集約分岐の専用テストが無い → 本ラウンドで (g) を追加して解消。

## Security（Round 1 から継続・本ラウンド再確認）
- B1-W-007（カウンタ行の無制限蓄積）は adapter 内 opportunistic cleanup で解消済み。

---

## 仕分け（本ラウンドで全件対応）
- B2-W-001: schema.ts コメントを ADR-009 準拠に更新（対応済み）
- 備考（未知 BRE 集約テスト）: previewPrompt.test.ts に (g) を追加（対応済み）

## Design Decisions
特になし（ADR-008/009 は Round 1 で追記済み）。
