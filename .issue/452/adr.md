# ADR — Issue #452: アップロードしたソースファイルを永続保存

## ADR-001: 永続ストレージは既存 `ObjectStorage` ポートを再利用する

### Status
Proposed

### Context
ソースファイルを永続保存するには永続オブジェクトストレージが必要。新規に `SourceFileStorage` ポート + アダプターを立てるか、既存の `ObjectStorage`（`r2ObjectStorage`）を再利用するかが論点。

### Decision
新規ポートを立てず、既存 `ObjectStorage` を再利用する。`r2ObjectStorage` は既に media 用途で永続稼働しており、`put/get/stat/delete/presignDownload` が揃い、presigned URL の SigV4 発行も実装済み。一時用 `TempFileStorage` とは別ポートに分離済みなので、Issue の「永続用ポートを分けるか」は既に満たされている。

### Consequences
- 良い点: 配信・署名・purge の既存基盤をそのまま使え、実装量とテスト面積が最小化。
- トレードオフ: source ファイルが media バケット/プレフィックス配下に同居する。`{ownerId}/source/{mediaId}` プレフィックスで論理分離する。

---

## ADR-002: ソースファイルは `MediaAsset(kind='source')` で表現し、Note とは専用カラムで紐付ける

### Status
Proposed

### Context
ソースファイルのドメインモデルをどう持つか。独立した `SourceFile` 集約を立てるか、既存 `MediaAsset` に種別を足すか。また Note との紐付けを既存の `mediaRefs`（本文埋め込み refCount 機構）に乗せるか別経路にするか。

### Decision
独立集約を立てず `MediaAsset` に `kind='source'` を追加する。MediaAsset は ownerId/mimeType/byteSize/storageKey/originalFileName を既に持ち、ソースファイル要件をほぼ充足。ただし Note との紐付けは `mediaRefs` ではなく Note の専用カラム `sourceFileId`（nullable）で 1:1 とする。

ソースファイルは本文 HTML に現れないため `MediaService.reconcileRefs`（`MEDIA_ID_FROM_URL` 由来）の対象外で、refCount の自動増減を受けない。代わりに **commit 時に明示的に `markAttached` で `attached`/refCount=1 に固定**し、デタッチ（overwrite 差し替え・note purge）も **明示的に `decrementRef` で orphan に落として既存の purge worker に回収させる**（ADR-005 参照）。「purge 対象外」ではなく「purge 機構を明示操作で駆動する」点が要。

### Consequences
- 良い点: 集約の重複を避け、メタデータ保持・配信・認可・purge を既存 media 基盤で完結。
- トレードオフ / 注意: `note.mediaRefs` は `MEDIA_ID_FROM_URL` で本文 HTML から導出され refCount で orphan purge される。ソースファイルを誤って mediaRefs に混ぜたり、`/media/<id>` リンクを本文 HTML に挿入すると即 purge される。専用カラム + UI 要素としてのみリンク描画で確実に分離する。

---

## ADR-003: 配信は `downloadMedia` + `/media/$mediaId` を再利用し、ダウンロードは presigned URL に content-disposition を付与する

### Status
Proposed

### Context
閲覧/ダウンロードの配信方式を、署名付き URL かサーバー経由ストリーミングか決める必要がある。認可（所有者チェック）の担保も必須。加えて受け入れ条件は「閲覧」と「ダウンロード」を別々に要求するが、`/media/$mediaId` は presigned R2 URL への 302 redirect であり、`<a download>` 属性は**クロスオリジンの R2 URL には効かない**ため、ダウンロード（ファイル名付き保存）を別途実現する必要がある。

### Decision
既存の `downloadMedia` ユースケース + `/media/$mediaId` ルート（presigned URL を発行し 302 redirect）を再利用する。認可は `downloadMedia` 内の `MediaService.assertViewableBy`（owner は常に可）で担保。

閲覧/ダウンロードの出し分けは、presigned URL の `response-content-disposition` で行う:
- `ObjectStorage.presignDownload(key, ttlSec, options?)` に optional `{ downloadFileName?: string }` を追加。指定時は SigV4 の署名済みクエリに `response-content-disposition=attachment; filename="..."` を加える（R2 は S3 互換でこのレスポンスヘッダ override をサポート）。未指定時は現状どおり inline（既存呼び出しは無変更）。
- `DownloadMediaInput` に optional `download: boolean` を追加。`true` のとき `asset.originalFileName ?? asset.id` をファイル名に attachment disposition で presign。
- `/media/$mediaId` ルートに `validateSearch` で `?download`（boolean）を追加。閲覧リンクは `/media/<id>`（inline）、ダウンロードリンクは `/media/<id>?download=1`（attachment）。

閲覧（プレビュー）は inline presigned URL を新規タブで開き、ブラウザのネイティブビューア（PDF/画像/音声）に委譲する。

**実装上の load-bearing 注意:**
- `response-content-disposition` は SigV4 の署名対象クエリ。`r2ObjectStorage.presign` では `queryParams` 配列に push してから canonical 構築・署名すること。署名後の `searchParams.set` で後付けすると 403（`SignatureDoesNotMatch`）。
- filename の文字種: `OriginalFileName` VO が非ASCII/クォートを許すなら `filename*=UTF-8''`（RFC 5987）形式を併用。実装時に VO を確認して確定する。

### Consequences
- 良い点: worker 帯域を消費せず、既存の署名 URL 経路を再利用。閲覧/DL を確実に出し分けできファイル名も付く。既存呼び出し（avatar 等）は default `download:false` で無変更。
- トレードオフ: `presignDownload` のシグネチャに optional 引数を1つ追加（port + r2 アダプター + DI フェイク + 既存呼び出しの型整合）。presigned URL の有効期限内は URL 知得者がアクセスできる（既存 media と同じ特性）。

