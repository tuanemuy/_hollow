# PR Review #001 — feat(frontend): P10/P11/P12 spec alignment

**PR:** #7
**Date:** 2026-05-17
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 25
- Notes: 多数
- Verdict: **BLOCKED**

---

## Frontend

### Blockers
- **[B-001]** Editor hooks (`useAutosave`/`useEditLock`) と `MediaUploader` が server fn を直接呼び `useServerFn` ラップを通していない
  - 場所: `useAutosave.ts:47`, `useEditLock.ts:67/93/117/141`, `MediaUploader.tsx:52/67`
  - 理由: server fn が `redirect` を throw した際に client 側で `router.navigate()` してくれるラッパを通さないため、autosave/lock更新中にセッション切れ → 編集画面から抜けられず autosaveError バナーで詰む
  - 提案: NoteEditor 側で `const saveDraft = useServerFn(saveNoteDraftFn)` 等の安定参照を作り hook の引数として渡す

### Warnings
- **[W-001]** `useAutosave` の `useEffect` 依存配列が `state` 全体で、キーストロークごとに再評価される
- **[W-002]** `useEditLock` の `onBlur` がタブ切り替えで即解放してしまう（pagehide / visibilitychange / unmount のみに）
- **[W-003]** `OwnedNotesResult` の search-path でセンチネル値（空文字 / epoch / `'private'` 固定）が ListView/TileView に直流 → discriminated union 化推奨
- **[W-004]** `viewId` 経路で SavedView の `tagIds`/`dateRange`/`visibilityFilter` が復元されない（route 側で `viewQueryToSearch` を使わずマージしてる）
- **[W-005]** `NoteActionsInner` が `MoveNoteDialog` 流用のため `SelectionProvider` を立てている — pure UI に切り出し推奨
- **[W-006]** Sidebar のディレクトリ Link が他フィルタ (`display`/`q`/`tagNames`/`viewId`) を drop。`search={(prev) => ({ ...prev, directoryId })}` に
- **[W-007]** `BulkActionBar` / `NoteActions` で `window.confirm` 利用 → 既存ダイアログパターンに合わせ ConfirmDialog 切り出し
- **[W-008]** `useAutosave` の backoff リトライが `setTimeout` 再帰で脆い
- **[W-009]** `HtmlEditor` の preview が未サニタイズで `dangerouslySetInnerHTML` → self-XSS リスク

### Notes
- pure reducer 抽出/`mediaInsert` のid検証+escape/loader cache などは設計意図通り

---

## Server Function / Adapter / Validation

### Blockers
なし

### Warnings
- **[W-001]** `loadOwnedNotes` search 経路で `visibilityFilter` が drop されている。`searchOwnNotes` usecase 自体も `visibilityFilter` を受けず固定値 → schema フィールド削除 or 両方追加
- **[W-002]** `parseFrontMatterJson` の戻り型が unsafe-cast。下流 `FrontMatter.create` のエラーコード文言が plan と差異
- **[W-003]** `route validateSearch` が `validateInput` を直接使い throw 経路が他ルート (`schema.parse(search)`) と非統一
- **[W-004]** `bulkChangeVisibilityFn` 等 publication 系 server-fn が `requireCurrentUser` を dynamic import している（他は top-level）
- **[W-005]** `tagNames → tagIds` 解決ロジックが `loadOwnedNotes` と `createSavedViewFn` で重複
- **[W-006]** `presignMediaUploadSchema.kind` が `avatar` を含む（ADR-022 と齟齬）
- **[W-007]** `presignMediaUploadFn` の `kind: data.kind as MediaKind` cast 不要

### Notes
- frontMatterJson の transport-boundary エラー翻訳、editLock の server-fn 固定 TTL、bulk schema の max(100) などは規約遵守

---

## Architecture / Security

