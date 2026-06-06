# PR Review #004 — ダイアログモック群 最終確認（#528 / PR #518）

**PR:** #518
**Date:** 2026-06-06
**Round:** 4回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（無害・確認結果）
- Verdict: **APPROVED**

レビュー#003 の B-001/B-002/W-001/W-002/N-001 の解消を確認。新規混入なし。

---

## 最終確認レビュー

### Blockers
なし

### Warnings
なし

### Notes
- **B-001/B-002 解消**: ディレクトリ系3枚は `.dialog > h2.dialog-title + form(fields + .dialog-actions)` のフラット構造。submit は form 内、× 閉じるボタンは CSS/HTML 双方から撤去。
- **W-001 解消**: `--shadow-lg` 全消失、`.dialog` は `--shadow-md`。
- **W-002 解消**: 11枚（filterbar 除く）で `.dialog`/`.dialog-title`/`.dialog-actions` に統一。`.modal-*` 残骸ゼロ。filterbar は `.popover-panel` 維持（除外で正）。
- **N-001 解消**: 12枚の `:root` に `--opacity-disabled` 定義あり。
- 新規混入なし: 孤立クラスゼロ、ブレース/タグ balance 一致、app/ 非変更。
- 軽微（指摘外）: 一部ファイルで `.dialog-title` が2ブロックに分かれる（旧 `.modal-title` 折返しヘルパ + タイポグラフィのリネーム副産物）。プロパティ重複なくマージされ無害。
- P13a-upload-modal は `.panel` 系の別シェル（状態ギャラリー）で統一対象外、矛盾なし。

---

## Design Decisions

ダイアログモックの正準構造は **フラット方式 `.dialog`/`.dialog-title`/`.dialog-actions`**（実 Dialog.tsx primitive 準拠）で確定（review-003 で決定、本ラウンドで全適用を確認）。
