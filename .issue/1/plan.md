# 実装計画 — Issue #1: [spec-sync] frontend: P10/P11/P12 のノート関連画面が MVP 最小実装にとどまっている

**Issue:** #1
**作成日:** 2026-05-16
**複雑度:** 中〜大規模

---

## 目的

`spec/pages/index.md` で定義された P10（ホーム/ノート一覧）/ P11（ノート詳細）/ P12（ノートエディタ）の MVP 最小実装と spec の乖離を、**バックエンドにすでに揃っている usecase をフロントエンドで露出させる**ことで解消する。バックエンド未対応の機能や、UI 単独で実装すると形骸化する機能（履歴・本格 WYSIWYG・公開状態フィルタなど）はスコープ外として明示し、Phase 4 で別 Issue として起票する。

## スコープ

### 含まれるもの

**P10 ホーム/ノート一覧**
- 表示形式切替（リスト / タイル / カレンダー）— URL 駆動
- フィルタバー（タグ / 期間）
- 公開状態フィルタ（`q` 有時の `searchOwnNotes` 経路のみ。`SearchQuery.visibilityFilter` を活用）
- ノート複数選択 + 一括操作（移動 / ゴミ箱 / 公開設定変更 / **エクスポート**）
- 「現在のフィルタ + 表示形式をビューとして保存」+ **`viewId` 指定時の復元**
- ディレクトリツリー（Sidebar）からのフィルタ連動
- ヘッダー検索（`?q=...`）→ `searchOwnNotes` 切替表示（既存 Header.tsx の `<form action="/" method="get">` で対応済み、コード改修不要）

**P11 ノート詳細**
- メタ情報パネル拡張（作成/更新日 / タグ / ディレクトリパス / 公開状態 / バックリンク / FrontMatter）
- 操作メニュー拡張（編集 / 公開設定リンク / 移動 / URL コピー / 複製 / エクスポートリンク / 削除）
- 公開時の URL プレビュー（`listShareLinks` 経由）
- FrontMatter 表示パネル

**P12 ノートエディタ**
- HTML モード + サニタイズ済みプレビュー併設（既存延長 + プレビュー追加）
- ディレクトリ選択（既存ツリーから select / 新規名入力で `createDirectoryFn` 自動作成）
- FrontMatter 編集（既知キー: title/date/tags/description/slug の構造編集 + 生 JSON モード切替）
- メディアアップロード（presigned URL → R2 直 PUT → finalize → HTML へ挿入）
- 自動保存（`saveNoteDraft` ベース、debounce 1.5s、ステータス表示）
- 編集ロック取得（`acquireEditLock` / `extendEditLock` / `releaseEditLock`、衝突時は警告バナーのみ・編集可能）

### 含まれないもの（Phase 4 で別 Issue 起票）

| # | 項目 | 理由 |
|---|------|------|
| 1 | P10 公開状態フィルタ（`q` 空時の `listNotesByOwner` 経路） | `NoteOwnerListOpts` に visibility 引数なし。かつ `NoteListItemDTO.visibility` が現状 `'private'` 固定。バックエンド projection 拡張が必要。`q` 有時の検索経路のみ部分実装 |
| 2 | P10 「内部リンク参照」フィルタ | `listNotesByOwner` に `referencingNoteId` 引数なし。usecase + repository 拡張が必要 |
| 3 | P10 検索結果の「0件時の推奨検索語 / 近いタグ提案」「キーワードハイライト」 | search usecase に suggestion / snippet 機能が未実装 |
| 4 | P11 履歴 | spec 自体で「※将来」明記、ドメイン側に revision aggregate なし |
| 5 | P12 本格 WYSIWYG（TipTap / Lexical 等） | 新規ライブラリ導入は Cloudflare Workers バンドルサイズ・spec-sync 原則に直撃。本 PR では「HTML モード + サニタイズプレビュー」で代替し、WYSIWYG タブは disabled 表示で将来枠を確保 |
| 6 | P12 リアルタイム衝突通知（プレゼンス／WebSocket） | インフラ未整備。本 PR は「ロード時警告 + TTL ベスト・エフォート」まで |
| 7 | P12 内部リンク補完（タグ・ノート横断 suggest） | suggest API 未実装 |
| 8 | P12 生 YAML 編集（YAML パーサ） | `yaml`/`js-yaml` 依存追加を回避。MVP は「生 JSON」入力 |

## 実装ステップ

### Phase A: 共通基盤

#### A-1. 定数とスキーマ拡張

- **対象ファイル:**
  - `app/components/note/constants.ts`（新規）
  - `app/components/note/schema.ts`（拡張）
  - `app/components/view/schema.ts`（拡張）
  - `app/components/media/schema.ts`（新規）
