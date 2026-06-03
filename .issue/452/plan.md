# 実装計画 — Issue #452: アップロードしたソースファイルを永続保存し、後から閲覧・ダウンロードできるようにする

**Issue:** #452
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

取り込み（ingestion）を確定したノートについて、アップロードした元のソースファイル（PDF・画像・音声・Office ファイル等）を永続保存し、後からノート詳細画面で閲覧（プレビュー）・ダウンロードできるようにする。閲覧/DL には所有者の認可を掛け、元ファイルを持たない既存ノートでも UI が壊れないようにする。

## スコープ

### 含まれるもの

- commit（確定）時に一時ファイルを永続ストレージへコピーし、`MediaAsset(kind='source')` として保存
- Note に `sourceFileId` カラムを追加し、元ファイルと 1:1 で紐付け
- ノート詳細画面に「元ファイル」セクションを追加（閲覧・ダウンロード）
- 既存の `downloadMedia` ユースケース + `/media/$mediaId` ルートを再利用した配信・所有者認可
- 既存ノート（元ファイル無し）の UI 互換
- spec / マニュアルテストの更新

### 含まれないもの

- 保持期間ポリシー（TTL）の導入 — 無期限保持とし、容量/コストの最適化は別 Issue
- discard / retry / regenerate フローの永続化変更（永続化は commit のみ）
- R2→R2 サーバーサイドコピー API の導入（worker 経由コピーで実装）
- 新規の永続ストレージポート / アダプターの新設（既存 `ObjectStorage` / `r2ObjectStorage` を再利用）
- 公開（public/unlisted）ノートの非所有者へのソースファイル公開 — ソースは所有者のみ閲覧/DL 可（`/media/<id>` を `relatedNoteId: null` で呼ぶ既存挙動を踏襲）

## 実装ステップ

### ドメイン

#### 1. `MediaKind` に `source` を追加

- **対象ファイル:** `app/core/domain/media/valueObject.ts`
- **変更内容:** 型 `"image" | "video" | "avatar" | "source"` と `create` の許可リストに `source` を追加。
- **理由:** ソースファイルを既存 MediaAsset 基盤に載せるため。

#### 2. ソースファイルのライフサイクル（attached 固定 + 明示 decrement）

- **対象ファイル:** `app/core/domain/media/service.ts`（確認のみ）、`app/core/domain/media/entity.ts`（既存 `markAttached`/`decrementRef` を利用、変更不要）
- **変更内容:** `MediaService.reconcileRefs` は Note 本文の `mediaRefs` だけを対象にするため `source` kind は元々触れない（確認のみ）。ソースファイルは commit 時に `MediaAsset.create`（pending）→ `markAttached`（attached/refCount=1）で固定する。デタッチ（overwrite 差し替え・note purge）は `decrementRef` で orphan に落とし、既存 purge worker に回収させる（ADR-005）。
- **理由:** 永続 orphan を作らず blob 回収を既存 purge worker に一本化。trash 中は保持して restore 後も閲覧/DL 継続。

#### 3. Note 集約に `sourceFileId: MediaAssetId | null` を追加

- **対象ファイル:** `app/core/domain/note/entity.ts`
- **変更内容:** `NoteBase` に `sourceFileId: MediaAssetId | null`、`create`（`CreateInput` に追加、`Note.create` で設定）/`reconstruct`（`ReconstructInput` に `sourceFileId: string | null` 追加、`MediaAssetId.create` で復元）/`updateContent`（sourceFile は引数に取らず既存値を維持）を更新。各 status 分岐（active/trashed）の spread で保持。
- **理由:** ノートと元ファイルを 1:1 で紐付け、`mediaRefs` の refCount 機構と切り離す。

#### 3b. `NoteEvents.purged` に `sourceFileId` を追加し、media の purge ハンドラで回収

