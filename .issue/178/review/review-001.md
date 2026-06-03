# PR Review #001 — refactor(notes): tighten NoteRepository filter-sharing contract at the type level

**PR:** #450
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 13
- Verdict: **APPROVED**

レビュー観点: Domain（port 型契約）/ 横断整合性（消費側・JSDoc・テスト）の 2 視点並列。両視点とも実機 `pnpm typecheck` をゼロエラー通過で確認。

---

## Domain（port 型契約）

### Blockers
- なし

### Warnings
- なし（初稿で挙がった W-001「`AND` semantics 記述の脱落」はレビュアー自身が誤検出として撤回 — 当該記述は `NoteOwnerFilters` JSDoc に正しく移設済み）

### Notes
- **[N-001]** 構造保存（プロパティ集合・optional 性・read-only 性）が完全一致。旧 `NoteOwnerListOpts` のインライン `Readonly<{ ... }>` ブロックがそのまま `NoteOwnerFilters` として byte 単位で抽出され、`NoteOwnerListOpts = NoteListOpts & NoteOwnerFilters` は旧定義と型同一。`NoteOwnerCountOpts = NoteOwnerFilters` は旧 `Pick<...>`（6 キー全列挙）と構造同値。`exactOptionalPropertyTypes: true` 下でも intersection が optional 性を保存。
- **[N-002]** フィルタ意味論 JSDoc の移設は過不足なし（`AND` semantics、`tagIds` 全タグ一致、`visibility` 3 状態、`referencingNoteId`、`directoryIds` サブツリー＋空配列短絡＋`.issue/392/adr.md` 参照すべて欠落なく移動）。
- **[N-003]** 3 兄弟メソッド JSDoc の `{@link NoteOwnerFilters}` 参照化は正しく、`listWithCount` の手書き列挙 2 箇所も両方処理。`findByOwner` / `listWithCount` の旧来の `directoryIds` 列挙漏れが恒久解消。
- **[N-004]** hexagonal/DDD 完全準拠。変更は domain port 層の型定義・JSDoc のみ、ランタイム/I/O/framework 混入ゼロ。
- **[N-005]** スコープ厳守。adapter ロジック変更・横展開・branded type 導入なし。
- **[N-006]** `NoteOwnerFilters` 未 import は未使用 export ではなく、`NoteOwnerCountOpts = NoteOwnerFilters` で「count 側手動同期を構造的に不能化」する SSOT 定義そのもの。意図通り。

## 横断整合性（消費側・JSDoc・テスト）

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** `pnpm typecheck` ゼロエラー通過。`git diff main --name-only` の実変更は port ファイル + テストコメント 1 箇所 + `.issue/178/` ドキュメントのみ。消費 6 ファイルは diff に一切現れず余計な変更の混入なし。
- **[N-002]** adapter の `buildOwnerListWhere(opts: NoteOwnerCountOpts)` への `findByOwner` / `listWithCount` からの `NoteOwnerListOpts` 代入依存（ListOpts ⊇ CountOpts）は維持。typecheck が裏付け。
- **[N-003]** 追従更新したテストコメント（`listNotesByOwner.integration.test.ts:693-696`）は実態と正確に一致。`buildOwnerListWhere` 本体が `opts.directoryIds` を参照しており、`NoteOwnerFilters` から落とせば型エラーになるガード記述は正確。
- **[N-004]** 「更新不要」とされた `noteRepository.integration.test.ts:1696` コメントは `Pick` 語非依存で整合。
- **[N-005]** 全 grep（`app/` `docs/` `spec/`）で `Pick` 前提の残存参照ゼロ。port ファイルの唯一の `Pick` 言及は意図的な対比説明。
- **[N-006]** JSDoc の `{@link}` 参照先はすべて同一ファイル内に実在、解決不能・循環なし。
- **[N-007]** `listWithCount` JSDoc の手書き列挙 2 箇所が両方参照化済み、取りこぼしなし。

---

## Design Decisions

このラウンドで新たな設計判断はなし。既存 ADR-001（提案 B 採用・`Pick` 廃止・`NoteOwnerCountOpts` エイリアス保持）が忠実に実装されていることを両視点が確認した。
