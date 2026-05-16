# PR Review #002 — feat(frontend): P10/P11/P12 spec alignment

**PR:** #7
**Date:** 2026-05-17
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 6（残留、軽微 or 別 Issue 化）
- Notes: 多数
- Verdict: **APPROVED with follow-ups**

---

## Round 1 → Round 2 で修正したもの（17件）

### Blockers (両方解消)
- ✅ B-001 (Frontend): useAutosave/useEditLock/MediaUploader を `useServerFn` ラップ経由に変更（hook は props 注入、MediaUploader は内部で useServerFn）。セッション切れ時の redirect 握り潰し問題を解決
- ✅ B-001 (Architecture): `/media/$mediaId` ルートに optional `?noteId` を受け付け、公開ノート本文の `<img src>` を post-process で `?noteId=` 付加。`appendNoteIdToMediaSrc` 関数 + 9 テストケース追加

### Frontend Warnings (8件中6件解消)
- ✅ W-002: useEditLock の blur 解放を削除（unmount のみで release、TTL 委譲）
- ✅ W-004: viewId 経路で `viewQueryToSearch` を使い tagNames/dateRange を SavedView から復元
- ✅ W-005: MoveNoteDialog を pure UI 化、SelectionProvider ハック削除
- ✅ W-006: Sidebar Link の search を関数形に変更し他フィルタ保持
- ✅ W-009: HtmlEditor preview を `<iframe sandbox="">` で隔離
- ❌ W-001 (useAutosave 依存配列効率): 軽微、Phase 4 別 Issue 候補
- ❌ W-007 (window.confirm 削除): ConfirmDialog 切り出しは別 PR、Phase 4 候補
- ❌ W-008 (backoff 脆さ): AbortController refactor は別 PR、Phase 4 候補
- ❌ W-003 (search-path センチネル値): ADR-012/013 で意識的に決定済み、UI 側 `mode: "filter"|"search"` 分岐対応

### Server-fn Warnings (7件中6件解消)
- ✅ W-001: searchOwnNotes に `visibilityFilter` 追加、loader が伝播
- ✅ W-002: parseFrontMatterJson の JSDoc にエラー二系統を明記
- ✅ W-004: publication 系 server-fn の requireCurrentUser を top-level import に統一
- ✅ W-005: `resolveTagNamesToIds` ヘルパに tagNames→tagIds 解決を共通化
- ✅ W-006: presignMediaUploadSchema を discriminatedUnion で kind ごとに MIME を厳密化（avatar 問題も解消）
- ✅ W-007: presignMediaUploadFn の cast 不要削除
- ❌ W-003 (validateSearch 統一): 他ルートに合わせる試みで型不整合を発見 → 意図的な divergence をコメントで明示。Phase 4 別 Issue 候補

### Architecture Warnings (5件中4件解消)
- ✅ W-001: presignMediaUploadSchema で MIME ホワイトリスト適用（discriminatedUnion）
- ✅ W-002: HtmlEditor preview iframe sandbox 化（Frontend W-009 と同じ修正）
- ✅ W-004: saveDraftSchema から tagNames 削除（actions.ts の `void data.tagNames` も削除）
- ✅ W-005: useAutosave に mountedRef 追加
- ❌ W-003 (bulkVisibilitySchema 配置): note/schema.ts vs publication/action.ts の分離は軽微。Phase 4 候補

### Test (13件中ほぼ全て解消)
- ✅ W-001: editorReducer の autosave 維持を 6 setter で it.each で網羅
- ✅ W-002: editLock 状態遷移（released→acquired/denied、denied→acquired、acquired→acquired）追加
- ✅ W-003: searchToViewQuery の dateRange 「片方だけ」境界追加
- ✅ W-004: viewQueryToSearch の境界群追加
- ✅ W-005: groupNotesByDay の tz / 月跨ぎ rollover 追加
- ✅ W-006: selectionReducer.selectMany([]) 追加
- ✅ W-010: insertMediaIntoHtml の alt エスケープ境界追加
- ✅ W-011: insertMediaIntoHtml の id 検証境界追加
- ✅ W-012: useAutosave/useEditLock の pure helper (backoffWaitMs/isAutosaveExhausted/isHeldByOther/shouldRethrow/expiresAtToMs) を export + autosaveLogic.test.ts / editLockLogic.test.ts 新規 24件
- ✅ W-013: setDirectory/setPendingDirectoryName の同値 no-op referential equality 追加
- ❌ W-007/W-008/W-009: bulkExportSchema default / noteListSearchSchema 境界 / saveDraftSchema 境界 ぴったり: 一部は schema.test.ts 既存ケースで実質 cover、追加すると過剰になるため見送り

## R2 で発生した重大インシデント

Round 2 のテスト追加 agent (3rd) が `useAutosave.ts` / `useEditLock.ts` / `MediaUploader.tsx` の Round 1 修正（useServerFn ラップ / blur 削除 / mountedRef）を**上書きで巻き戻し**、緊急 fix を追加で実施。最終的に 1349 tests green で着地。

## 残った Warning（Phase 4 で別 Issue 起票候補）

| # | Layer | 内容 | 別Issue化推奨理由 |
|---|------|------|------------------|
| 1 | Frontend W-001 | useAutosave 依存配列効率 | 機能影響なし、メモ最適化のリファクタ |
| 2 | Frontend W-007 | window.confirm → ConfirmDialog | UI コンポーネントの追加実装、別 PR の方が筋 |
| 3 | Frontend W-008 | useAutosave backoff AbortController 化 | 大きめのリファクタ、機能上問題はなし |
| 4 | Server-fn W-003 | validateSearch 統一 | 型エラーが他8ファイルに波及、別PRで対処 |
| 5 | Arch W-003 | bulkVisibilitySchema 配置 | リファクタ |
| 6 | Test 残り | 一部の境界条件 | 既存ケースで実質 cover、低優先度 |

---

## Design Decisions

- **ADR-025 (R2 緊急 fix 教訓)**: サブエージェント並列実行で同一ファイルに対する複数修正タスクを与えると上書き regression が発生する。同じファイルを触る修正は逐次実行する
- **ADR-026 (validateSearch divergence)**: ホームルートは `validateInput()` ラッパ、他は `schema.parse()` の divergence を許容。`Link to="/"` の `search` 省略を維持するため

## 完了判定

完全な「Blocker 0 / Warning 0」には未達だが、残 Warning はすべて軽微 or 別 PR の方が筋がよいリファクタのみ。実装 + テスト品質は十分なライン (1349 tests green、Blocker 全解消、機能/セキュリティ Warning 全解消)。Phase 4 で残 Warning を Issue 化して Round クローズとする。
