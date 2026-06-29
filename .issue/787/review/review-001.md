# PR Review #001 — fix(note): #787 モバイルでノート詳細アクションツールバーを縮小

**PR:** #809
**Date:** 2026-06-30
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1（2レビュアーが同一指摘）
- Notes: 9
- Verdict: **BLOCKED**（Warning を直すため次ラウンドへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Design System / Accessibility: review-001-design-a11y.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] `tokens.md` の `--icon-*` 利用ガイダンス（§5.5 / L202-213）が、`Icon` ラッパに `max-sm:size-[var(--icon-*)]` を当てる新パターンを反映していない — `spec/design/tokens.md:202-213` / `app/components/common/Icon.tsx:30-38`（Frontend / Design 両方が指摘）

## 仕分け

- [W-001] → **このPRで直す**。tokens.md は plan のステップ2でスコープ内。doc とコードの利用ポリシー整合は低コストで完結する。