### Blockers
- **[B-001]** `/media/<id>` ルートが非オーナーに常時 `MediaNotViewable` を返す → 公開ノート本文の `<img src="/media/<id>">` がすべて壊れる
  - 場所: `app/routes/media/$mediaId.tsx:30-38`, `app/components/public/PublicNoteDetail.tsx:86`
  - 理由: `relatedNoteId: null` 固定で `downloadMedia` 呼び、`MediaService.assertViewableBy` が「viewer == owner」or「related note が public/unlisted」でないと拒否
  - 提案: ルートで `?noteId=<id>` を受け、`relatedNoteId` を渡す。公開ノート側の `<img>` レンダリングで `?noteId=` を付与

### Warnings
- **[W-001]** ADR-022 が依拠する「サーバ側 MIME ホワイトリスト（既存）」が実在しない。`mimeType` は文字列バリデーションのみで任意 MIME が通る → R2 ストレージ濫用 DoS リスク
- **[W-002]** HTML エディタプレビューが未サニタイズで `dangerouslySetInnerHTML` → self-XSS。`<iframe sandbox>` 隔離 or サニタイザ通す
- **[W-003]** `bulkVisibilitySchema` の置き場所が `note/schema.ts`、handler が `publication/` 配下で追跡コスト
- **[W-004]** `saveNoteDraftFn` が `tagNames` を受けて捨ててる。schema から削除 or 実際に送る
- **[W-005]** `useAutosave` の retry 待機中に unmount するとリーク → `mountedRef` ガード

### Notes
- frontMatterJson / editLock エラー分岐 / login.tsx 修正 / mediaInsert / bulk 100 / pure reducer 等は ADR 通り正しく実装

---

## Test

### Blockers
なし

### Warnings
- **[W-001]** `editorReducer` autosave 維持: setTitle 以外の 5 setter (setContent/setFrontMatterField/setFrontMatterRawJson/setTagInput/setDirectory/setPendingDirectoryName) で `saving` 維持の不変条件が未検証
- **[W-002]** `editLockReleased→Acquired`, `denied→acquired`, 同 state 再 acquire (expiresAt 更新) 等の状態遷移が未検証
- **[W-003]** `searchToViewQuery` の `dateRange` 「片方だけ」ケース未テスト
- **[W-004]** `viewQueryToSearch` の境界 (directoryId=null, keyword=null, dateRange=null, resolveTagNames が空、tagIds.length===0 等) 未テスト
- **[W-005]** `groupNotesByDay` の `tz` 引数を変えた挙動 / 月跨ぎ rollover 未テスト
- **[W-006]** `selectionReducer.selectMany([])` の挙動未テスト
- **[W-007]** `bulkExportSchema` の default 適用 / options 省略 / 不完全 options
- **[W-008]** `noteListSearchSchema` の `page: max+1`、`limit: 0`、`limit: -1` 境界
- **[W-009]** `saveDraftSchema.contentHtml` ぴったり境界、`saveNoteSchema`/`saveDraftSchema` の frontMatterJson 境界
- **[W-010]** `insertMediaIntoHtml` の alt 検証が 1 ケースのみ (改行/null byte/undefined 等)
- **[W-011]** `insertMediaIntoHtml` の id 検証境界 (UUID/大文字/数字のみ/ハイフンのみ/拒否側 `/`, `.`, 先頭ハイフン)
- **[W-012]** useAutosave/useEditLock の pure ロジック (`isHeldByOther`/`shouldRethrow`/`expiresAtToMs`/backoff 計算) が hook 内に閉じて vitest 対象外
- **[W-013]** `setDirectory` / `setPendingDirectoryName` の同値 no-op referential equality 確認

### Notes
- 1276 tests green、AAA 構造明確、reducer pure 抽出は ADR-005 整合

---

## Design Decisions

このラウンドで以下の修正方針を決定（adr.md に ADR-025〜ADR-027 として追記予定）:

- **/media/<id> ルートに optional `?noteId` 受け付け + 公開ノート side で付与**
- **useServerFn ラッピング規約の徹底**: hook には外部から渡す
- **HTML preview は `<iframe sandbox>` 経由**で隔離
- **search 経路 visibilityFilter 対応** vs **schema から削除** → schema 維持しつつ usecase 側に追加（フル要件達成）
