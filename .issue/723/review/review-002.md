# PR Review #002 — fix(design): #723 P12 エディターモックを FrontMatter 下部常設に追従

**PR:** #815
**Date:** 2026-07-03
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-002-general.md（B: 0 / W: 0 / N: 5）

## 指摘一覧（すべて Note・完了を妨げない）

- [N-001] mobile `.mode-tabs` が APG 属性（aria-controls/id/roving tabindex）を欠く — pre-existing（#776 がモバイル未到達）・本 PR で未悪化・スコープ外 → 据え置き
- [N-002] 「キーを追加」ボタンが空入力で活性（実装は空時 disabled）— モックは追加アフォーダンスを見せる静的表現として妥当。レビュアーも Note 判定 → 据え置き
- [N-003] sr-only `<label>` が for/id 未関連付け（aria-label で accessible name を提供・実害なし）→ 据え置き（round-1 N-001 と同じ）
- [N-004] 良い点: `.fm-*` 接頭辞で命名衝突回避・スコープ厳密
- [N-005] 良い点: desktop/mobile の FrontMatter DOM 完全一致・datalist id 重複なし・実装と対応

## 判定

前ラウンドの W-001 / W-002 は両方解消済み。受け入れ基準 AC-1〜AC-5 を全て充足。新たな Blocker・Warning なし。残る指摘はすべて Note（pre-existing・スコープ外・設計選択）で、見送り記録済みのため完了を妨げない。→ **APPROVED**。2 ラウンドで収束。
