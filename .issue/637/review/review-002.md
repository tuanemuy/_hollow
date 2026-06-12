# PR Review #002 — feat(ui): 高度なローディングUX（#634 Phase 3）

**PR:** #651
**Date:** 2026-06-12
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0）
- Accessibility・デザイン整合: review-002-a11y-design.md（B: 0 / W: 0）
- Test・計画/DoD整合: review-002-test.md（B: 0 / W: 0）

## Round 1 指摘の解消確認

- [Frontend W-001] docs/JSDoc の「スライド」表記 → `animate-pulse` に統一済み（ADR-004 整合）
- [a11y W-001] SubmitButton に `primary` prop を追加し `data-primary` を条件出力 → footgun 解消
- [Test W-001] SubmitButton の pending===true 経路を `requestSubmit` + 未解決 Promise で検証
- [Test W-002] UploadDialog 件数進捗の中間値（done=1/total=2, percent=50%）を assert
- [Test W-003] IngestionJobRow の RetryableError 経路を owner-retry と `data-sm` で区別して検証
- [Frontend W-002 / a11y W-002] ADR で合意済みのため変更なし（設計通り）

## 残 Notes（任意・見送り）

- RouteErrorFallback / MediaUploader の専用ユニットテストは無し（いずれも任意・既存も未整備）。本 Issue の DoD には影響しない。

## 完了判定

3レンズすべてで Blocker 0・Warning 0。直すべき指摘ゼロのラウンドにつき **APPROVED**。
</content>
