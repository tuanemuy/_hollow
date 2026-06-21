# PR Review #003 — feat(ui): #509 エクスポート画面のデザイン未実装を解消

**PR:** #769
**Date:** 2026-06-21
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 7
- Verdict: **BLOCKED**（W-001 を直して再レビュー）

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 1）
- Architecture / Styling: review-003-architecture.md（B: 0 / W: 0、APPROVE 相当）

## 前ラウンド指摘の解消

- [W-001] JOB_META の border-t を `JOB_META_DIVIDER` に切り出し一覧側へ分離 → 詳細の宙吊り罫線解消 ✅

## 指摘一覧

- [W-001] 詳細ビューの action 行が `failed`/`cancelled`/`expired` で中身ゼロのまま `border-t border-hairline pt-3`（JOB_ACTIONS）を描画する。download/cancel/期限切れメッセージの3子要素が全て条件描画で全 null になる status では、`<dl>` 直下に中身なしの罫線付き余白 div が残る（Round 2 W-001 の上下逆版） — `app/components/export/ExportJobDetail/index.tsx`（JOB_ACTIONS）（Frontend）

## 仕分け

- W-001: このPRで直す（子要素が1つ以上ある時のみ action div を描画する。詳細側1箇所で完結）
