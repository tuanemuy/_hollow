# PR Review #002 — feat(issue/205): add public pages (terms/privacy/about) and robots/sitemap

**PR:** #275
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 13
- Verdict: **APPROVED**

---

## Re-Review 結果（全レイヤー統合）

#### Blockers
なし

#### Warnings
なし

#### Notes

- **[N-001]** B-F-001 修正完了: LandingPage の hash 指定削除済み、about.md の `{#commerce}` `{#contact}` 削除済み、ADR-011 記載済み。
- **[N-002]** W-A-001 修正完了: signature を `{ container: RequestContainer }` に置換、テストの `as never` 全削除。
- **[N-003]** W-A-002 修正完了: `publication/index.ts` に re-export 追加、sitemapHandler の import も barrel 経由に変更。
- **[N-004]** W-A-003 修正完了: `note.slug as string` 削除、branded `NoteSlug` のまま template literal 補間。
- **[N-005]** W-P-001 修正完了: GET / HEAD 両対応。
- **[N-006]** W-P-002 修正完了: try/catch + logger.error + 500 + 空 urlset + `Cache-Control: no-cache`。
- **[N-007]** W-P-003 修正完了: `getContainer()` パターンで `__root.tsx` と同形。
- **[N-008]** W-P-004 修正完了: vite-env.d.ts の冗長宣言削除、`vite/client` グローバル宣言に委譲。
- **[N-009]** W-P-005 修正完了: head.ts の `joinUrl` を export して再利用。
- **[N-010]** W-F-001 修正完了: spec/pages/index.md に P 番号配置の註記追加。
- **[N-011]** W-F-002: robots.txt は元々末尾改行あり（修正不要を確認）。
- **[N-012]** W-F-004 修正完了: about.md のソーシャル行にコメント追加。
- **[N-013]** 副作用なし: typecheck pass、biome lint clean、biome format clean、unit test 2547 件全 pass。新規 lint warning なし。

---

## Design Decisions

このラウンドで見つかった設計判断: 特になし（1周目のADR-011で完結）。