- **変更内容:**
  - `constants.ts` にマジック値集約: `DISPLAY_MODES = ['list','tile','calendar'] as const`, `NOTE_LIST_LIMIT_DEFAULT = 20`, `BULK_NOTE_IDS_MAX = 100`, `AUTOSAVE_DEBOUNCE_MS = 1500`, `EDIT_LOCK_TTL_SEC = 60`, `EDIT_LOCK_RENEW_INTERVAL_MS = 30_000`, `EXPORT_BULK_LIMIT = 100`
  - `note/schema.ts` に追加:
    - `noteListSearchSchema` — **全フィールド `.optional().catch(undefined)`** または `.default()` 付き（Sidebar の `Link search={{ directoryId }}` で他フィールド欠落時に parse 失敗しないため）。`display: z.enum(DISPLAY_MODES).optional().catch(undefined)`, `tagNames: z.array(z.string()).optional().catch(undefined)`, `from`/`to`: `z.string().date().optional().catch(undefined)`, `directoryId`/`q`/`viewId`/`visibility`: optional 文字列, `page`/`limit`: optional number with defaults
    - `bulkMoveSchema`, `bulkTrashSchema`, `bulkVisibilitySchema`: いずれも `noteIds: z.array(z.string().min(1)).min(1).max(BULK_NOTE_IDS_MAX)`（Workers CPU 超過対策）
    - `bulkExportSchema`: `noteIds: z.array(z.string().min(1)).min(1).max(EXPORT_BULK_LIMIT)`, `format: z.enum(...)`
    - `saveDraftSchema`: `noteId`, `title`, `contentHtml`, `frontMatterJson: z.string().optional()`（ADR-008: 生 JSON 文字列で送信して handler で `JSON.parse` + `FrontMatter.create`）, `tags`
    - `acquireLockSchema`/`extendLockSchema`/`releaseLockSchema`: `noteId` のみ。`ttlSec` は **server-fn 側で `EDIT_LOCK_TTL_SEC` 固定**（クライアント任意性を排除、`MAX_EDIT_LOCK_TTL_SECONDS=1800` 超過事故防止）
    - 既存 `createNoteSchema`/`saveNoteSchema` に `frontMatterJson: z.string().optional()` を追加（同じく JSON 文字列ラップ）、`directoryId: z.string().nullable().optional()` を追加。handler 内で `JSON.parse` → `FrontMatter.create` → `data.frontMatter ?? {}` 固定箇所を置換
  - `view/schema.ts` に `createSavedViewSchema`（`name`, `query: { tagNames?, directoryId?, dateRange?, keyword?, visibilityFilter? }`, `displayMode`, `sort?`, `order?`）。**tag は名前ベース**（URL と整合）、handler 内で `listTags` から ID 解決して `createSavedView` usecase に渡す
  - `media/schema.ts`（新規）に `presignMediaUploadSchema`（`kind`, `mimeType`, `byteSize`）, `finalizeMediaSchema`（`mediaId`）
- **理由:** transport boundary でのバリデーションを Zod に集約（CLAUDE.md の「validate at boundaries」原則）。マジック値の散在を防ぐ。bulk 上限で Workers CPU 制約をスキーマ段階で担保。`frontMatter` 型問題は JSON 文字列ラップで根本回避（ADR-008）。

#### A-2. server fn 拡張

- **対象ファイル:**
  - `app/components/note/actions.ts`（拡張）
  - `app/components/view/actions.ts`（新規 — `createSavedViewFn`）
  - `app/components/publication/PublishSettings/action.ts`（拡張 — `bulkChangeVisibilityFn`）
  - `app/components/media/actions.ts`（新規 — `presignMediaUploadFn`, `finalizeMediaUploadFn`）
  - `app/components/media/index.ts`（新規）
- **変更内容:** 各 server fn は既存パターン（`createServerFn().middleware([errorResponseMiddleware]).inputValidator(validateInput(schema)).handler(...)`）に従い、`loadServerDeps` で DI、`requireCurrentUser` で actor 解決。
  - 追加 fn:
    - `bulkMoveNotesFn` → `bulkMoveNotes` usecase
    - `bulkTrashNotesFn` → `bulkTrashNotes` usecase
    - `bulkChangeVisibilityFn` → `bulkChangePublicationVisibility` usecase
    - `bulkExportNotesFn` → `enqueueExportJob({ scope: "multiple", noteIds, format })`（バックエンドは既対応、JSDoc に「Bulk / view-scope export request」明記）
    - `saveNoteDraftFn` → `saveNoteDraft` usecase（handler 内で `frontMatterJson` を `JSON.parse` → `FrontMatter.create`、失敗時は `BusinessRuleError` で返す）
    - `acquireEditLockFn`, `extendEditLockFn`, `releaseEditLockFn`: いずれも handler 内で `EDIT_LOCK_TTL_SEC` 固定で渡す
    - `createSavedViewFn` → handler 内で `tagNames` → `listTags` 経由で `tagIds` 解決 → `view/createSavedView` usecase
    - `presignMediaUploadFn` → `media/uploadMediaPresigned` usecase（戻り値: `mediaId`, `uploadUrl`, `expectedDownloadUrl`）
    - `finalizeMediaUploadFn` → `media/finalizeUpload` usecase
  - 戻り値は scalar のみ（id/string）。`frontMatter` などの recursive object は送信専用（JSON 文字列ラップ）、表示は `router.invalidate()` で RSC 再フェッチに任せる。
  - 既存 `createNoteFn`/`saveNoteFn` も同じ JSON 文字列ラップに揃えて handler を改修
- **理由:** バックエンドはすべて既存 usecase。フロント露出のみで完結。`enqueueExportJob` の `scope: "multiple"` は既存実装で対応済み（一括エクスポートをスコープ内に格上げ）。

#### A-2b. `/media/$mediaId` ルート追加（**クリティカル**）

