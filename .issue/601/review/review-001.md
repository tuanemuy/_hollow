# PR Review #001 — fix(search): #601 P32 スニペットの FTS5 <mark> ハイライトを要素として描画

**PR:** #778
**Date:** 2026-06-26
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 0 / N: 3）

## 指摘一覧

- [N-001] エッジケース分岐（未閉じ/連続マーカー）のテスト未カバー — `app/components/public/highlightSnippet.tsx:44-47`
- [N-002] 空マーカー `<mark></mark>` が空 styled mark を生む可能性（FTS5 では実発生せず）— `app/components/public/highlightSnippet.tsx:50-55`
- [N-003] React key は適合 — `app/components/public/highlightSnippet.tsx:51-55`

## 対応

- [N-001] → 対応。連続マーカー・未閉じマーカーのテストを `highlightSnippet.test.tsx` に追加（5 tests pass）。
- [N-002] → 見送り。FTS5 `snippet()` は空マーカーを生成しないため実害なし。Note 止まり。
- [N-003] → 情報（良い点）。対応不要。

Blocker 0 / 修正対象 Warning 0 のため、本ラウンドで APPROVED。
