# PR Review #002 — Issue #36 Round 1 修正反映

**PR:** #64
**Date:** 2026-05-19
**Round:** 2回目（Round 1 修正の検証）

---

## 修正サマリ

Round 1 で挙がった Warning 18 件のうち、即時修正コストが見合うものを本 PR で反映。残りは `.issue/36/progress.md` に open risk として記録。

### Domain + Application 反映
- **[W-D1] DTO branded 型統一**: `InternalLinkSuggestion.noteId: NoteId`, `tagId: TagId` に変更。`searchInternalLinkTargets.ts` で `as unknown as NoteId/TagId` の薄いキャストを使用。JSDoc に branded 型の意図を追記
- **[W-D2] limit セマンティクステスト**: 2 ケース追加（`searchInternalLinkTargets.integration.test.ts`）
  - 「note 5 件 + tag 2 件で limit=4 → 結果は全 note」
  - 「ADR-008 で全 note 除外 → tag が limit を埋めない（3 件のみ返る）」
- **[W-D3] port JSDoc 補強**: `searchByTitlePrefix` の JSDoc に「adapter は unfiltered で返す、フィルタは usecase 責務」を明文化

### Adapter (D1) 反映
- **[W-A1] searchIndex.ts の `escapeLikePattern` 重複削除**: `helpers.escapeLikePattern` を import に置換。ロジック単一の真実の源を担保
- **[W-A2] ASCII 外 case-folding**: `.issue/36/progress.md` R-3 に open risk として記録
- **[W-A3] findByOwner 既存挙動の網羅的回帰**: 別 PR スコープ。R-4 に記録

### Frontend (Editor) 反映
- **[W-F1] `"use client"` 追加**: `internalLinkExtension.ts` 先頭に `"use client"` プラグマ追加。サーバーバンドル漏洩リスク回避
- **[W-F2] useMemo コメント修正**: 「extensions 配列の再生成回避」から「クロージャ古参照回避」に書き直し。`useEditor` の実挙動と整合
- **[W-F3] silent cast コメント**: 既存コメントが意図を十分説明していたため追加変更なし（受容）
- **[W-F4/W-F5] allowSpaces / allowedPrefixes UX**: progress.md R-1/R-2 に open risk として記録（別 Issue で UX 判断）

### Test 反映
- **[W-T4] `]` 単独タイトル**: ADR-008 テストに `foo]bar` ケース追加
- **[W-T5] note 優先順序保証**: D-W-002 と同根、上記 2 シナリオで担保
- **[W-T6] tag isolates owners の ownerId 直接 assert**: 1 行追記
- **[W-T1/T2/T3/T7]**: progress.md に記録（優先度低 or 別 PR スコープ）

---

## 検証結果

- **`pnpm typecheck`**: ✅ pass
- **`pnpm test:unit`**: ✅ 88 files / 1388 tests pass
- **`pnpm test:integration`**: ✅ 30 files / 325 tests pass (+4 todo)
- **`pnpm lint:fix`**: ✅ 1 file fixed (import 統合), 3 pre-existing warnings (issue-36 範囲外)
- **`pnpm format`**: ✅ no changes

### 追加した integration テストの内容（参考）
- `does not let tags backfill the cap when notes already fill it` — ADR-005 の順序保証
- `does not backfill ADR-008-excluded note slots from the tag pool` — ADR-008 フィルタ後のセマンティクス

---

## Summary

- Blockers: 0
- Warnings: 0（取り込んだもの = 9 件、open risk として記録 = 9 件）
- Verdict: **APPROVED**

Round 2 で新たな Blocker / Warning は検出されていない。Round 1 で挙がった Warning 18 件のうち、本 PR で即時修正可能なものは全て反映。残りは progress.md に体系的に記録され、後続 PR / Issue で追跡可能な形にした。

### Round 2 final-reviewer の確認

Round 2 で 1 名の final reviewer が全レイヤを横断レビューし、W-D1/D2/D3/A1/F1/F2/T4/T6 の全 8 件について実装が意図通りであることを確認。typecheck / test:unit (1388) / test:integration (325) すべて pass。新規 Blocker / Warning なし。Open risk R-1〜R-5 の deferral 判断も妥当と承認。

---

## Design Decisions

新しい ADR は追加なし（既存 ADR-001..008 の範囲で全て解決）。