- **対象ファイル:** `app/core/domain/note/events.ts`（`purged` ペイロードに `sourceFileId: MediaAssetId | null`）、`app/core/application/note/eventDecoders.ts`（decoder 更新、`title` の optional 後方互換パターンに倣い `sourceFileId` も optional 復元で旧イベント互換）、`app/core/application/note/purgeNote.ts` と `purgeTrashOlderThan.ts`（イベント発行時に `found.entity.sourceFileId` を渡す）、`app/core/application/media/handleNotePurgedEvent.ts`（mediaRefs 解放後、source を回収）
- **変更内容:** note 完全削除時にソースファイルを orphan 化し purge worker に回収させる。
- **冪等ガード（必須）:** `handleNotePurgedEvent` で `sourceFileId !== null` のとき `mediaAssetRepository.findById` し、**`status` が `orphan`/`deleting` なら何もしない（skip）**。`attached`/`pending` のときだけ `decrementRef` → save。`MediaAsset.decrementRef` は引数型が `PendingMedia | AttachedMedia` で orphan/deleting を扱えず、outbox は at-least-once（重複配信）のため、既存 `MediaService.reconcileRefs` の orphan/deleting スキップと同じガードを必ず入れる。
- **理由:** ADR-005。永続 orphan blob の防止と、at-least-once 配信での冪等性確保。

### アダプター（DB）

#### 4. D1 スキーマ更新

- **対象ファイル:** `app/core/adapters/d1/schema.ts`
- **変更内容:** `mediaAssets` の `media_kind_enum` CHECK に `'source'` を追加。`notes` に `source_file_id text references media_assets.id (onDelete: set null)` を追加。
- **理由:** 永続ファイルメタデータは `mediaAssets` に保持（ストレージキー/MIME/サイズ/元ファイル名は既存カラムで充足）。Note→source の参照を 1 本追加。

#### 5. Note リポジトリの insert/save/reconstruct マッピングに `sourceFileId` を反映

- **対象ファイル:** `app/core/adapters/d1/`（Note リポジトリ実装ファイル）
- **変更内容:** insert 時の `noteValues`、save 時の `noteUpdateValues`、復元時の `toNote`（reconstruct 入力組み立て）の 3 箇所に `sourceFileId` の読み書きを追加。`mediaRefs` の join テーブル（`note_media_refs`）とは別物（`notes.source_file_id` カラム）である点に注意。
- **理由:** 永続化の往復で `sourceFileId` を保持。

#### 6. マイグレーション追加

- **対象ファイル:** `app/core/adapters/d1/migrations/0014_*.sql`（連番は実装時に確認）
- **変更内容:** `media_kind_enum` の CHECK 変更（SQLite はテーブル再作成パターンに倣う）＋ `ALTER TABLE notes ADD COLUMN source_file_id`。
- **理由:** 既存データは `source_file_id = NULL`（=元ファイル無し）で安全に共存。

### ユースケース

#### 7. commit 時にソースファイルを永続化（3 段フロー）

- **対象ファイル:** `app/core/application/ingestion/commitIngestionPreview.ts`
- **変更内容:** `tempStorageKey` が非 null のとき、以下の 3 段で処理する（`uploadMedia` の bytes-first パターンに倣う）:
  - **(a) UoW 前:** `mediaId = container.idGenerator.next()` で確定 → `tempFileStorage.get(tempKey)` → `objectStorage.put('{ownerId}/source/{mediaId}', bytes, job.mimeType)`。put は UoW 外（R2、トランザクション外）。
  - **(b) UoW 内:** `MediaAsset.create({id: mediaId, ownerId, kind:'source', mimeType, byteSize, storageKey, originalFileName})`（pending）→ `markAttached`（attached/refCount=1）→ `mediaAssetRepository.save` + イベントを `collectEvents`。生成 `mediaId` を `Note.create`/`Note.updateContent` の `sourceFileId` に設定。overwrite 時に上書き対象が既存 `sourceFileId` を持つなら、その MediaAsset を `findById` → `decrementRef`（orphan 化）→ save + `collectEvents`（旧 blob は purge worker が回収）。
  - **(c) UoW 後:** 既存の `tempFileStorage.delete`（コピー後に一時削除、best-effort で `isTempFileNotFoundError` ガードは現状踏襲）。
- **注意:** put（UoW 外）成功・DB ロールバック時は R2 blob が orphan で残るが、`uploadMedia` と同じ既存の許容パターン。ただし source は purge 自動対象外なので、この経路の blob は MediaAsset 行が作られず手動回収手段が無い点を progress に注記（commit の DB 失敗は稀）。上限の再検証は行わない（ADR-004）。
- **理由:** 受け入れ条件「確定で元ファイルが永続保存」。