- **対象ファイル:** `app/routes/media/$mediaId.tsx`（新規）
- **変更内容:** `downloadMedia` usecase を呼んで `presignDownload` で得た URL に 302 リダイレクトする最小ルート。`createServerFn().middleware([errorResponseMiddleware]).handler(...)` で `requireCurrentUser` で actor 解決 → `downloadMedia({ container, actor, mediaId })` → `throw redirect({ href: presignedUrl, statusCode: 302 })`。
- **理由:** `MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i` パターン（`app/core/domain/note/service.ts:51`）に合わせるため、`<img src>` を `/media/<id>` 形式に統一する必要がある。R2 直 URL を src にすると `assembleFromInputs` が `mediaIds` を抽出できず、`MediaService.reconcileRefs` の refCount が増えず、`PurgeOrphans` でサイレント削除される（ADR-009 参照）。

#### A-3. loader 拡張

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  - 既存 `loadOwnedNotes` を拡張: `{ tagNames?, dateRange?, directoryId?, q?, visibility? }` を受ける（タグは名前ベース、handler 内で `listTags` 経由 ID 解決）
    - `q` 非空 → `searchOwnNotes(SearchQuery.create({ keyword: q, tagNames, directoryId, dateRange: normalize(dateRange), visibilityFilter: visibility ? [visibility] : undefined }))`。`SearchOwnNotesInput.dateRange` は両端必須 `{ from, to }` のため、片方欠落時は欠けている側を `new Date(0)` または `new Date()` で補完する `normalize` 関数を loader 内に定義
    - `q` 空 → `listNotesByOwner({ tagIds, dateRange: { from: from ?? null, to: to ?? null }, ... })`
  - 追加: `loadDirectoryTreeFlat`（ツリーをフラット化、`<select>` 用）, `loadAllTags`（タグ名→ID 辞書）, `loadSavedViewsByKind`, `loadSavedViewById`（**viewId 指定時の復元用**、`view/getSavedView` 想定。既存に無ければ `validateSavedView` 系から派生）, `loadPublishStateForNote`（P11 用、`listShareLinks` 経由）
- **理由:** loader を `cache(serverData(...))` でディデュープ、RSC 内で並列 await。`viewId` 復元は SavedView ロード → `ViewQueryDTO` → search への展開を loader 内で吸収する。

#### A-3b. `renderHome` で全 loader を Promise.all してから HomePage に props

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** `renderHome` server-fn 内で `loadOwnedNotes` / `loadDirectoryTreeFlat` / `loadAllTags` / `loadSavedViewsByKind` を `Promise.all` で並列実行し、`HomePage` に props で渡す。子コンポーネント（Sidebar / NoteList）が個別に loader を呼ぶ構造をやめる（dedupe が tree 跨ぎで効かない問題への対応）。
- **理由:** `cache(serverData(...))` の dedupe は同一 React tree 内のみ。renderHome で全部解決した方が確実に1回だけ叩ける。

#### A-4. ルート（RSC manifest）登録

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** 「Pull server-fn provider modules」セクションに `@/components/view/actions`, `@/components/media/actions` の import を追加。
- **理由:** RSC が server-fn を識別できるようにする既存規約。

---

### Phase B: P10 ホーム/ノート一覧

#### B-1. ディレクトリ構造再編

- **新規ディレクトリ:** `app/components/note/list/`
- **配置:**
  - `NoteList.tsx`（server async — 表示モード分岐 + データ取得 wrapper）
  - `NoteListToolbar.tsx`（client — フィルタ・選択・一括操作の制御点）
  - `FilterBar.tsx`（client — タグ chip toggle / 日付レンジ）
  - `DisplayModeSwitch.tsx`（client — list/tile/calendar 切替）
  - `ListView.tsx` / `TileView.tsx` / `CalendarView.tsx`（pure — 表示専用）
  - `BulkActionBar.tsx`（client — 選択中アイテム数 + 一括 CTA）
  - `MoveNoteDialog.tsx`（client — 一括移動 / 単体移動共用、`<dialog>` ベース）
  - `BulkVisibilityDialog.tsx`（client — ラジオ + 一括公開設定）
  - `SaveViewDialog.tsx`（client — name 入力モーダル）
  - `SelectionContext.tsx`（client — useReducer で選択集合）
  - `listSelectors.ts`（pure — 選択 reducer / `groupNotesByDay` / `searchToViewQuery`）
- **理由:** pure と side-effect の分離、reducer の純粋関数化でテスト容易性確保。既存 `app/components/note/{NoteList,HomePage}.tsx` の責務を切り出し。

#### B-2. ルート `validateSearch` 追加

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** `validateSearch: zodValidator(noteListSearchSchema)` を追加し、`loaderDeps: ({ search }) => search` で loader に流す。`renderHome` server-fn に search を渡し、`HomePage` の Props に統合。
- **理由:** URL 駆動状態（ブックマーク／リロード／戻る進む復元可能）。クライアント state を最小化。

#### B-3. 表示形式切替（list/tile/calendar）

