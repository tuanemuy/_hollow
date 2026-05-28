# PR Review #004 — fix(issue/215): drop default page/limit from URL on paginated routes

**PR:** #310
**Date:** 2026-05-29
**Round:** 4 (final)

---

## Summary

- Blockers: 0
- Warnings: 0
- Verdict: **APPROVED**

Round 3 で見つかった Blocker C-001（`PublicNoteDetail.tsx` の `<Link to="/u/$username" search={{ page: 1, limit: 20 }}>` ハードコード）の修正を確認。同時に、リポジトリ全域の `<Link search={{ ... }}>` を再走査し、Issue #215 のスコープ内に残存する明示値ハードコードがないことを確認。

---

## Cross-cutting (Round 4)

#### Blockers
なし

#### Warnings
なし

#### Notes
- **C-001 修正確認**: `PublicNoteDetail.tsx` の 2 か所（L45, L59）で `<Link to="/u/$username" search={{}}>` に置換済み。明示的ハードコード値 `page: 1, limit: 20` は完全に消えている。
- **残存ハードコード調査**: `grep search={{ app/` で検出された他 5 件（`NoteMetaPanel`, `DirectoryTree`, `ErrorPage`, `PublicSearch`, `ExportJobDetail`）はいずれも `HOME_SEARCH = {}` を `...` 展開している箇所、または `/search` / `/exports`（plan.md スコープ外で `page` / `limit` を持たない別 schema）。Issue #215 のスコープ内では追加修正不要。
- **4 ルートすべての初期遷移パス保証**: `/`, `/trash`, `/u/$username`, `/notes/$noteId/history` での URL クエリ非付与を、`HOME_SEARCH` / `TRASH_SEARCH` / `NOTE_HISTORY_SEARCH = {}` 化、`paginationSearchSchema` の input-optional 化、ページ送り Link の `historyNavSearch` / `Pagination.navSearch` 正規化により全経路で実現。
- **品質ゲート**: `pnpm typecheck` 通過、`pnpm test:unit` 140 files / 2705 tests 全 PASS。
- **Round 1〜3 で挙がった指摘**: SSOT 化、対称型ガード、`/u` schema 共有、C-001 すべて解消済み。
- **Issue #215 の目的達成**: 主要ルートの初期遷移で URL クエリが付かない動作が、ユニットテスト・型ガード・実機検証（軽量 4 項目）すべてで担保された。

**Verdict: APPROVED**

---

## レビューループ全体サマリー

| Round | Layer | Blockers | Warnings | Verdict |
|-------|-------|----------|----------|---------|
| 1 | Frontend | 0 | 1 | BLOCKED |
| 1 | Routing/Schema | 0 | 3 | BLOCKED |
| 1 | Test | 0 | 3 | BLOCKED |
| 2 | Frontend | 0 | 0 | APPROVED |
| 2 | Routing/Schema | 0 | 3 | BLOCKED |
| 2 | Test | 0 | 0 | APPROVED |
| 3 | Routing/Schema | 0 | 0 | APPROVED |
| 3 | Cross-cutting | 1 | 0 | BLOCKED |
| 4 | Cross-cutting | 0 | 0 | **APPROVED** |

最終結果: **全レイヤー APPROVED**。Ready for review に切り替える。