#### 8. 配信は `downloadMedia` を再利用し、ダウンロードに content-disposition を追加

- **対象ファイル:** `app/core/domain/media/ports/objectStorage.ts`、`app/core/adapters/cloudflare/r2ObjectStorage.ts`、`app/core/application/media/downloadMedia.ts`、`app/routes/media/$mediaId.tsx`
- **変更内容:**
  - `ObjectStorage.presignDownload(key, ttlSec, options?: { downloadFileName?: string })` に optional 引数を追加。DI のフェイク実装（`app/core/application/di/serverCloudflare.ts` の inline fake presignDownload）もシグネチャを揃える（downloadFileName は無視でよい）。未指定時は inline（既存5呼び出し元は無変更）。
  - **r2ObjectStorage の実装注意（必須）:** `response-content-disposition` は SigV4 の**署名対象**。`r2ObjectStorage.ts` の `presign` で、署名後の `signedUrl.searchParams.set(...)` で後付けするのではなく、**`queryParams` 配列に push してから canonicalQueryString 構築・署名する**こと（後付けは署名カバレッジ外で R2 が `SignatureDoesNotMatch` 403 を返す）。値は既存 `encodeRfc3986` でエンコードされるため `;`・空白・`"` は安全。
  - `DownloadMediaInput` に optional `download?: boolean` を追加。`true` のとき `asset.originalFileName ?? asset.id` をファイル名に attachment disposition で presign。
  - `/media/$mediaId` ルートに `validateSearch` で `?download`（boolean）を追加。さらに `resolveMediaRedirect` サーバー関数の `inputValidator` zod スキーマにも `download` を足し、loader が `search.download` を `data` に載せて渡す（**validateSearch と inputValidator の両方**を触る）。
- **filename 文字種:** `OriginalFileName` VO の許容文字次第で `filename="..."` で足りるか `filename*=UTF-8''`（RFC 5987）が要るか判断。非ASCII/クォートを含みうるなら RFC 5987 形式を併用する（ADR-003 参照、実装時に VO を確認して確定）。
- **理由:** 閲覧（inline）とダウンロード（attachment）を確実に出し分ける。`<a download>` 属性はクロスオリジン R2 URL に効かないため（ADR-003）。既存の所有者認可（`assertViewableBy`）はそのまま効く。

### プレゼンテーション / フロントエンド

#### 9. NoteDTO / view / loader に `sourceFile` を射影

- **対象ファイル:** `app/core/application/dto/note.ts`、`app/core/application/note/view.ts`、`app/core/application/note/getNoteDetail.ts`
- **変更内容:** ソースファイルの有無・表示名（originalFileName）・mimeType・DL リンク用 mediaId を詳細画面へ渡す。`getNoteDetail` は既に UoW 内で動くため、`note.sourceFileId !== null` のとき `ctx.mediaAssetRepository.findById(sourceFileId)` を1回呼んで originalFileName/mimeType を引く（追加配線不要）。`sourceFile: { mediaId, originalFileName, mimeType } | null` は **`getNoteDetail` ローカルで合成**し、`{ ...toNoteView(note), sourceFile }` として `GetNoteDetailOutput` に載せる（`toNoteView`/`toNoteDTO` のシグネチャは変えない — 全呼び出し元への波及を避けるため）。
- **理由:** フロントが「元ファイル」セクションを描画するため。