- **対象ファイル:** B-1 で作成した `ListView.tsx`, `TileView.tsx`, `CalendarView.tsx`, `DisplayModeSwitch.tsx`
- **変更内容:**
  - `ListView`: 既存表示を移植、`isSelected` / `onToggleSelect` を props で受ける
  - `TileView`: `note-grid` クラスで thumbnail + タイトル + excerpt のカード表示（`thumbnailUrl` 無時はプレースホルダ）
  - `CalendarView`: 月グリッド。`groupNotesByDay(notes, tz)` で日付別グループ化（pure 関数）。**`CalendarView` は client component（`"use client"`）** にする — `Intl.DateTimeFormat().resolvedOptions().timeZone` を呼ぶため。サーバ側で表示する必要が出たら `tz` 引数を `"Asia/Tokyo"` などで明示的に渡す（Workers 環境では `Intl.DateTimeFormat` の `resolvedOptions().timeZone` が `'UTC'` 固定のため）。
  - `DisplayModeSwitch`: 3 ボタン pure 表示、`onChange` で `router.navigate({ search: (s) => ({ ...s, display: mode }) })`
- **理由:** spec の3表示モード要件。pure コンポーネントで網羅テスト可能。

#### B-4. フィルタバー

- **対象ファイル:** `FilterBar.tsx`
- **変更内容:** タグ chip 多選（`loadAllTags` から取得した候補、URL に `tagNames=` で乗せる — URL 短縮のため名前ベース）。日付レンジ（`<input type="date">` × 2）。`<form>` 送信で `router.navigate({ search })`。
- **理由:** ネイティブ HTML + ナビゲーションだけで完結。新規依存ゼロ。

#### B-5. ヘッダー検索連動

- **対象ファイル:** `app/components/note/loaders.ts`（`loadOwnedNotes` 内分岐）, `NoteList.tsx`
- **変更内容:** `q` 非空時は `searchOwnNotes(SearchQuery.create({ keyword: q, tagNames, directoryId, dateRange }))` を呼ぶ。`SearchQuery.create('')` が許容されない場合は `q` 有のみ search 切替。
- **理由:** spec の「ヘッダー検索ボックスからの遷移先を兼ねる」要件。既存 `searchOwnNotes` usecase の活用。

#### B-6. 複数選択 + 一括操作

- **対象ファイル:** `SelectionContext.tsx`, `listSelectors.ts`, `BulkActionBar.tsx`, 各 `*View.tsx`, `MoveNoteDialog.tsx`, `BulkVisibilityDialog.tsx`, `BulkExportDialog.tsx`
- **変更内容:**
  - `useReducer` で `selectedIds: ReadonlySet<NoteId>` 管理、actions: `toggle`/`selectAll`/`clear`/`selectMany`
  - reducer 関数 (`selectionReducer`) は `listSelectors.ts` に pure として export（vitest 対象）
  - `BulkActionBar`: 件数表示 + 「移動」「ゴミ箱」「公開設定」「**エクスポート**」CTA
  - 移動: `MoveNoteDialog`（ディレクトリツリー select）→ `bulkMoveNotesFn`
  - ゴミ箱: confirm → `bulkTrashNotesFn`、`failures[]` を inline 表示
  - 公開設定: `BulkVisibilityDialog`（visibility radio）→ `bulkChangeVisibilityFn`
  - **エクスポート: `BulkExportDialog`（format 選択 radio）→ `bulkExportNotesFn`**（`enqueueExportJob` の `scope: "multiple"` を活用、ジョブ起動後 P15 / P16 へ遷移）
- **理由:** 既存 bulk usecase の活用。Context + reducer で props drilling 回避。`enqueueExportJob` は `scope: "multiple"` + `noteIds` を既に受け付けるため、エクスポートをスコープ内に格上げ。

#### B-7. 「ビューとして保存」+ ビュー復元

- **対象ファイル:** `SaveViewDialog.tsx`, `listSelectors.ts` の `searchToViewQuery` / `viewQueryToSearch`, `app/components/view/actions.ts`, `loaders.ts`
- **変更内容:**
  - `searchToViewQuery(search)` — pure 関数で URL search を `ViewQueryDTO` + `displayMode` にマッピング（tagNames はそのまま渡し、handler で ID 解決）
  - `viewQueryToSearch(savedView)` — 逆方向 pure 関数。`viewId` 指定時の loader 内で SavedView を読んで URL search に展開
  - `SaveViewDialog` で name 入力 → `createSavedViewFn`（handler 内で `tagNames` → `tagIds` 解決して `view/createSavedView` 呼び出し）
  - **`viewId` 指定時の挙動**: `renderHome` server-fn 内で `viewId` 有時は `loadSavedViewById` を呼び、`viewQueryToSearch` で展開した search を `loadOwnedNotes` に渡す（URL の他フィールドは上書きしない、ベースとして使う）
  - 成功時 `router.navigate({ to: '/views' })` または toast
- **理由:** spec の「現在のフィルタ + 表示形式をビューとして保存」と暗黙の「復元」要件を両方カバー。`createSavedView` usecase は既存。tag は名前ベースで URL と SavedView の表現を揃え、ID 解決は handler に集約。

#### B-8. Sidebar フィルタ連動

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:** `DirectoryNode` の `Link to="/"` を `Link to="/" search={{ directoryId: node.id }}` に。
- **理由:** spec の「ディレクトリツリーからのフィルタ」要件。宣言的遷移のみ。

---

### Phase C: P11 ノート詳細

#### C-1. ディレクトリ構造再編

