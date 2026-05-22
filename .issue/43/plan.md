# 実装計画 — Issue #43: spec/testcases text drift vs implementation (14 items)

**Issue:** #43
**作成日:** 2026-05-23
**複雑度:** 小規模

---

## 目的

Issue #5 の integration test 実装中に判明した `spec/testcases/{note,media,ingestion}/index.md` と実装挙動の乖離 14 件を解消する。基本方針は **spec 文言を実装挙動に揃える**（=実装側が正）。例外として #10（`daily_upload_quota_exceeded` の enum 欠落）のみ実装側に微調整を加える。

## スコープ

### 含まれるもの

- `spec/testcases/note/index.md` の文言修正（trash/restore Outbox 名、`AuthorizationError → ForbiddenError`、`ResourceNotFoundError → ForbiddenError`、`content_too_large` の包み込み）
- `spec/testcases/media/index.md` の文言修正（`ValidationError → BusinessRuleError(media_byte_size_exceeded)`、`StorageUnavailableError → SystemError(external_api_error)`、PurgeOrphans の R2 失敗時挙動）
- `spec/testcases/ingestion/index.md` の文言修正（Queue enqueue→outbox event、`size_exceeded → ingestion_byte_size_exceeds_limit`、`AuthorizationError → ForbiddenError`）
- `app/core/domain/ingestion/errorCode.ts` に `DailyUploadQuotaExceeded` 定数を追加（値は spec と同じ `"daily_upload_quota_exceeded"`）
- `app/core/application/ingestion/uploadFile.ts` の `BusinessRuleError("daily_upload_quota_exceeded", …)` を `IngestionErrorCode.DailyUploadQuotaExceeded` 参照に置換
- `.issue/5/adr.md` の ADR-004 の各項目に「Resolved by #43」相当のステータス追記

### 含まれないもの

- PurgeOrphans の R2 失敗リトライロジックの実装（ADR-004 #15 の判断: spec を実装挙動に合わせる方向。実装側のリトライは別 Issue で扱う）
- spec の他テストケース表の全件再点検（本 Issue は ADR-004 列挙 14 件のみが対象）
- ADR-004 #5, #6 のうち既に Issue #82（commit 83ce976 `refactor(error-code)` lower_snake_case 正規化）で解消済みの項目（`unsupported_format` / `regeneration_limit_exceeded` / `invalid_status_for_*`）— 確認のみで spec への書き換えは不要

## 実装ステップ

### 1. `spec/testcases/note/index.md` の文言修正

- **対象ファイル:** `spec/testcases/note/index.md`
- **変更内容:**
  - L49: `他人のディレクトリへ | MoveNote | AuthorizationError` → `他人のディレクトリへ | MoveNote | ForbiddenError('NOTE_FORBIDDEN')`（ADR-004 #13）
  - L50: `移動先存在せず | MoveNote | ResourceNotFoundError` → `移動先存在せず | MoveNote | ForbiddenError('DIRECTORY_NOT_FOUND')`（ADR-004 #12）
  - L57: `active ノート | DeleteNote | trashed 化、Outbox note.deleted` → `… Outbox note.trashed`（ADR-004 #16）
  - L59: `trashed ノート | RestoreNote | active、note.saved 発火` → `… note.restored 発火`（ADR-004 #17）
  - L12: `1MB 超 content | CreateNote | BusinessRuleError('content_too_large')` → `1MB 超 content | CreateNote | SystemError(data_integrity_error, cause: BusinessRuleError(content_too_large))`（ADR-004 #9。SaveNote 経路も同じ理由で sanitizer 経由になるが、spec の SaveNote 表には現状 content_too_large 行が無いため追加修正不要）
  - L91: `他人のノート | GetNoteDetail | AuthorizationError` → `他人のノート | GetNoteDetail | ForbiddenError('NOTE_FORBIDDEN')`（ADR-004 #13）
- **理由:** 実装はそれぞれ ForbiddenError / outbox 名 `note.trashed|restored` / sanitizer 経由の SystemError ラップを使う。spec を実装に揃えれば spec-sync 検出が止まる。

### 2. `spec/testcases/media/index.md` の文言修正

- **対象ファイル:** `spec/testcases/media/index.md`
- **変更内容:**
  - L8: `サイズ超過 | UploadMedia | ValidationError` → `サイズ超過 | UploadMedia | BusinessRuleError('media_byte_size_exceeded')`（ADR-004 #2）
  - L9: `storage 失敗 | UploadMedia | StorageUnavailableError、DB に Asset を残さない` → `storage 失敗 | UploadMedia | SystemError('external_api_error')、DB に Asset を残さない`（ADR-004 #3）
  - L48: `R2 削除失敗 | Purge | リトライ対象として記録` → `R2 削除失敗 | Purge | status=deleting で停止、failed カウントに計上（現状は次の sweep で再試行されない。リトライ強化は別 Issue）`（ADR-004 #15。実装挙動を率直に記述し、リトライ強化は follow-up issue で別途追跡）
- **理由:** 実装は `BusinessRuleError(MediaErrorCode.ByteSizeExceeded = "media_byte_size_exceeded")` / `SystemError(SystemErrorCode.ExternalApiError = "external_api_error")` を投げる。PurgeOrphans は 1st UoW で `orphan→deleting` をコミット後に `storage.delete` を呼ぶ構造のため、storage 失敗時は `deleting` で stuck し、`findOrphansOlderThan` が `status === 'orphan'` のみフィルタするため次回も拾われない。

