# Progress — Issue #5

## media ドメイン integration test

**担当範囲:** `app/core/application/media/__tests__/` の integration test のみ。

### 実装したファイル

- `app/core/application/media/__tests__/media.integration.test.ts`
  - UploadMedia: 3 it（正常 / サイズ超過 / storage 失敗）
  - UploadMediaPresigned: 1 it
  - FinalizeUpload: 2 it（実体あり / 実体無し）
  - AttachMediaToNote: 1 it
  - DetachMediaFromNote: 1 it
  - ListMediaByOwner: 1 it
  - DownloadMedia: 4 it（owner / public / private / unlisted+share_link）+ 1 it.todo（unlisted+未指定）+ 1 補助 it（NotFound）
  - HandleNotePurgedEvent: 2 it（参照あり / 重複配信冪等）
- `app/core/application/media/__tests__/purgeOrphans.integration.test.ts`
  - PurgeOrphans: 3 it（24h 経過 / 24h 未満 / R2 失敗）

### テスト集計

- `media.integration.test.ts`: **16 it + 1 it.todo**
- `purgeOrphans.integration.test.ts`: **3 it**
- 合計: **19 it (PASS) + 1 it.todo**

### 検証結果

| コマンド | 結果 |
|---|---|
| `pnpm vitest run --config vitest.config.integration.ts app/core/application/media/__tests__` | ✅ 2 files, 19 passed + 1 todo（duration 1.83s） |
| `pnpm typecheck` | media 関連のエラーなし（ingestion test に既存エラーあり — 別エージェント担当） |
| `pnpm lint:fix` | ✅ 自動修正のみで通過（import 並び替え） |
| `pnpm format` | ✅ 修正なし |

### 設計判断 / 仕様乖離との対応

ADR-004 への追記は無し（計画段階で列挙済みの 3 件で過不足無し）:

- **#1 DownloadMedia: unlisted+viaShareLinkId 未指定** — `it.todo` で残し、テスト名末尾に ADR-004 #1 を明記
- **#2 UploadMedia: サイズ超過** — `BusinessRuleError(MediaErrorCode.ByteSizeExceeded)` を実装値として検証
- **#3 UploadMedia: storage 失敗** — `SystemError(SystemErrorCode.ExternalApiError)` を実装値として検証

### 実装上の補足

- `FinalizeUpload` の StorageNotFoundError → DataIntegrityError マッピングを確実に検証するために、
  ローカル `ThrowingObjectStorageStat` で典型 `StorageNotFoundError` を発火させた。
  共有 `InMemoryObjectStorage` は missing キーで `new Error(...)` を投げるだけで `safeStat` の
  分岐対象にならないため。これは ADR-002（共通 fake には触らない）と整合。
- `PurgeOrphans` の「R2 削除失敗」テストは、failed カウントと `status === 'deleting'` の残置を
  assert。実装は `findOrphansOlderThan` が status='orphan' のみを拾うため、deleting 残置は
  オペレータ確認待ち（次回 sweep では自動再試行されない）。コメントで明示。
- `withFixedClock` は `container.clock` のみを差し替え、`D1UnitOfWorkProvider` 内部の
  `SystemClock` には触らない（plan section 5）。outbox row の時刻列は assert 対象にしていない。
- 直接 insert はすべて `version: 0` を指定（media_assets は version カラム無しなのでスキップ）。

### 既知の制限

- なし。spec/testcases/media/index.md の全 7 セクションを 1:1 で網羅。
  `it.todo` は ADR-004 #1 由来の 1 件のみ。

---

## ingestion ドメイン integration test

**担当範囲:** `app/core/application/ingestion/__tests__/` の integration test のみ。

### 実装したファイル

- `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`
  - UploadFile: 4 it（正常 / 対応外 / サイズ超過 / 当日上限）
  - RegenerateIngestionPreview: 3 it（正常 / 上限到達 / 状態不正）
  - CommitIngestionPreview: 4 it（正常 / 新規ディレクトリ / 上書き / 状態不正）
  - DiscardIngestionPreview: 3 it（previewing / failed / saved 拒否）
  - GetIngestionJob: 1 it（owner OK + 他人 Forbidden の合算）
  - GetIngestionJobs: 1 it（actor 限定）
  - BulkUpload: 1 it（混合バッチ）
- `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts`
  - RunIngestionJob: 10 it（HTML / Markdown / Office / PDF textual / PDF scanned / 画像 / 音声 + LLM/OCR/sanitize 失敗 3 種）
  - UploadFile → RunIngestionJob MIME 偽装連鎖: 1 it

### テスト集計

- `ingestion.integration.test.ts`: **17 it**
- `runIngestionJob.integration.test.ts`: **11 it**
- 合計: **28 it (PASS) + 0 it.todo**