- **新規ディレクトリ:** `app/components/note/detail/`
- **配置:**
  - `NoteDetail.tsx`（server async — loader 統合 + view-model 生成）
  - `NoteMetaPanel.tsx`（pure — 作成/更新日 / タグ / ディレクトリパス / 公開状態 / バックリンク）
  - `FrontMatterPanel.tsx`（pure — 既知キー優先表示 + その他折りたたみ、再帰描画関数を pure export）
  - `NoteActions.tsx`（client — 操作メニュー）
  - `UrlCopyButton.tsx`（client — `navigator.clipboard.writeText` + aria-live）
- **理由:** 表示専用と side-effect の分離。

#### C-2. メタ情報パネル拡張

- **対象ファイル:** `NoteMetaPanel.tsx`, `FrontMatterPanel.tsx`, `NoteDetail.tsx`
- **変更内容:**
  - `NoteDetail` で `loadNoteDetail` + `loadPublishStateForNote` + `loadDirectoryTreeFlat` + `loadAllTags` を `Promise.all` で並列 await
  - tagId → name の辞書を `loadAllTags` から作って `NoteMetaPanel` に渡す
  - ディレクトリパスを tree から再構成
  - 公開状態 chip（visibility 値で `chip` クラス分岐）
  - バックリンク件数とリンク一覧（既存 `getBacklinks` 利用）
  - `FrontMatterPanel`: 既知キー（`title`, `date`, `tags`, `description`, `slug`）を優先表示、他は `<details>` で折り畳み
- **理由:** spec の「メタ情報パネル / FrontMatter パネル」要件。

#### C-3. 操作メニュー拡張

- **対象ファイル:** `NoteActions.tsx`, `UrlCopyButton.tsx`, `MoveNoteDialog.tsx`（B-6 と共用）
- **変更内容:**
  - 編集（既存 Link）
  - 公開設定（Link → `/notes/$noteId/publish`）
  - 移動（`MoveNoteDialog` を開く → `moveNoteFn` 既存）
  - URL コピー（`UrlCopyButton` — visibility が public/unlisted なら公開 URL、private なら内部 URL `location.origin + /notes/$noteId`）
  - 複製: 既存 `duplicateNoteFn` を呼び、**戻り値の `noteId` で `/notes/$noteId/edit` へ navigate**（spec L128「コピーして新規ノートとして開く」要件）。現状実装の遷移先を確認し、未対応なら追加
  - エクスポート（Link → `/notes/$noteId/export`）
  - 履歴: スコープ外。`title="履歴は今後実装予定です"` の disabled ボタンで将来枠を明示
  - 削除（既存）
- **理由:** spec の操作メニュー要件。既存ページへ Link で最大活用。

---

### Phase D: P12 ノートエディタ

#### D-1. ディレクトリ構造再編

- **新規ディレクトリ:** `app/components/note/editor/`
- **配置:**
  - `NoteEditor.tsx`（client — 最上位の状態オーケストレータ、`useReducer`）
  - `editorState.ts`（pure — reducer + 型 + 状態遷移関数）
  - `EditorModeSwitch.tsx`（pure — タブ UI、WYSIWYG は disabled）
  - `HtmlEditor.tsx`（client — textarea + サニタイズ済みプレビュー）
  - `FrontMatterEditor.tsx`（client — 既知キー UI + 生 JSON モード切替）
  - `DirectoryPicker.tsx`（client — tree select + 新規名入力）
  - `MediaUploader.tsx`（client — presigned URL → PUT → finalize → 挿入）
  - `AutosaveIndicator.tsx`（pure — saving/saved/error 表示）
  - `EditLockBanner.tsx`（pure — ロック状態警告）
  - `useAutosave.ts`（hook — debounce + 状態機械）
  - `useEditLock.ts`（hook — 取得/更新/解放）
  - `mediaInsert.ts`（pure — HTML 文字列への `<img>`/`<video>` 挿入）
- **理由:** 同上。状態管理を reducer に中央集権化。

#### D-2. 状態機械（editorState.ts）

```ts
type EditorMode = 'html' | 'frontMatter' | 'wysiwyg-disabled';
type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | { kind: 'error'; error: SerializedError };
type EditorState = Readonly<{
  mode: EditorMode;
  title: string;
  contentHtml: string;
  frontMatter: Record<string, unknown>;
  frontMatterRawJson: string;     // 生 JSON モード時の編集中テキスト
  frontMatterJsonError: string | null;
  directoryId: DirectoryId | null;
  pendingDirectoryName: string | null;  // 新規ディレクトリ名（保存時に createDirectoryFn）
  tagInput: string;
  mediaInsertions: ReadonlyArray<{ id: MediaAssetId; url: string }>;
  autosave: AutosaveStatus;
  dirtyKeys: ReadonlySet<'title' | 'content' | 'frontMatter' | 'tags' | 'directory'>;
  editLock: { state: 'acquired' | 'denied' | 'released' | 'unknown'; lockId: string | null; expiresAt: number | null };
}>;
```

reducer の actions:
- `setTitle` / `setContent` / `setFrontMatterField` / `setFrontMatterRawJson` / `toggleFrontMatterMode` / `setDirectory` / `setPendingDirectoryName`
- `setMode` (mode 切替時に dirty 警告は親で confirm)
- `autosaveStart` / `autosaveSuccess` / `autosaveError`
- `mediaInsertionAdded`
- `editLockAcquired` / `editLockDenied` / `editLockReleased`

