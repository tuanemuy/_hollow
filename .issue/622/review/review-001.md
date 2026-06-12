# PR Review #001 — fix: #622 P31 公開ノート詳細をデザインモックに一致させる

**PR:** #661
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 12
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧

- [W-001/F] タグリンクのアサーションがマークアップ全文一致で脆い — `PublicNoteDetail.test.tsx:153-158`（Frontend）→ 修正（Test W-003 と同一テーマ）
- [W-002/F] メタ行リンクタグの hover アフォーダンス欠如 — `PublicNoteDetail.tsx:141-149`（Frontend）→ 見送り: モック（`.tag` に hover なし）準拠が本 Issue の目的のため。将来のデザイン改善で扱う
- [W-001/T] タグ1件フィクスチャでは per-tag search の回帰を検出できない — `PublicNoteDetail.test.tsx:86`（Test）→ 修正
- [W-002/T] AC-4 の非リンク証明が不完全 — `PublicNoteDetail.test.tsx:160`（Test）→ 修正
- [W-003/T] 完全一致アサーションが属性順・エスケープ依存で脆い — `PublicNoteDetail.test.tsx:155-159`（Test）→ 修正
