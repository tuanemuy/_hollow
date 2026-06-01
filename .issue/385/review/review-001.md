# PR Review #001 — fix(issue/385): 非存在ノート詳細を notFound 表示にする

**PR:** #408
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

複雑度「小規模」のため General Review 1本で実施。

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** 修正は Issue #385 を正しく解決。`NoteDetail` は `renderServerComponent` 経由の RSC として描画され、`throw notFound()` が `notFoundComponent` に伝播せず汎用 `errorComponent` に流れていた根本原因を、catch 節での notFound JSX 直接 return で解消。返す JSX は削除前の `notFoundComponent` と文言・`role="alert"` 完全一致で UX 退行なし。
- **[N-002]** 確立パターン（`ExportJobDetail/Page.tsx`）に忠実。CLAUDE.md のエラーハンドリング方針（境界での try/catch 限定、`isNotFoundError` 構造的判定、notFound/forbidden を画面上区別しない＝存在漏洩防止）にも整合。
- **[N-003]** `notFoundComponent` 削除は妥当。到達不能なデッドコードであり、残すと「notFound() が伝播する」という誤解を温存する。`createFileRoute`/`redirect` 等の import は引き続き使用され、未使用 import は発生しない。
- **[N-004]** `notFound`（@tanstack/react-router）import は完全除去。残存文字列は JSDoc 説明のみ。typecheck もクリーン。
- **[N-005]** テストは妥当。`../loaders` を mock し、(1) NotFoundError → notFound JSX 返却、(2) その他エラー → re-throw の両分岐を `renderToStaticMarkup` で検証。退行（`throw notFound()` 復活・エラー握り潰し）の双方を固定。2 passed 通過。
- **[N-006]** スコープ外（既存の不整合）: history 系ルート（`NoteHistoryList`/`NoteRevisionDetail`）も同じ RSC インライン JSX return パターンを採用済みで、それらの `notFoundComponent` も既に到達不能なデッドコード。本 PR の論理を適用すれば同様に削除対象。#385 のスコープ外だがフォローアップ Issue 化を検討。→ Phase 4 で対応。

---

## Design Decisions

特になし（plan.md / 既存 ADR で既出の判断に準拠）。