- **理由:** 状態遷移を pure 関数化、vitest で全 action × state 網羅可能。

#### D-3. HTML モード + サニタイズプレビュー

- **対象ファイル:** `HtmlEditor.tsx`, `EditorModeSwitch.tsx`
- **変更内容:**
  - 既存 textarea + `<details>` で「プレビュー」を展開（`dangerouslySetInnerHTML` で表示、`saveNote` 内サニタイザは保存時のみ走るため「保存時にサニタイズされます」と注記）
  - `EditorModeSwitch` の3タブ: `html`（enabled）/ `frontMatter`（enabled）/ `wysiwyg`（disabled + tooltip「WYSIWYG モードは別 Issue で対応予定」）
- **理由:** spec の「サニタイズプレビュー」要件を新規ライブラリゼロで満たす。WYSIWYG 本格実装は別 Issue。

#### D-4. FrontMatter 編集

- **対象ファイル:** `FrontMatterEditor.tsx`
- **変更内容:**
  - **既知キー UI**: `title`, `date`, `tags`(string[])、`description`, `slug` を構造編集（input / textarea）。値変更は `setFrontMatterField` action
  - **生 JSON モード**: トグルで `<textarea>` 表示。`JSON.parse` 失敗時はインラインエラー、その間「保存」ボタン disabled（dirty 状態は保持）
  - 公開ステータス書換時のインライン警告（既知キーに `visibility` を含めるかは判断、`PublicationState` aggregate と FrontMatter は別境界なので**含めず**、警告は spec に従い「明示保存時に確認ダイアログ」で代替）
- **理由:** spec の「既知キー構造編集 / 生 YAML 編集モード切替 / schema 検証」を YAML パーサ追加なしで実現。

#### D-5. ディレクトリ選択

- **対象ファイル:** `DirectoryPicker.tsx`
- **変更内容:**
  - 既存ディレクトリツリーから select
  - 「新規ディレクトリ」入力欄: 名前入力時は state に `pendingDirectoryName` を保持、保存時にまず `createDirectoryFn` で作成 → 返ってきた id を `directoryId` に。
- **理由:** spec の「既存ツリーから選択 or 新規ディレクトリ名を入力すると自動作成」。

#### D-6. メディアアップロード

- **対象ファイル:** `MediaUploader.tsx`, `mediaInsert.ts`, A-2b で追加した `app/routes/media/$mediaId.tsx`
- **変更内容:**
  1. `<input type="file">` 選択 → `presignMediaUploadFn({ kind, mimeType, byteSize })` で `{ mediaId, uploadUrl }` 取得
  2. クライアント `fetch(uploadUrl, { method: 'PUT', body: file })`
  3. 成功時 `finalizeMediaUploadFn({ mediaId })`
  4. `insertMediaIntoHtml(contentHtml, { id })` で HTML に `<img src="/media/<id>" alt="">` 挿入（pure 関数、末尾追加）。**`data-media-ref` 属性は使わない**（`GLOBAL_ATTRS` ホワイトリストに無く sanitizer が剥がすため）。`<img src="/media/<id>...">` 形式により `MEDIA_ID_FROM_URL` で抽出 → `MediaService.reconcileRefs` で正しく refCount 更新される
  5. アップロード中プレースホルダ表示、失敗時はリトライボタン
- **理由:** 既存 media usecase の正攻法。R2 直アップロードで Worker CPU 節約。`/media/<id>` ルート経由でサニタイザの URL 正規化と整合（ADR-009）。
- **R2 CORS 注意:** PR 説明に「R2 バケット CORS 設定の確認手順」を追記。

#### D-7. 自動保存

- **対象ファイル:** `useAutosave.ts`, `editorState.ts`
- **変更内容:**
  - `dirtyKeys.size > 0` && `AUTOSAVE_DEBOUNCE_MS` 経過で `saveNoteDraftFn` を呼ぶ
  - 新規ノート（noteId 未確定）では autosave 無効
  - autosave 中の明示保存はキューイング（reducer 内で順序化）
  - 失敗時は exponential backoff（最大3回）→ それでも失敗で `error` 状態
- **理由:** `saveNoteDraft` は tag extraction / link resolution / media reconciliation をスキップする軽量パス。autosave 向き。

#### D-8. 編集ロック（ベストエフォート）

- **対象ファイル:** `useEditLock.ts`, `EditLockBanner.tsx`
- **変更内容:**
  - マウント時 `acquireEditLockFn({ noteId })`（TTL は server-fn 側で `EDIT_LOCK_TTL_SEC` 固定）
  - **エラー分岐**: `extractSerializedError(e)` で `kind`/`code` を見て分岐:
    - `business` + `code === 'edit_lock_held_by_other'` → `EditLockBanner` で警告（編集許可、`saveNote` の `requireLock: false` 維持）
    - `forbidden`（`NOTE_FORBIDDEN`）/ `not_found`（`NOTE_NOT_FOUND`）→ 親に再 throw して error boundary に任せる
    - その他 → ログ + 警告（編集は許可）
  - `setInterval(extendEditLockFn, EDIT_LOCK_RENEW_INTERVAL_MS)` で延長、同様に分岐
  - unmount / blur 時 `releaseEditLockFn`（タブクローズは TTL に任せる、`sendBeacon` は MVP では入れない）
