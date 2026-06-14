# PR Review #001 — feat(settings): #573 P24 アカウント削除強化

**PR:** #742
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 18
- Verdict: **APPROVED（Blocker 0・修正対象 Warning は W-003 のみ対応済み、他は見送り記録）**

## レイヤー別ファイル

- Domain + Use Case: review-001-backend.md（B: 0 / W: 0 / N: 1）
- Adapter / Infrastructure: review-001-adapter.md（B: 0 / W: 2 / N: 10）
- Frontend: review-001-frontend.md（B: 0 / W: 3 / N: 5）
- Security + Test: review-001-security-test.md（B: 0 / W: 1 / N: 2）

## 指摘一覧と仕分け

- [W-003] BTN_DESTRUCTIVE の hover/active が任意値 hex — `app/components/identity/styles.ts:263`（Frontend）→ **修正済み**（`--color-error-hover`/`--color-error-pressed` トークンを tokens.css/index.css/tokens.md に追加し token 経由に置換）
- [Adapter W-001] status/revokedAt 二重不変条件のドキュメント拡充 → **見送り**（quality-of-life。正しさに影響なし）
- [Adapter W-002] 集計 SQL の型キャストが冗長だが既存規約準拠 → **見送り**（既存パターンに一致）
- [Frontend W-001] ページ見出しの構造一貫性 → **見送り**（P22 と同パターンで実体なし）
- [Frontend W-002] Step 3 ラベルスペーシング → **見送り**（視覚検証済み・問題なし）
- [Security W-001] countPublicByOwner の active-only ズレ → **見送り**（ADR-003 で「約 N 件」と文言緩和済み。実装と計画一致）

## Notes（良い点・主要）

- backend: summarizeAccountDeletion が listNotesByOwner 準拠の read-only UoW、母集団が実カスケード一致
- adapter: share-link は notes.status 不問 JOIN（trashed 含む）、media は attached のみ・COALESCE で空集合 0
- frontend: 多段 UI がモック構造に準拠、影響リスト文言が ADR-003 虚偽表示禁止に準拠、a11y 充実
- security: confirmWord 非伝播が型+実装で二重防御、パスワード再検証バイパス不可、テスト網羅
