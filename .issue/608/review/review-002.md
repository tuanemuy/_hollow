# PR Review #002 — fix: ヘッダー/フッターのロゴ(BrandLockup)の途切れ解消＋サイズ調整

**PR:** #609
**Date:** 2026-06-09
**Round:** 2回目（review-001 の Warning 修正後の再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 1（W-003、本ラウンドで修正済み → round 3 で確認）
- Notes: 4
- Verdict: **BLOCKED**（W-003 修正後の再確認のため）

---

## General Review

### 前ラウンド指摘の確認

- **W-001（コメントの辺の出所が不正確）**: 部分対応 → W-003 として残存を検出。
- **W-002（右マージンが狭い旨が未記載）**: 解消済み（N-001）。

### Blockers

- なし

### Warnings

- **[W-003]** コメントの辺の出所の区別がまだ一部不正確（W-001 の残存）
  - 場所: `app/components/common/BrandLogo.tsx` コメント
  - 内容: 「left/top from the mark's unstroked outline」としたが、再検算では箱の上端 y=0 はワードマーク上端(0.00)由来であり、マーク unstroked 上端は 4.345 で箱の内側。**マーク由来は left のみ**、top/bottom/right はワードマーク由来。clip の因果説明（マークの stroked 上端 -0.027 が箱上端 0 を越える）は正確。
  - 提案: 「left from the mark's unstroked outline; top/bottom/right from the wordmark」と修正。
  - **対応:** 本ラウンドでコメントを「left edge from the mark's *unstroked* outline; top, bottom and right from the wordmark」に修正済み。typecheck 通過。

### Notes

- **[N-001]** W-002 解消。右マージン(1.16)が狭い旨と将来のワードマーク変更時の再確認が追記された（plan と一致）。
- **[N-002]** 全使用箇所9箇所すべて props なし `<BrandLockup />`。height 既定値 20→16 が一律反映、回帰なし。
- **[N-003]** 再検算で主要数値すべて一致（half stroke ≈4.37 / stroked 左端 -4.368 / 上端 -0.027 / 下端 84.508 / glyph 15.717px / アスペクト比 5.581）。
- **[N-004]** 規約違反なし。`BrandMark` 無変更。

---

## Design Decisions

特になし。