- **理由:** spec の「編集ロック / 衝突警告」のうち「警告」までを担保。エラー分岐を実装初期から組み込み、Forbidden/NotFound のサイレント無視を防ぐ。リアルタイム衝突通知はインフラ未整備で別 Issue。

#### D-9. ルート差し替え

- **対象ファイル:** `app/routes/notes/new.tsx`, `app/routes/notes/$noteId/edit.tsx`
- **変更内容:**
  - `new.tsx`: 新 `NoteEditor` を `mode='new'` で呼び、loader で `loadDirectoryTreeFlat` + `loadAllTags` を並列取得
  - `edit.tsx`: 既存 `loadNoteDetail` に加え同じく並列取得、`note.editLock` を初期値に
- **理由:** ルートはオーケストレーション、UI 詳細は components へ。

#### D-10. 「milestone out of scope」コメント更新

- **対象ファイル:** `NoteEditor.tsx` 冒頭コメント
- **変更内容:** 現在の MVP コメントを書き換え、本 PR でカバーした範囲と、本格 WYSIWYG / 履歴 / リアルタイム衝突 / 内部リンク補完 / 生 YAML / 一括エクスポートが別 Issue であることを明示。
- **理由:** 次のメンテナが新しい乖離を検知しやすくする。

---

### Phase E: テスト

#### E-1. pure ロジックのユニットテスト

- **対象ファイル（新規）:**
  - `app/components/note/list/__tests__/listSelectors.test.ts`（選択 reducer / `groupNotesByDay` / `searchToViewQuery`）
  - `app/components/note/editor/__tests__/editorState.test.ts`（reducer 全 action × state）
  - `app/components/note/editor/__tests__/mediaInsert.test.ts`（HTML 挿入位置・XSS 安全性）
  - `app/components/note/__tests__/schema.test.ts`（zod 境界条件: tag 配列上限 / 日付パース / displayMode enum）
- **理由:** React Testing Library 未導入。pure ロジックを vitest で網羅。

#### E-2. typecheck / lint / format

- `pnpm typecheck && pnpm lint:fix && pnpm format` を緑にする。

---

## 設計判断

詳細は `adr.md` を参照。要点:

- **ADR-001**: 公開状態フィルタ・内部リンク参照フィルタはスコープ外（バックエンド projection 拡張が必要）
- **ADR-002**: 本格 WYSIWYG は新規ライブラリ導入を回避し別 Issue へ。本 PR は「HTML モード + サニタイズプレビュー」で代替し、WYSIWYG タブは disabled で将来枠を確保
- **ADR-003**: FrontMatter 編集は「既知キー構造 UI + 生 JSON」で対応。YAML パーサ追加は別 Issue
- **ADR-004**: URL 駆動状態（`validateSearch`）を採用、クライアント state を最小化
- **ADR-005**: pure / side-effect の境界を明確化。reducer は `listSelectors.ts` / `editorState.ts` に pure 関数として export し vitest 対象に
- **ADR-006**: 編集ロックは「acquired / denied 警告」までのベストエフォート。リアルタイム衝突通知は別 Issue
- **ADR-007**: ヘッダー検索（`?q=`）は P10 内で `searchOwnNotes` に切り替える。`q` 無時は `listNotesByOwner`

## リスクと注意点

1. **`NoteListItemDTO.visibility` が現状 `'private'` 固定**: タイル/カレンダーで公開バッジを正確に出すには projection 拡張が必要。本 PR ではバッジ表示自体を控えるか「不明」表示で逃げ、別 Issue で対応
2. **`SearchQuery.create('')` の許容**: 空キーワードを許容しない場合、`q` 有時のみ search 切替に縮退する
3. **server-fn の `frontMatter` 受け渡し**: 既存 actions.ts コメントの通り、戻り値には含めず送信のみ。再表示は `router.invalidate()` で
4. **R2 CORS**: 未設定で presigned PUT が CORS エラーになる可能性。PR 説明に確認手順記載
5. **editLock とタブクローズ**: `beforeunload` で `sendBeacon` は MVP では入れず TTL に任せる
6. **autosave と明示保存のレース**: reducer 内で順序化、衝突時は最新版を fetch して prompt
7. **`bulkChangePublicationVisibility` は per-note シーケンシャル**: 大量選択で時間がかかるため進捗表示「N/M 件処理中」を出す
8. **`contenteditable` 不採用**: A 案の execCommand WYSIWYG はブラウザ実装差で不安定なため不採用、HTML モード + プレビューに統一
9. **タグは URL 上で名前ベース**: ID より短く読みやすい、サーバ側で `listTags` 辞書から ID 解決
10. **既存ファイル移動の破壊的変更**: `NoteList.tsx` 等の単一ファイルを `list/`/`detail/`/`editor/` 配下に分割。import 元（routes）も同 PR で更新

## テスト方針

- **ユニット (`pnpm test:unit`)**: E-1 の pure ロジック網羅
- **インテグレーション (`pnpm test:integration`)**: 既存テストの退行確認のみ（新規 server fn は既存 usecase テストでカバー済み）
- **型検証**: `pnpm typecheck`
- **手動検証**: `testing.md` を参照

