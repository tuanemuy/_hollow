# PR Review #002 — fix(editor): #840 inline rollback の道連れ消失を防止

**PR:** #845
**Date:** 2026-07-19
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0 / N: 10）
- Test: review-002-test.md（B: 0 / W: 0 / N: 6）

## 指摘一覧

- なし（新規 fix 対象ゼロ）

## 備考

- round 1 の W-001（4-T8 の reconcile 経路 false green）はコミット 310122a6 で解消。両レビュアーが変異注入（reconcile 発火行の無効化 → 4-T8 が red 化）で裏取り済み。
- 実装本体は plan/ADR に忠実で AC-1〜AC-7・AC-3′ をコード＋テストで満たす。#233 の保守的 rollback 安全機構は基準点前進のみで無効化されていないことを両視点で確認。全 52 テスト green。
- N-010（Frontend）: disabled トグル時の pending emit 早期 return 窓は**本 PR 変更起因ではない既存挙動**でスコープ外。Phase 5 の起票基準で判断（台帳参照）。
