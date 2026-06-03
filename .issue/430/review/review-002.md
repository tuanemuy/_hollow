# PR Review #002 — プロンプト設定の関心分離: #396 残課題（P23 文言整合 / dead-input 解消）

**PR:** #444
**Date:** 2026-06-03
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## Backend (Round 2)

### Blockers
- なし

### Warnings
- なし（前ラウンドの W-001 解消）

### Notes
- **W-001 解消**: `runIngestionJob.ts` の title/directory resolve を `Promise.all` で並列化、remote-resolver 往復を1ホップに短縮。
- **回帰なし**: `SentinelPromptResolver.resolveFor` は await 前に `calls.push(purpose)` を同期実行し、Promise.all は配列要素を左→右に同期呼び出しするため `calls: ["title","directory"]` 順序は維持。結合テスト27件 green、typecheck clean。
- **エラー伝播整合**: Promise.all の片方 reject → 全体 reject が既存 `classifyPipelineError`/`markFailedSafely` パスへそのまま流れる（直列と同一エラーオブジェクト）。
- **resolver 閉じ込め維持**: title/directory resolve は LLM 構造化分岐内のみ、html/markdown 分岐は不変。

## Frontend / Test

- Round 1 で Blocker 0 / Warning 0（変更なし、再レビュー不要）。

---

## Design Decisions

特になし。

---

## 完了

Blocker 0 / Warning 0 を達成。1ラウンドクリーン完了条件を満たし APPROVED。
