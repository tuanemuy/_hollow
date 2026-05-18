# PR Review #002 — feat(tag): connect mergeTags usecase to TagActions UI

**PR:** #53
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** W-003 解消: `MergeTagDialog.tsx:82` でインラインスタイルを `.dialog-description` クラスに置換。`app/styles/app.css:1128-1132` に追加。既存の `.dialog-title` / `.dialog-actions` と命名規則・ファイル位置で整合性あり。
- **[N-002]** W-004 解消: `TagManager.tsx:28-31` で `all = tags.map(...)` をループ外で1度計算する形に変更。提案に厳密一致。
- **[N-003]** W-005 解消: `TagActions.tsx:17` / `MergeTagDialog.tsx:16` ともに `readonly { id: string; name: string }[]` に統一。プロジェクト主流に整合。
- **[N-004]** W-001 / W-002 を Issue #54 として切り出し、ADR-005 に判断を記録。`MoveNoteDialog` と共通化のタイミングで一括対応する判断は妥当。
- **[N-005]** `TagManager.tsx` の `(() => { ... })()` IIFE と `self === undefined` 早期 return は可読性の改善余地として残る。Approve をブロックするものではない。
- **[N-006]** `pnpm typecheck` グリーン。`pnpm test:unit` の既存 property-based テスト失敗は本 PR と無関係。
- **[N-007]** 計画 / ADR 整合: 修正範囲は plan.md と review-001 の Warning 解消の範囲内に収まっており、スコープ逸脱なし。

---

## Design Decisions

特になし（前ラウンドで ADR-005 を追加済み）。
