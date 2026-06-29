# PR Review #001 — refactor(ingestion): move the in-progress upload badge to the sidebar upload item

**PR:** #807
**Date:** 2026-06-28
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 20
- Verdict: **BLOCKED**（Warning 修正のため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Accessibility: review-001-accessibility.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001 frontend] 可視 `99+` キャップと `aria-label` の実数読み上げの分岐が意図的だと明文化されていない — `app/components/layout/UploadNavItem.tsx:24,28` / `app/components/ingestion/useIngestionQueueCount.ts:62-64`（→ このPRで直す: WHYコメント追加）
- [W-001 test] 実 `uploadQueueLabel`（AC-4 のアクセシブル名の真実点）がモジュール丸ごと mock で複製され、ユニットテストで一度も実行されていない — `app/components/layout/__tests__/UploadNavItem.test.tsx:13-17` / `app/components/ingestion/__tests__/useIngestionQueueCount.test.tsx:29`（→ このPRで直す: 実関数の直接 spec 追加）

## 仕分け

- 両 Warning とも変更同一エリアに閉じる軽微指摘のため、このPRで修正する。
- Frontend N-007（ADR Status が Proposed）: ドキュメント nit。実装が出荷段階なので ADR Status を Accepted に更新する。
