# PR Review #001 — feat(search): wire bulkRebuildFromSnapshots to admin rebuild operation

**PR:** #144
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 10
- Notes: 多数
- Verdict: **APPROVED with required fixes**（Warning すべて即時対応）

---

## Use Case / Application

### Blockers
なし

### Warnings
- **[UC-W-001]** Offset paging on `findByOwner` is unstable under concurrent writes during rebuild.
  - 場所: `app/core/application/adminSettings/rebuildSearchIndex.ts:101-105`
  - 理由: 既定 sort は `updatedAt desc`。rebuild 中に Note が `save` されると `updatedAt` が移動し、offset ベース walk は同一行を 2 回 yield する／別行を skip する可能性
  - 提案: `findByOwner` 呼び出しに `{ sort: 'createdAt', order: 'asc' }` を明示。`createdAt` は immutable
- **[UC-W-002]** `processedCount` の意味的曖昧さ（adapter が途中 throw した場合、UI の「再投入しました」が嘘になる）
  - 場所: `app/core/application/adminSettings/rebuildSearchIndex.ts:75-77, 122-123`、`app/components/admin/Jobs/index.tsx:419-422`
  - 提案: JSDoc に「成功時のみ意味を持つ」と明示し、UI 文言を「再投入を試行（adapter throw 時はその時点まで）」と曖昧化、または "完了" 文言で十分とする

### Notes
- N-001: directory 解決の per-id 並列化余地（小規模 corpus では実害なし、見送り）
- N-002: `satisfies Directory` の型補強は冗長（要修正）

---

## Test

### Blockers
なし

### Warnings
- **[T-W-001]** ページング境界の検証が欠落（`fetched === limit` / `< limit` / cursor 更新ループが unit / integration とも空回りで通る）
  - 提案: limit を override する seam を入れる、または 1 ケースで 6 ノートを seed して 2 ページ取得を強制
- **[T-W-002]** `SystemError(DatabaseError)` の propagate が plan 明記なのに unit test に欠落
  - 提案: `noteRepository.findByOwner` が throw する fake で 1 ケース追加
- **[T-W-003]** integration test の SELECT 検証が `visibility` だけに偏っている
  - 提案: `tagNamesJson` / `directoryPath` / `bodyPlain` / `title` も assert
- **[T-W-004]** nested directory path のテストが欠落（全シナリオで root のみ）
  - 提案: integration test に `/parent/child` パスを seed して 1 ケース追加
- **[T-W-005]** `frontMatter['date']` の `undefined`（key absent）/ `number (epoch)` ケース欠落
  - 提案: unit test に 2 ケース追加

### Notes
- N-001: `describe("parseFrontMatterDate")` のリネーム
- N-002〜N-007: 細部の改善（一部修正、一部見送り）

---

## Frontend / Presentation

### Blockers
なし

### Warnings
- **[FE-W-001]** rebuild ボタンに `aria-busy` が欠落（長時間ブロック処理のため SR ユーザー向け補強）
  - 場所: `app/components/admin/Jobs/index.tsx` の rebuild ボタン
  - 提案: `aria-busy={isPending || undefined}` を追加
- **[FE-W-002]** エラー表示の `style={{ marginTop: 6 }}` がインラインスタイル
  - 提案: `mt-1.5` 等の Tailwind utility に置換
- **[FE-W-003]** result 表示が `<p>` のみで live region になっておらず SR で結果が通知されない
  - 提案: `role="status" aria-live="polite"` を付与

### Notes
- N-001〜N-006: パターン整合・DTO 規約遵守・SSR 境界など、すべて良い

---

## Design Decisions

このラウンドで見つかった重大な設計判断は **ADR-007**（`findByOwner` sort 固定化）として追加。