### 検証結果

| コマンド | 結果 |
|---|---|
| `pnpm vitest run --config vitest.config.integration.ts app/core/application/ingestion/__tests__` | ✅ 2 files, 28 passed（duration 1.54s） |
| `pnpm typecheck` | ingestion test エラー 0 件（`app/core/application/note/__tests__/trashLifecycle.integration.test.ts` の 4 件は別エージェント担当の note 領域、本 Issue スコープ外） |
| `pnpm lint:fix app/core/application/ingestion/__tests__` | ✅ No fixes applied |
| `pnpm format app/core/application/ingestion/__tests__` | ✅ No fixes applied |

### 設計判断 / 仕様乖離（ADR-004 追記）

- **#5 UploadFile — `unsupported_format` / `size_exceeded`**: 実装は `IngestionErrorCode.UnsupportedFormat = "INGESTION_UNSUPPORTED_FORMAT"` と `IngestionErrorCode.ByteSizeExceedsLimit = "INGESTION_BYTE_SIZE_EXCEEDS_LIMIT"`。テストは実装値で検証
- **#6 Regenerate / Commit / Discard — `invalid_status_for_*` / `regeneration_limit_exceeded`**: 実装は `IngestionErrorCode.InvalidStateForRegenerate` / `InvalidStateForCommit` / `InvalidStateForDiscard` / `RegenerationLimitExceeded`。テストは実装値で検証
- **#7 GetIngestionJob / GetIngestionJobs — `AuthorizationError`**: 実装は `ForbiddenError(code: "INGESTION_JOB_FORBIDDEN")`。テストは `isForbiddenError + code === "INGESTION_JOB_FORBIDDEN"`
- **#8 RunIngestionJob — `markFailed('sanitize_failure')`**: `classifyPipelineError` は `BusinessRuleError` の `code` をそのまま採用するため、`ThrowingSanitizer` を `BusinessRuleError("sanitize_failure", ...)` で実装することで spec 通り通せた。LLM/OCR は `LLMUnavailableError` / `OCRFailureError` を投げて `"llm_failure"` / `"ocr_failure"` に分類される
- **#4（既存）UploadFile — Queue enqueue**: 実装は outbox 発火のみのため `ingestion_jobs` + `outbox_events` 行存在を検証

### 実装上の補足

- 失敗注入用プロバイダ（`ThrowingLLMProvider` / `ThrowingOCRProvider` / `ThrowingSanitizer`）と特定値返却用 stub（`StubOfficeOk` / `StubPDFTextual` / `StubPDFScanned` / `StubOCROk` / `StubSpeechOk`）はすべて `runIngestionJob.integration.test.ts` 内のローカルクラス。共通 fake には触っていない（ADR-002 準拠）
- `daily_upload_quota_exceeded` テストの seed は `createdAt = new Date().toISOString()` で行う必要がある。`sumByteSizeByOwnerSince` が `createdAt >= now - 24h` でフィルタするため、`iso(0) = "2026-01-01T00:00:00.000Z"` のような過去日付の seed は SUM=0 として扱われ、quota gate が発火しない
- `pdfScanned` 経路は `kind: "pdfScanned"` を直接 seed して検証。`IngestionService.detectKind` は PDF MIME を常に `pdfTextual` と推測する設計のため、`pdfScanned` 経路は upload 経由では到達できない
- MIME 偽装シナリオは `application/pdf` を装ったテキストで `StubPDFExtractor`（デフォルト）の `BusinessRuleError(UnsupportedFormat)` を踏ませる形にした。`text/html` を装ったバイナリでは HTML パイプライン（UTF-8 → サニタイズ）が成立してしまうため
- `TempFileStorage` 港は `has(key)` を持たないため、`as unknown as { has(key): boolean }` で `FakeTempFileStorage` の機能にアクセス
- 直接 insert はすべて `version: 0` を指定（OCC trigger 回避）
- `seedInstanceSettings` は各 it 冒頭で seed（`beforeEach` が `instance_settings` を DELETE するため、quota / size cap を要するテストでは必須）

### 既知の制限

- なし。spec/testcases/ingestion/index.md の全 7 セクションを 1:1 で網羅。`it.todo` は 0 件

### Phase 4 で起票予定の Issue

- ADR-004 #5: UploadFile の `unsupported_format` / `size_exceeded` の spec 文言を `IngestionErrorCode.*` に合わせる
- ADR-004 #6: Regenerate / Commit / Discard の `invalid_status_for_*` の spec 文言を `IngestionErrorCode.InvalidState*` に合わせる
- ADR-004 #7: Get* の spec 文言 `AuthorizationError` を `ForbiddenError` に合わせる
- ADR-004 #4: UploadFile の spec「Queue enqueue」を「outbox 発火」に合わせる（既存）

