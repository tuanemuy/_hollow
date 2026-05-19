# PR Review #001 — feat(issue-48): materialise search projection + drop ADR-013/014 guards

**PR:** #85
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 12 (Domain/UseCase 3 / Adapter 3 / Frontend 3 / Test 3)
- Notes: 多数（良い点が多い）
- Verdict: **APPROVED with cleanup** — 全て Warning レベル、Blocker なし。指摘の大半はその場で修正、一部はスコープ外 ADR 記録

---

## Domain / Use Case

### Blockers
なし

### Warnings
- **[W-D-001]** `searchOwnNotes.ts` の `hit.noteId` キャスト過剰（`as unknown as NoteId` / `as unknown as string` 二段）
  - 場所: `app/core/application/search/searchOwnNotes.ts:72`, `:85`
  - 提案: `SearchHit.noteId` は既に `NoteId` で `string` のサブタイプ。キャスト不要に整理
  - 対応: **修正**
- **[W-D-002]** `toOwnedSearchHitView` の branded → string キャストが view.ts と loaders.ts で責務分散
  - 場所: `app/core/application/search/view.ts:34-35`
  - 提案: 動作上問題なし、`loaders.ts` の既存規約に従っているため本 PR では現状維持
  - 対応: **スコープ外**（branded 型の DTO 統一は別 Issue でまとめて）
- **[W-D-003]** UoW 分離の WHY コメントが usecase コードに無い
  - 場所: `app/core/application/search/searchOwnNotes.ts:73-82`
  - 提案: ADR-001 参照の 1-2 行コメント追加
  - 対応: **修正**

## Adapter

### Blockers
なし

### Warnings
- **[W-A-001]** `findByIds` の `ids as readonly string[]` wide cast が `mediaAssetRepository.findByIds` と異なるイディオム
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:307`
  - 提案: `mediaAssetRepository` 準拠で `inArray(notes.id, [...chunk])` の spread のみで brand を剥がし、wide cast を撤廃
  - 対応: **修正**
- **[W-A-002]** `runExportJob.ts` の inline `noteRepo.findByIds = async () => []` が silently-broken 化リスク
  - 場所: `app/core/application/export/runExportJob.ts:203-205`
  - 提案: 将来 `assembleArtifact` が `findByIds` を呼んだ瞬間に 0 件が返るサイレント不具合を防ぐため throw に変更
  - 対応: **修正**
- **[W-A-003]** integration test の chunk 境界カバレッジが 95 件のみ
  - 場所: `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts:1200-1213`
  - 提案: 90 (境界ジャスト) と 181 (複数 full chunk) を追加
  - 対応: **修正**（Test W-001 と統合）

## Frontend

### Blockers
なし

### Warnings
- **[W-F-001]** `showVisibilityBadge` prop は本 PR 後 `={true}` 固定のみで可変にする必要がない
  - 場所: `NoteList.tsx:115/119`, `ListView.tsx:9/93`, `TileView.tsx:9/78`
  - 提案: prop を削除し常時表示。型レベルで ADR-013 supersede の意図を焼く
  - 対応: **修正**
- **[W-F-002]** `ListView.tsx` の chip 表示で `·` セパレータの非対称（pre-existing）
  - 場所: `ListView.tsx:93-100`
  - 提案: W-F-001 リファクタ時に chip 出力を分岐から外す
  - 対応: **修正**（W-F-001 と一括）
- **[W-F-003]** `OwnedNoteFilterItem | OwnedNoteSearchItem` の union は型同形で意味なし
  - 場所: `loaders.ts:74-79`, view コンポーネント群
  - 提案: 共通 type alias `DisplayedNote` の導入 or `OwnedNoteFilterItem` 単一化
  - 対応: **修正**

## Test

### Blockers
なし

### Warnings
- **[W-T-001]** chunk 境界 integration test は 95 件のみで複数 full chunk を踏まない（Adapter W-A-003 と同じ）
  - 対応: **修正**（Adapter W-A-003 と統合）
- **[W-T-002]** drop ケースで `result.hits` の長さを名前付き assertion で pin していない
  - 場所: `searchOwnNotes.test.ts:412-438`
  - 提案: `expect(result.hits).toHaveLength(2)` を追加し、loaders.ts の `count` ソースが drop 後値である意図を明示
  - 対応: **修正**
- **[W-T-003]** `makeFakeNoteForId` の `Number(idStr.slice(-1))` で a-f が `NaN → 0` フォールバック
  - 場所: `searchOwnNotes.test.ts:67-69`
  - 提案: `parseInt(idStr.slice(-2), 16)` で hex 安全に
  - 対応: **修正**

---

## Design Decisions

このラウンドで新たに見つかった設計判断は無し。`branded → string` キャストの責務分散（W-D-002）は将来の DTO 統一 Issue で検討するが、本 PR では現状維持。

---

## 修正アクション

1. Backend 修正（`searchOwnNotes.ts`, `view.ts`, `noteRepository.ts` adapter, `runExportJob.ts`, `searchOwnNotes.test.ts`, `noteRepository.integration.test.ts`）
2. Frontend 修正（`NoteList.tsx`, `ListView.tsx`, `TileView.tsx`, `loaders.ts`）

ファイルが重複しないため並列で 2 サブエージェント起動可。
