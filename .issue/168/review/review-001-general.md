# General Review — PR #764 (Issue #168)

対象: `D1NoteRevisionRepository.countByNoteId` を全行 materialise から SQL `count()` 集計へ変更。

## 差分の要旨

```diff
-import { and, asc, desc, eq, inArray } from "drizzle-orm";
+import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
...
   countByNoteId(noteId: NoteId): Promise<number> {
     return mapDbError("Failed to count note revisions", async () => {
-      // `count(*)` would be cheaper, but Drizzle's typed builder needs ...
       const rows = await this.db
-        .select({ id: noteRevisions.id })
+        .select({ value: count() })
         .from(noteRevisions)
         .where(eq(noteRevisions.noteId, noteId));
-      return rows.length;
+      return Number(rows[0]?.value ?? 0);
     });
   }
```

## 受け入れ基準の検証

| # | 基準 | 結果 | 根拠 |
|---|---|---|---|
| AC-1 | 全行を materialise せず SQL `count` 集計で件数を返す | 満たす | `select({ value: count() })` に置換済み。`count()` は集計式を発行し、行本体を取得しない（`noteRevisionRepository.ts:133`）。 |
| AC-2 | 既存 integration test「countByNoteId reflects the number of stored revisions」がそのまま通る | 満たす（論理上） | テストは 2 件挿入で `expect(count).toBe(2)`（`noteRevisionRepository.integration.test.ts:190-219`）。戻り値の意味は不変。 |
| AC-3 | `pnpm typecheck && pnpm lint && pnpm test` が通る | typecheck 確認済み | レビュー時に `pnpm typecheck` 実行→エラーなし。lint/test は環境上未実行だが差分はパターン踏襲のみで risk 低。 |

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001]** 既存パターンとの完全一致。`userRepository.ts:214-218` の `assertNotLastAdmin` 系が `.select({ value: count() })` + `return Number(rows[0]?.value ?? 0);` を採用しており、本変更はこれと識別子・null 合体まで含めて完全一致。`publicationStateRepository.ts:278,352` も同型。CLAUDE.md「確立されたパターンを尊重する」に忠実で、Issue 提案の raw `sql\`count(*)\`` より型安全な選択。妥当。
- **[N-002]** 型安全性。`count()` は Drizzle 上 `number` 型として推論され、`Number(...)` ラップは冗長に見えるが他リポジトリと揃える意図で許容範囲。`rows[0]?.value ?? 0` の `?.` + `?? 0` により空結果（理論上 `count` は常に 1 行返すため到達しないが）でも安全に 0 を返す。回帰なし。
- **[N-003]** コメント方針。CLAUDE.md「Default to no comments」に沿って、誤読を招く旧コメント（"`count(*)` would be cheaper, but ..." — 新実装ではまさに `count` を使うため矛盾する）を削除済み。新規コメント追加もなし。適切。
- **[N-004]** 呼び出し元への影響なし。`saveNote.ts:187` / `restoreNoteRevision.ts:166`（上限判定の比較）、`listNoteRevisions.ts:54`（history total）はいずれも戻り値を plain `number` として消費しており、型・意味とも不変。回帰リスクなし。
- **[N-005]** スコープ規律。plan.md の「含まれないもの」通り `deleteOldestForNote` の `select({ id })` フル取得には手を付けておらず（実 id が必要なため別問題）、変更は `countByNoteId` 1 メソッドに限定。最小差分で良い。
- **[N-006]** 残課題（情報）。`shareLinkRepository.ts:211,228` と `usageMetricsProvider.ts:157` は `value` ではなく `count` をキーに使う変種が混在している。本 PR の範囲外だが、リポジトリ全体でキー名（`value` / `count`）が統一されていない点は将来の整理候補。本 PR は `value` 派（userRepository 同等）に揃えており問題なし。

## 総評

Issue #168 の意図（全行 materialise を避け SQL 集計で件数取得）を、リポジトリの確立パターンに沿って最小差分で達成している。正しさ・型安全性・既存一貫性・コメント方針すべて問題なし。Blocker / Warning ともになし。APPROVE 相当。