## レビュー反映

### 修正した点

- **[P-001 実現可能性]** メディアアップロードの URL 設計修正。`/media/$mediaId` ルートを Phase A-2b として新規追加し、`<img src="/media/<id>">` 形式で挿入する方針に変更。`data-media-ref` 属性は sanitizer の `GLOBAL_ATTRS` に無く剥がされるため使わない。ADR-009 追加
- **[P-002 実現可能性]** `frontMatter` の型クロスバウンダリ問題を JSON 文字列ラップで根本回避。schema は `frontMatterJson: z.string().optional()` とし、handler で `JSON.parse` → `FrontMatter.create`。ADR-008 追加
- **[P-003 実現可能性]** bulk schema 全部に `noteIds.max(BULK_NOTE_IDS_MAX=100)` 上限を A-1 に明記、Workers CPU 制約をスキーマ段階で担保
- **[P-004 実現可能性]** `useEditLock` のエラー分岐（`edit_lock_held_by_other` / `NOTE_FORBIDDEN` / `NOTE_NOT_FOUND`）を D-8 に明示
- **[P-005 実現可能性]** editLock の `ttlSec` を server-fn 側で `EDIT_LOCK_TTL_SEC` 固定（クライアント任意性排除、`MAX_EDIT_LOCK_TTL_SECONDS=1800` 超過事故防止）。A-1 に明記
- **[P-006 実現可能性]** `searchOwnNotes.dateRange` 両端必須問題への対応として、loader 内 `normalize(dateRange)` で欠落側を `new Date(0)` / `new Date()` 補完する規約を A-3 に追加
- **[P-007 実現可能性]** `noteListSearchSchema` の全フィールドを `.optional().catch(undefined)` または `.default()` 付きに（Sidebar `Link search={{ directoryId }}` で parse 失敗しないため）。A-1 に明記
- **[P-001 要件カバレッジ]** 一括エクスポートをスコープ内に格上げ。`enqueueExportJob` は `scope: "multiple"` を既に受け付けるため、`bulkExportNotesFn` を A-2 に追加、B-6 の `BulkActionBar` に「エクスポート」CTA + `BulkExportDialog` を追加
- **[P-002 要件カバレッジ]** P10 公開状態フィルタを `q` 有時の `searchOwnNotes.visibilityFilter` 経路で部分実装。`q` 空時の `listNotesByOwner` 経路はバックエンド projection 拡張が必要のため引き続きスコープ外（部分実装の分割を ADR-001 と「含まれるもの/含まれないもの」表に明記）
- **[P-003 要件カバレッジ]** P11 複製の遷移仕様を C-3 に明示（`duplicateNoteFn` 戻り値の `noteId` で `/notes/$noteId/edit` へ navigate）
- **[P-005 要件カバレッジ]** SavedView 復元（`viewId` 指定時のロード）を B-7 と A-3 に追加。`loadSavedViewById` + `viewQueryToSearch` pure 関数で URL 復元

### 取り込んだ改善提案

- **[S-001 要件]** `media/$mediaId` ルート追加の判断を ADR-009 に明記
- **[S-002 要件]** autosave と明示保存のレース時 UX（OCC 衝突時に最新版 fetch → prompt）を D-7 にて editor reducer 内のキューイング規約として整理
- **[S-003 実現可能性]** `createSavedViewFn` の `tagNames` → `tagIds` 解決を handler 側で行う規約を A-1 / A-2 に明記
- **[S-004 実現可能性]** `renderHome` で `Promise.all` してから HomePage に props を流す方針を A-3b として追加
- **[S-005 実現可能性]** `CalendarView` を client component に統一、Workers の `Intl.DateTimeFormat` 制約を B-3 に注記
- **[P-004 要件カバレッジ]** ヘッダー検索は既存 `<form action="/" method="get">` で `/?q=` 遷移済み（コード改修不要）を「含まれるもの」に明記

### 見送った提案とその理由

- **[S-003 要件]** `sendBeacon` での editLock release → MVP では入れない判断を ADR-006 の Consequences に明記済み。実装コスト極小だがリスクも見えづらく、TTL 60s 失効で許容範囲
- **[S-004 要件]** hooks の reducer 集約方針 → ADR-005 と D-2 で既に明記済み、追加変更なし
- **[S-005 要件]** YAML 形式 FrontMatter の互換性確認 → バックエンド `FrontMatter.create` は object 受け取りで保存時に object 化されている前提（ADR-003）。Phase 2 実装中に実物で要確認、想定外なら adr.md に追記

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○（usecase 棚卸し・スコープ判定） | ◎（構造化・状態管理・テスト戦略） | △（WYSIWYG/公開状態フィルタ判定） |
| 取り込んだ点 | 自動保存・メディアアップロード・編集ロックの usecase 経路 | ディレクトリ再編・reducer 純粋化・pure/side-effect 分離・テスト戦略 | WYSIWYG は新規ライブラリ追加せず HTML プレビュー併設で代替・公開状態フィルタはスコープ外 |
| 不採用 | contenteditable + execCommand WYSIWYG（ブラウザ差で不安定） | — | 「履歴」「自動保存」「編集ロック」を全てスコープ外（Issue の意図に対し縮小しすぎ） |
