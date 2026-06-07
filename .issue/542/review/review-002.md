# PR Review #002 — 領域3「整理・公開管理」(P17/P18/P14) のモック実装追従

**PR:** #562
**Date:** 2026-06-07
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（良好・参考のみ）
- Verdict: **APPROVED**

---

## デザイン忠実度・スタイリング規約 + Frontend 正当性

#### Blockers
なし

#### Warnings
なし

#### Notes（要点）
- N-001: design W-002（編集ブロック2カラム化、`TAG_EDITING_GRID`/`TAG_EDITING_FIELD`）がモック構造と一致、デグレなし。
- N-002: design W-003（`TAG_ROW` に `hover:bg-surface` + `motion-reduce` ガード）がモックと一致。編集ブロックの accent-surface 上塗りと競合しないことを確認。
- N-003: FE N-006（コピー成功 SR 通知・aria-label 固定・Check スワップ・タイマー ref 管理 + unmount cleanup）要件充足。
- N-004: ADR-005（ピル維持）の判断は妥当。
- N-005: スタイリング規約遵守（トークン/既存定数経由、リテラルpx新規なし、data-* variant）を確認。typecheck/lint クリーン。

## アクセシビリティ

#### Blockers
なし

#### Warnings
なし

#### Notes（要点）
- N-001: a11y W-001（コピー成功 SR 通知）適切に修正。`role="status"`/`aria-live="polite"`/`aria-describedby`(useId)、stale/二重読み上げ懸念なし。`UrlCopyButton` と同一パターン。
- N-002: a11y W-002（retention カード `aria-label="保存期間の案内"`）妥当。
- N-003/N-004: 新規 a11y 問題なし。ラジオ fieldset/legend、ケバブ・タップターゲットの非回帰を確認。
- **N-005（参考・任意）**: PublishSettings のコピー live-region に対応するユニットテストが無い（`UrlCopyButton.test.tsx` にはある）。a11y 要件自体は充足のため Warning ではないが、回帰防止の観点で追加余地あり。→ 完了をブロックしない Note として記録。

---

## 完了判定

Blocker 0 / Warning 0 を達成。1ラウンドクリーンで完了（Step 7）。N-005 は任意の Note のため本PRでは見送り、必要なら後続で対応可能。

## Design Decisions

新規の設計判断なし（ADR-005 は前ラウンドで記録済み）。