---

## ADR-004: ソースファイルの上限再検証は commit 時に行わない

### Status
Proposed

### Context
`uploadMedia` は UoW 内で `instanceSettingsRepository.get()` → `enforceUploadLimit` を必ず通す。commit 時に `MediaAsset(kind='source')` を新規生成して永続化するため、ここでもインスタンス上限を再適用すべきかが論点。

### Decision
commit 時はソースファイルの上限を**再適用しない**。ファイルは ingestion アップロード時（`uploadFile`）に既に受理・検証済みであり、commit は確定操作にすぎない。`MediaAsset.create` は `validateByteSize`（5TiB 上限）だけを通す。

### Consequences
- 良い点: 取り込み済みファイルが設定変更で commit 不能になる事態を避ける。
- トレードオフ: ingestion アップロード上限が media アップロード上限と別管理である前提に依存（既存挙動）。

---

## ADR-005: ソースファイルのライフサイクルは標準 purge 機構を明示駆動する（永続 orphan を作らない）

### Status
Proposed

### Context
ソースファイルは `attached`/refCount=1 固定で mediaRefs の自動 refCount に乗らない。このまま放置すると overwrite（commit 差し替え）や note purge（完全削除）で参照が外れても blob が `attached` のまま残り、purge worker（`status IN ('orphan','deleting')` のみ対象）の回収対象外となって**永続 orphan blob**を生む。

### Decision
ソースファイルのデタッチを明示的に `MediaAsset.decrementRef`（refCount=1 → 0 → orphan）で行い、既存の purge worker に回収を委ねる:
- **overwrite commit**: 上書き対象ノートに既存 `sourceFileId` があれば、その MediaAsset を `decrementRef` で orphan 化してから新ソースを `sourceFileId` に設定する（commit の UoW 内）。
- **note purge（完全削除）**: `NoteEvents.purged` ペイロードに `sourceFileId` を追加し、media の `handleNotePurgedEvent` が mediaRefs 解放に加えて、`sourceFileId !== null` なら同様に orphan 化する。`purgeTrashOlderThan` の自動 purge も同イベント経由で自動的にカバーされる。
- **note trash（ゴミ箱・ソフト削除）**: ソースファイルは触らない（ノートは復元可能なので元ファイルも保持するのが正しい）。

### Consequences
- 良い点: 永続 orphan を作らず、blob 回収を既存 purge worker に一本化。trash 中は元ファイルを保持し restore 時に閲覧/DL を継続できる。
- トレードオフ: `NoteEvents.purged` ペイロードと decoder、`handleNotePurgedEvent` に小さな変更が入る。保持期間ポリシー（TTL）は本 Issue では導入せず無期限保持（容量/コスト最適化は別 Issue）。

---

## ADR-006: 実装時に確定した付随判断（implementation notes）

### Status
Accepted（実装で確定）

### Context / Decision
plan / ADR-001〜005 に明記されていなかった細部を実装時に確定した。

1. **commit のステージ (a) で IngestionJob を二度読む。** ステージ (a)（UoW 前の `objectStorage.put`）には `tempStorageKey` / `mimeType` / `byteSize` / `originalFileName` が必要だが、これらは job エンティティにしかない。既存の UoW 内 `findById`（OCC `expectedVersion` を取得する正規読み取り）は残したまま、UoW 前に同 job を **projection として 1 回追加で読む**（`prepareSourcePersist`）。projection 読みは所有者・`previewing`・`tempStorageKey !== null` を満たさなければ `null` を返し source 永続化をスキップする（OCC 検証は UoW 内が担うため projection 側では行わない）。`uploadMedia` の「bytes-first」パターンと整合。

2. **`Note.updateContent` に optional `sourceFileId?: MediaAssetId | null` を追加。** overwrite commit で既存ノートの source を差し替えるため。`undefined` のとき既存値を維持（他の全 mutator は `...note` spread で保持）。no-op 判定にも `sourceFileId` の一致を含めた。commit 側は新 source を永続化したときだけ `sourceFileId` を渡し、無ければ既存維持。

3. **`response-content-disposition` は RFC 6266 + RFC 5987 併用形式。** `OriginalFileName` VO は trim 後非空・255 文字以内のみを課し、非ASCII・クォート・空白・パス区切りを許す。そのため `attachment; filename="<ASCII fallback>"; filename*=UTF-8''<pct-encoded>` を生成（`buildAttachmentDisposition`）。ASCII fallback は制御文字・クォート・スラッシュ・非ASCIIを `_` に置換、`filename*` は厳密な UTF-8 を percent-encode。全体は既存 `encodeRfc3986` で署名対象クエリ値として再エンコードされる。

4. **テスト用 `InMemoryObjectStorage.presignDownload` を options 反映型に更新。** `download` フラグの filename 透過を結合テストで検証できるよう、`downloadFileName` を URL の `response-content-disposition` クエリに反映するよう共有ヘルパ（`app/core/application/__tests__/helpers.ts`）を更新した（プロダクション挙動には影響しない）。

5. **`Note.reconstruct` の `ReconstructInput.sourceFileId` は必須（optional でない）。** アダプタは常に `notes.source_file_id`（NULL 可）を供給するため。`CreateInput` 側は optional（`?? null`）。

### Consequences
- 良い点: 既存パターン（bytes-first / spread 保持 / SigV4 queryParams）に忠実で、新規ポート・新規集約を増やさない。
- トレードオフ: commit で job を 2 回読む（projection + OCC）。commit は低頻度操作なので許容。
