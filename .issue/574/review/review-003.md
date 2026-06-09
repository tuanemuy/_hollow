# PR Review #003 — feat(#574): P23 プロンプトプレビュー（LLM実行プレビュー機構）

**PR:** #629
**Date:** 2026-06-10
**Round:** 3回目（最終確認）

---

## Summary

- Blockers: 0
- Warnings: 1（migration SQL の stale コメント）
- Notes: コード・型・テストは完全にクリーン
- Verdict: **BLOCKED**（Warning 1件を本ラウンドで解消）

---

## Final Review（Round 3）

#### Blockers
- なし

#### Warnings
- **[B3-W-001]** `app/core/adapters/d1/migrations/0016_prompt_preview_counters.sql:11-12` に、Round 2 で schema.ts から除去した stale 文言（「Stale buckets accumulate … pruner concern out of scope for this Issue」）が姉妹ファイルとして残存。schema.ts は ADR-009 準拠（opportunistic cleanup）に更新済みなのに migration コメントだけ旧 ADR-003 前提のままで矛盾。実害なし（DDL は正しい・コメントのみ）だが整合のため更新。→ schema.ts と同じく ADR-009 準拠へ更新（対応済み）。

#### Notes
- Round 2 確認対象2点はクリーン: schema.ts コメントは ADR-009 準拠・adapter `tryConsume` の cleanup 実装と一致 / テスト (g) は `IngestionErrorCode.InvalidId`（実在）で catch-all 集約を検証。
- previewPrompt.ts のエラー翻訳健全（rate/quota/unavailable/timeout/unsupported_format を明示分類、残りを `llm_preview_unavailable` 集約で内部詳細を漏らさない）。
- Round 1/2 の全指摘（B1-W-001〜007、B2-W-001）はコード上すべて解消済み。

## 対応
- B3-W-001: migration SQL コメントを ADR-009 準拠へ更新（対応済み）。
- 自己検証: `grep -rn "out of scope for this Issue|pruner concern|Stale buckets accumulate" app/` → 残存ゼロ。`pnpm typecheck` PASS。

## Design Decisions
特になし。