### 3. `spec/testcases/ingestion/index.md` の文言修正

- **対象ファイル:** `spec/testcases/ingestion/index.md`
- **変更内容:**
  - L7: `対応形式、サイズ内 | Upload(html) | Job 作成、temp 保存、Queue enqueue` → `… Job 作成、temp 保存、outbox に ingestion job created イベント発火`（ADR-004 #4）
  - L9: `サイズ超過 | Upload(50MB+1) | BusinessRuleError('size_exceeded')` → `BusinessRuleError('ingestion_byte_size_exceeds_limit')`（ADR-004 #5。`unsupported_format` は既に impl と一致しているため変更不要）
  - L58: `他人のジョブ | Get | AuthorizationError` → `他人のジョブ | Get | ForbiddenError('INGESTION_JOB_FORBIDDEN')`（ADR-004 #7）
- **理由:** 実装は outbox 経由のイベント発火（Queue への直接 enqueue は無い）、`IngestionErrorCode.ByteSizeExceedsLimit = 'ingestion_byte_size_exceeds_limit'`、`ForbiddenError("INGESTION_JOB_FORBIDDEN")` を使う。

### 4. `IngestionErrorCode.DailyUploadQuotaExceeded` の追加（ADR-004 #14）

- **対象ファイル:** `app/core/domain/ingestion/errorCode.ts`
- **変更内容:** `DailyUploadQuotaExceeded: "daily_upload_quota_exceeded"` を `IngestionErrorCode` に追加
- **理由:** 他の ingestion 失敗は `IngestionErrorCode.XXX` enum 経由で投げているのに、`uploadFile.ts` の日次クォータ超過だけ素のリテラル文字列で `BusinessRuleError` を投げている。spec 文言 (`daily_upload_quota_exceeded`) は既に一致しているので enum 化のみで揃う。

### 5. `uploadFile.ts` のリテラル参照を enum 参照に置換

- **対象ファイル:** `app/core/application/ingestion/uploadFile.ts`
- **変更内容:** L68 の `"daily_upload_quota_exceeded"` を `IngestionErrorCode.DailyUploadQuotaExceeded` に置換
- **理由:** Step 4 で追加した enum を実際に使う。`IngestionErrorCode` は既に L4 で import 済み。

### 6. ADR-004 ステータス追記

- **対象ファイル:** `.issue/5/adr.md`
- **変更内容:** ADR-004 のヘッダ（`### Status`）の下に「`Resolved by #43`（#15 は spec 整合のみ。リトライ強化は別 Issue）」相当の追記、または各項目末尾に「→ #43 で解消」を追記
- **理由:** spec-sync 監査時に「ADR-004 は対応済み」を一覧で読み取れるようにする。

## 設計判断

- **PurgeOrphans R2 失敗時の方向（ADR-004 #15）**: spec 修正で済ませる（実装挙動を率直に記録）。「次の sweep で再試行されず stuck する」は確かに望ましくない挙動だが、修正は `findOrphansOlderThan` の where 句に `OR status='deleting'` を足し、loop 側で markDeleting を skip するなど複数箇所に波及するため、本 Issue とは独立して別 Issue で追跡する。
- **AuthorizationError → ForbiddenError**: アプリケーション層に `AuthorizationError` クラスが存在せず `ForbiddenError` がその役割を担うため、spec を実装に揃える方向で確定。
- **`content_too_large` の文言**: sanitizer が `ByteSize` 検査を外側 `try/catch` で `SystemError(data_integrity_error)` に包み込む実装になっているのは ADR-005 / sanitizer の設計判断。Issue #43 では spec 側を「SystemError 経由」に揃え、sanitizer の wrap 方針の見直しは扱わない。

## リスクと注意点

- `spec/testcases/` は人間とエージェントの設計対話のソース・オブ・トゥルース。文言ミス（タグ抜け・コード値 typo）は spec-sync の次サイクルで再検出されるため、各セルの後で実装の該当箇所（errorCode.ts / events.ts / 各 usecase）と一字違わず一致しているかを目視確認する。
- 文言修正後、対応する integration test（`createNote.integration.test.ts` / `trashLifecycle.integration.test.ts` / `purgeOrphans.integration.test.ts` / `ingestion.integration.test.ts` / `uploadMedia.integration.test.ts` / `moveNote.integration.test.ts` 等）の `// ADR-004 #N: …` コメントは現状の挙動を pin する意図で残っている。Issue #43 で spec が実装に揃ったあとも残しておくが、コメント中の「Phase 4 で別 Issue を起票」のような将来形は `.issue/5/adr.md` 更新後に意味が薄れるため、今回は触らない（テスト本体の意味は変わらない）。
- enum 追加（Step 4）は `errorCodeNaming.test.ts` で値が `lower_snake_case` の regex に通る必要がある。`daily_upload_quota_exceeded` は通る。

## テスト方針

- `pnpm typecheck` で `IngestionErrorCode.DailyUploadQuotaExceeded` 参照を型レベルで検証
- `pnpm test:unit` で `errorCodeNaming.test.ts` が引き続き通ることを確認（命名規約違反が無いこと）
- `pnpm test:integration` で `ingestion.integration.test.ts` の `daily_upload_quota_exceeded` ケースが enum 参照後も同じ挙動になることを確認
- spec ファイル変更は markdown のみのため lint/format/typecheck の追加副作用は無いが、`pnpm format:check` を最後に通す

## レビュー履歴

（小規模 Issue のためレビューループはスキップ）
