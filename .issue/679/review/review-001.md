# PR Review #001 — fix: #679 プレビュー編集で削除したタグが commit 時に復活する問題を修正

**PR:** #694
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 4
- Verdict: **BLOCKED**（W-001 をこのPRで修正）

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 1 / N: 4）

## 指摘一覧

- [W-001] overwrite commit パスのタグ置換に自動テストが無い — `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（General）

## 対応

- [W-001] → このPRで修正。overwrite commit でタグが置き換わり、削除した提案タグ・既存ノートの旧タグがどちらも残らないことを検証する integration test を1件追加（`nextTagId` ヘルパーも追加）。