#### 10. ノート詳細に「元ファイル」セクションを追加

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`（または新規小コンポーネント）、`NoteDetail.tsx`、`app/components/note/loaders.ts`
- **変更内容:** `sourceFile !== null` のときのみ、ファイル名表示・閲覧（`/media/<id>` を新規タブ `target="_blank" rel="noopener"`）・ダウンロード（`/media/<id>?download=1`）を描画。null のとき何も描画しない（既存ノート互換）。
- **制約（重要）:** ソースファイルの `/media/<id>` リンクは NoteMetaPanel 等の **UI 要素としてのみ**描画し、ノート本文 `contentHtml` には**絶対に挿入しない**。本文に出すと `MEDIA_ID_FROM_URL` が拾って refCount に巻き込まれ purge 事故になる（ADR-002）。
- **理由:** 受け入れ条件の閲覧/DL/既存ノート非破壊。プレビューは presigned URL を新規タブで開き、ブラウザのネイティブビューアに委譲。

### spec / マニュアルテスト

#### 11. spec とマニュアルテスト更新

- **対象ファイル:** `spec/domains/media.md`（`source` kind）、`spec/domains/note.md`（`sourceFileId`）、`spec/domains/ingestion.md`（commit で永続コピー）、`spec/manual-tests/ingest.md`（「元ファイルが保存されない」→「保存され閲覧/DL できる」）、`spec/database/`
- **理由:** 実装と spec の整合（spec-sync 観点）。

### テスト

#### 12. 単体/結合テスト追加

- **対象ファイル:** media valueObject（`source` kind）、Note entity（`sourceFileId`）、commitIngestionPreview の永続化結合テスト、downloadMedia が source kind でも所有者認可で動くこと、NoteDetail のソースファイル有無の描画
- **理由:** 受け入れ条件の担保。

## 設計判断

詳細は `adr.md` を参照。要点:

- **永続ストレージのポート → 新規ポートを立てず既存 `ObjectStorage` を再利用**（`r2ObjectStorage` は既に永続用途で稼働中、presignDownload 実装済み）。
- **SourceFile のモデル → 独立集約を立てず `MediaAsset(kind='source')`。** Note との紐付けは `mediaRefs`（refCount/purge 機構）ではなく専用カラム `sourceFileId` で 1:1。`markAttached` で attached/refCount=1 固定し、デタッチは `decrementRef` で orphan 化して標準 purge worker に回収させる（ADR-005）。
- **配信方式 → 既存の presigned URL + 302 redirect（`downloadMedia` + `/media/$mediaId`）を再利用。** 閲覧/DL は presigned URL の `response-content-disposition` で出し分け（ADR-003）。認可は `MediaService.assertViewableBy` で担保済み。
- **DB → 新テーブルなし。`mediaAssets`（kind 拡張）+ `notes.source_file_id`（nullable, set null）。**
- **commit の流れ → (a) UoW 前: put、(b) UoW 内: MediaAsset 保存 + Note.sourceFileId 設定 + overwrite 旧 source の orphan 化、(c) UoW 後: temp delete。**
- **保持期間 → 本 Issue では無期限保持（TTL は別 Issue）。**

## リスクと注意点

- **mediaRefs/refCount との混線が最大リスク。** ソースファイルを誤って `note.mediaRefs` に入れる、または `/media/<id>` リンクを本文 HTML に挿入すると orphan purge で消える。必ず `sourceFileId` 専用カラムで持ち、リンクは UI 要素としてのみ描画する。
- **SQLite の CHECK 制約変更**（`media_kind_enum` への `source` 追加）はテーブル再作成が必要。直近の `0013_*` 等の table-rebuild パターン（`PRAGMA defer_foreign_keys = ON` → `__new_*` 作成 → INSERT → DROP → RENAME）に倣う。
- **commit の原子性**：永続 put（UoW 外）と DB 書き込みの整合。put 成功・DB ロールバック時は source blob が orphan で残る（MediaAsset 行が無く自動回収不可）。commit の DB 失敗は稀で、`uploadMedia` と同種の許容。progress に注記。
- **永続 orphan の防止**：overwrite 差し替え・note purge では旧/対象 source を `decrementRef` で必ず orphan 化する（ADR-005）。note trash では保持。
- **discard / retry / regenerate は変更しない**（永続化は commit のみ）。
- **大容量ファイル**（最大 50MiB）を commit で `tempFileStorage.get` → `objectStorage.put` する際、worker メモリに ArrayBuffer 全体を載せる（既存と同じ制約）。
- **既存ノート互換**：`sourceFile === null` の分岐をフロント/DTO で必ず通す。
- **ソースは所有者のみ閲覧可**：`/media/<id>` を `relatedNoteId: null` で呼ぶため、ノートを public 公開しても元ファイルは他人に見えない（spec に明記）。

## テスト方針

- ドメイン単体: `MediaKind.create('source')`、`Note` の `sourceFileId` 往復。
- ユースケース結合（real-DB）: アップロード→runIngestionJob→commit 後に (1) `mediaAssets` に `kind='source'`/`attached` 行、(2) `notes.source_file_id` 紐付け、(3) tempFileStorage から該当キー消去、(4) objectStorage に永続キー存在、を検証。
- 認可: `downloadMedia` を別ユーザーで呼ぶと拒否、所有者なら presigned URL。
- フロント: NoteDetail で sourceFile 有り→閲覧/DL リンク、無し→非表示。
- 手動/ブラウザ: 取り込み確定→詳細画面で元ファイルの閲覧/DL が所有者のみ成功。
- 回帰: `pnpm typecheck && pnpm lint:fix && pnpm format`、`errorCodeNaming.test.ts`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点）

**修正した点（要修正の反映）**:
- **[P-001 ダウンロード実現性]** `<a download>` 属性がクロスオリジン R2 URL に効かない問題に対応。`presignDownload` に `response-content-disposition` 対応を追加し、閲覧（inline）/ダウンロード（attachment）を presigned URL レベルで出し分ける設計に変更（ステップ8、ADR-003）。
- **[P-001 commit 3段フロー]** put（UoW 外）/ save（UoW 内）/ temp delete（UoW 後）の3段を明示（ステップ7）。`mediaId` は UoW 前に `idGenerator.next()` で確定。
- **[P-002 本文混入禁止]** ソースファイルの `/media/<id>` リンクは UI 要素としてのみ描画し本文 HTML に挿入しない制約を明記（ステップ10、ADR-002）。
- **[P-002 上限再検証]** commit 時にソースファイルの上限は再適用しない判断を明文化（ADR-004）。
- **[P-003 永続 orphan]** 「attached 固定で purge 除外」を改め、overwrite・note purge では `decrementRef` で orphan 化して標準 purge worker に回収させる設計に変更。`NoteEvents.purged` に `sourceFileId` を追加し media の `handleNotePurgedEvent` で回収（ステップ3b、ADR-005）。

**取り込んだ改善提案**:
- **[S-001 markAttached]** `MediaAsset.create` は pending を返すため `markAttached` 経由で attached/refCount=1 にすることをステップ2/7 に明記。イベントは `collectEvents` へ。
- **[S-001 Note リポジトリ3箇所]** `noteValues`/`noteUpdateValues`/`toNote` の3箇所に `sourceFileId` を足すことをステップ5 に具体化。`note_media_refs` join テーブルとは別物と明記。
- **[S-002 getNoteDetail]** UoW 内 `mediaAssetRepository.findById` で確定1リードできることをステップ9 に反映。
- **[S-003 公開非公開]** 公開ノートでもソースは所有者のみ、をスコープ「含まれないもの」と spec 明記項目に追加。

**見送った提案とその理由**:
- なし（全提案を反映または明文化）。

### 2周目（要件カバレッジ / アーキ・リスクの2視点）

**要件カバレッジ視点**: 問題点ゼロ。受け入れ条件5項目すべてに実装ステップが対応していることを確認。

**アーキ・リスク視点で反映した点（要修正）**:
- **[P-001 冪等ガード]** `handleNotePurgedEvent` の source decrement に orphan/deleting スキップガードを必須化（ステップ3b）。`decrementRef` は pending/attached のみ扱え、outbox は at-least-once のため。既存 `reconcileRefs` と同パターン。
- **[P-002 署名対象クエリ]** `response-content-disposition` を SigV4 の `queryParams` に push してから署名する順序を実装注記に明示（ステップ8、ADR-003）。後付けは 403。

**取り込んだ改善提案**:
- **[S DI フェイク]** `serverCloudflare.ts` の inline fake presignDownload もシグネチャを揃える点をステップ8 に追記。
- **[S ルート配線]** `validateSearch` と `inputValidator` zod スキーマの両方に `download` を足す点をステップ8 に明記。
- **[S DTO 合成]** `sourceFile` は `getNoteDetail` ローカルで合成し `toNoteView`/`toNoteDTO` のシグネチャは変えない点をステップ9 に明記。
- **[S filename]** RFC 5987（`filename*=UTF-8''`）の要否を実装時に VO 確認で判断する点を ADR-003 に追記。

**見送った提案とその理由**:
- なし。

**収束判定**: 要件視点は問題点ゼロ。アーキ視点の2件は設計欠陥ではなく実装精度の注記で、コード前例（reconcileRefs / SigV4 queryParams 構築）に倣えば解決可能。計画に明記済みのため収束とみなしレビューループ終了。
