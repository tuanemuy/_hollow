# PR Review #001 — feat(ui): MediaUploader の presigned PUT を XHR 化して実バイト進捗を表示

**PR:** #656
**Date:** 2026-06-12
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 6
- Verdict: **BLOCKED**（W-001 を修正して再レビュー）

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] aria-live テキストに高頻度更新の % を埋め込み、読み上げスパムの恐れ — `app/components/note/editor/MediaUploader.tsx:143-146`（修正済み: % を aria-hidden の span に分離）
- [N-001]〜[N-006] 参考情報（対応不要）
