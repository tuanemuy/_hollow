# PR Review #001 — feat(design): #739 文字起こし機能のデザインモック追加（P48 / P13 録音UI）

**PR:** #740
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 6
- Verdict: **BLOCKED**（Warning 修正のため）

## レイヤー別ファイル

- デザイン / フロントエンド: review-001-design.md（B: 0 / W: 3）

## 指摘一覧

- [W-001] 「録音を停止」が ghost（透明+赤文字）表示で実装の filled danger と相違 — `spec/design/pages/P13-upload.html` ほか全 P13 モック（デザイン）
- [W-002] 「取り消す」(ghost-danger) が rest で赤文字、実装は ink-secondary — `spec/design/pages/P13-upload.html` ほか全 P13 モック（デザイン）
- [W-003] 接続テスト結果が案D `.alert` 表現、実装は塗り単一行バナー — `spec/design/pages/P48-admin-speech.html` / `mobile/P48-admin-speech.html`（デザイン）

## 対応

W-001 / W-002 / W-003 をいずれも「このPRで直す」と仕分け（同一ファイル内で完結する忠実度修正、#739 の目的に合致）。実装（`pillBtnDanger` / `pillBtnGhostDanger` / `BANNER_BASE`）を正としてモックを修正。
