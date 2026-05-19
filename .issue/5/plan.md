# 実装計画 — Issue #5: [spec-sync] tests: note / media / ingestion でアプリケーション層 integration test が完全に欠落

**Issue:** #5
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

`spec/testcases/{note,media,ingestion}/index.md` で定義されたユースケース単位のテストケースを、アプリケーション層の integration test として実装し、3 ドメインの仕様カバレッジを identity / directory / tag と同等水準まで引き上げる。

## スコープ

### 含まれるもの

- `app/core/application/note/__tests__/` 配下に note ユースケースの integration test を追加
- `app/core/application/media/__tests__/` 配下に media ユースケースの integration test を追加
- `app/core/application/ingestion/__tests__/` 配下に ingestion ユースケースの integration test を追加
- spec/testcases/{note,media,ingestion}/index.md に記載された **全ケース** をトレース可能な形で実装
- LLM / OCR / 抽出系の失敗パスを再現するためのテストファイル内ローカル stub クラス（fake 共通モジュールには追加しない）

### 含まれないもの

- ユースケース本体・ドメインロジックの修正（テスト実行中にバグを発見した場合はテストは `it.todo` 化し、別 Issue で修正）
- `app/core/application/__tests__/helpers.ts` や `__tests__/fakes/` への追記・改変
- 共通 seed helper モジュールの新設
- `app/core/application/note/__tests__/eventDecoders.test.ts` 等の既存 event decoder テストの変更
- spec/testcases に書かれていない追加ケース・リファクタリング
- **`bulkTrashNotes` のテスト**: `app/core/application/note/bulkTrashNotes.ts` は実装済みだが `spec/testcases/note/index.md` には未記載のため本 Issue のスコープ外。spec/testcases 側補完は別 Issue で扱う（Phase 4 で起票検討）

## 実装ステップ

### ファイル分割方針（決定: ユースケース or ライフサイクル単位）

identity は 1 ファイル 1600 行で巨大化しすぎ・directory / tag は 1 ファイル 600〜700 行で許容範囲という現状を踏まえ、note は **ユースケース or ライフサイクル単位** で分割する。media / ingestion は規模が中程度のため **1 ドメイン 1〜2 ファイル**を基本とする。

複数 usecase を 1 ファイルに束ねる場合は **usecase ごとに `describe` を分ける**（例: `trashLifecycle` は `describe("deleteNote")` / `describe("restoreNote")` / `describe("purgeNote")` / `describe("purgeTrashOlderThan")` の 4 describe）。

### 1. note: 10 ファイル（既存 1 + 新規 9）

各ファイル先頭コメントに spec/testcases/note/index.md の対応セクションを明記する。**spec 表 1 行 = 1 `it`** を原則とし、it 名は spec 表の「期待結果」を平叙化した一文とする。

| # | ファイル | spec カバレッジ |
|---|---|---|
| 1.1 | `createNote.integration.test.ts` （新規） | CreateNote 7 ケース |
| 1.2 | `saveNote.integration.test.ts` （新規） | SaveNote 8 ケース |
| 1.3 | `saveNoteDraft.integration.test.ts` （新規） | SaveNoteDraft 3 ケース |
| 1.4 | `renameNote.integration.test.ts` （新規） | RenameNote 3 ケース |
| 1.5 | `moveNote.integration.test.ts` （新規） | MoveNote 3 ケース + BulkMoveNotes 1 ケース（usecase ごと describe を分ける） |
| 1.6 | `trashLifecycle.integration.test.ts` （新規） | DeleteNote 2 + RestoreNote 3 + PurgeNote 1 + PurgeTrashOlderThan 1 = 計 7 ケース（同一 fixture をライフサイクル中で連鎖検証） |
| 1.7 | `editLock.integration.test.ts` （新規） | AcquireEditLock 4 + ExtendEditLock 2 + ReleaseEditLock 1 = 計 7 ケース |
| 1.8 | `listNotesByOwner.integration.test.ts` （既存に追記） | ListNotesByOwner 4 ケース + ListNotesInDirectory 1 ケース。既存ケース（visibility 投影 / フィルタ）と重複しない範囲で追加 |
| 1.9 | `getNoteDetail.integration.test.ts` （新規） | GetNoteDetail 4 ケース + GetBacklinks 1 ケース |
| 1.10 | `duplicateNote.integration.test.ts` （新規） | DuplicateNote 3 ケース |

### 2. media: 2 ファイル

| # | ファイル | spec カバレッジ |
|---|---|---|
| 2.1 | `media.integration.test.ts` （新規・主） | UploadMedia 3 + UploadMediaPresigned 1 + FinalizeUpload 2 + AttachMediaToNote 1 + DetachMediaFromNote 1 + ListMediaByOwner 1 + DownloadMedia 4 ケース実装 + 1 ケースは `it.todo` + HandleNotePurgedEvent 2 ケース。usecase ごとに `describe` を分ける |
| 2.2 | `purgeOrphans.integration.test.ts` （新規） | PurgeOrphans 3 ケース。固定 clock と R2 削除失敗 stub を要するため分離 |

**DownloadMedia の仕様乖離**: `app/core/application/media/downloadMedia.ts:72` は `viaShareLinkId` を `void` するだけで share_link 検証を行わない（`MediaService.assertViewableBy` が unlisted を viewable 扱い）。spec 表 5 経路のうち実装可能なのは「owner / 他人 public / 他人 private / 他人 unlisted」の 4 ケースのみ。「他人 unlisted + viaShareLinkId 未指定 → BusinessRuleError」は **`it.todo` で残し、別 Issue を Phase 4 で起票**する。ADR-004 参照。

### 3. ingestion: 2 ファイル

| # | ファイル | spec カバレッジ |
|---|---|---|
| 3.1 | `ingestion.integration.test.ts` （新規・主） | UploadFile 4 ケース（対応形式 / 対応外 / サイズ超過 / 当日上限） + RegenerateIngestionPreview 3 + CommitIngestionPreview 4 + DiscardIngestionPreview 3 + GetIngestionJob 1 + GetIngestionJobs 1 + BulkUpload 1 = 計 17 ケース。usecase ごとに describe |
| 3.2 | `runIngestionJob.integration.test.ts` （新規） | RunIngestionJob 10 ケース（HTML / Markdown / Office / PDF textual / PDF scanned / 画像 / 音声 + LLM/OCR/sanitize 失敗 3 種） + 「UploadFile の MIME 偽装」連鎖シナリオ 1 ケース = 計 11 ケース |

**UploadFile の検証範囲**: spec 表「Queue enqueue」は実装に `enqueue` 呼び出しがないため、テストでは **`ingestion_jobs` 行と `outbox_events` 行（type 該当）の存在** までを assert する。Queue 検証は対象外（実装が outbox 経由のためそちらで担保）。

### 4. テストファイル内で共通する書き方

- `import { setupTestContainer, type TestContainer } from "../../__tests__/helpers";`
- `const getContainer = setupTestContainer();` を各ファイルで宣言
- `seedUser / seedDirectory / seedNote / seedTag / seedMedia / seedPublicationState / seedShareLink / seedInstanceSettings / seedIngestionJob` などはファイル内 private で定義（既存 `listNotesByOwner.integration.test.ts` / `tag.integration.test.ts` の流儀踏襲）
- 単調インクリメントカウンタ + UUIDv7 風プレフィックスで ID 生成、直接 insert は必ず `version: 0`
- **エラー検証**:
  - `try / await usecase() / expect.fail("should have thrown") / catch (e) { ... }` を踏襲
  - **catch ブロックでは必ず型ガード後の `else` で `throw error` か `expect.fail(...)` を入れる**（想定外型を sinkhole にしない）
  - `BusinessRuleError` の検証は `isBusinessRuleError(e) && e.code === MediaErrorCode.X` のように `code` まで照合
  - **spec 表の文言と実装のエラー型が一致しない場合は実装に合わせて検証する**（例: UploadMedia サイズ超過は spec で `ValidationError` だが実装は `BusinessRuleError(MediaErrorCode.ByteSizeExceeded)`。`StorageUnavailableError` は実装が `SystemError(ExternalApiError)` にラップ）。乖離は ADR-004 に列挙する
- **Outbox 検証**:
  - `container.db.select().from(schema.outboxEvents)` 直読み、`type` 一致と `aggregateId` 一致まで確認（payload 詳細は eventDecoders.test.ts が担保）
  - 「該当行 1 件存在 + 他タイプの誤発火がない」までを assert
  - spec 表の Outbox type 名（`note.deleted` / `note.saved` / `note.purged` 等）は `app/core/application/{note,media,ingestion}/eventDecoders.ts` の `KnownEventType` と必ず突き合わせる

### 5. 時間決定論が必要なテスト

`PurgeOrphans`（24h）/ `PurgeTrashOlderThan`（30 日）/ ロック期限切れの試験では `container.clock` を上書きする小ヘルパーをテストファイル内で定義する。

```ts
function withFixedClock(c: TestContainer, t: Date): TestContainer {
  return { ...c, clock: { now: () => t } };
}
```

**スコープの注意**: `withFixedClock` は usecase 直読みの `container.clock.now()` のみ差し替える。`D1UnitOfWorkProvider` 内部に閉じ込められた `SystemClock`（`outbox.created_at` 等の row 時刻）は差し替えられない。**時刻 assert は usecase 戻り値 or aggregate row（`notes.trashedAt`, `media_assets.purgedAt` 等）で行い、outbox row の時刻列は assert 対象としない**。`helpers.ts` には触らない。

### 6. 失敗系プロバイダの差し替え

`FakeLLMProvider` への `setStructureError` 追加など、共通 fake への手入れは行わない。代わりに **テストファイル内ローカルクラス** で対処する。

```ts
// 失敗注入用
class ThrowingLLMProvider implements LLMProvider {
  async structureToHtml(): Promise<never> { throw new Error("llm_failure"); }
  async suggestMetadata(): Promise<never> { throw new Error("llm_failure"); }
}

// 特定値返却用（PDF scanned パスの OCR ループ検証など）
class StubPDFExtractorScanned implements PDFExtractor {
  async extract() { return { textual: false, text: null, pageImages: [...] }; }
}
```

OCR / Speech / Office / PDF も同様にローカル subclass で対応。`container.objectStorage` の失敗版 `ThrowingObjectStorage` も同じパターン。identity が `EnvSetupTokenVerifier` を per-test override する流儀と整合。

### 7. media DownloadMedia の可視性経路

`publication_states` を seed して `owner / 他人 public / 他人 private / 他人 unlisted` の 4 経路を検証する。share_link 検証は実装が `void` 扱いのため、`unlisted + viaShareLinkId 未指定 → BusinessRuleError` ケースは `it.todo` で残し、Phase 4 で別 Issue を起票する（ADR-004）。

### 8. ingestion の I/O 準備

- `instance_settings` は `beforeEach` で DELETE されるため、quota / format / size limit を要するテストではテスト先頭で seed する
- `FakeTempFileStorage.has(key)` で temp 削除を検証
- `runIngestionJob` の各経路は `FakeLLMProvider.setStructureResult` + 既存 Stub 系の挙動でカバー、失敗系・特定値返却はローカル subclass

### 9. 検証

- 各ファイル追加直後は `pnpm vitest run app/core/application/<domain>/__tests__/<file>` で単体走行（`pnpm test:integration -- <name>` よりフィードバックが早い）
- 全体走行: `pnpm test:integration`
- 最終: `pnpm typecheck && pnpm lint:fix && pnpm format`
- spec/testcases/{note,media,ingestion}/index.md の表行と `describe / it` 名を 1:1 で目視照合（13 ファイルあり見落としやすいため、各 describe 冒頭に spec ファイルへのアンカーコメントを記載）

## 設計判断

実装中に特筆すべき判断が発生したら `.issue/5/adr.md` に追記する。計画段階で確定した判断:

- **ADR-001 ファイル分割方針**: note は usecase/ライフサイクル単位、media/ingestion は 1〜2 ファイル
- **ADR-002 共通 fake への変更を行わない**: 失敗系はローカル subclass で対処
- **ADR-003 spec ケース完全網羅**: spec 表の全行を 1:1 で実装、`it.todo` 化は実装乖離時のみ
- **ADR-004 spec ⇔ 実装の乖離記録**: DownloadMedia の share_link 未参照、UploadMedia の ValidationError / StorageUnavailableError 表記など、テストで判明した spec/実装乖離を本 ADR に列挙し、Phase 4 で別 Issue 起票

## リスクと注意点

- **テスト走行時間**: 全 3 ドメイン合計 ~80 ケース + isolate 数 14 ファイル分。`singleWorker: true` 構成下で `vitest-pool-workers` の isolate 立ち上げコストが累積する。完了後の `pnpm test:integration` 時間を観測し、許容外なら note のファイル分割数を減らす（次の PR で再検討）
- **実装側バグの発見**: テストを書いた結果、既存ユースケースが spec と異なる挙動を取るケース → テストは failing で残さず `it.todo` 化、ADR-004 に記録、Phase 4 で別 Issue 起票
- **TRUNCATE 順序依存**: setup.ts の DELETE 順は `note_media_refs → media_assets → notes` のように RESTRICT FK 順。新規テストで `notes` と `media_assets` を直接 insert する場合は seed 順が逆順になる
- **`_occ_guard` 不変条件**: 直接 insert は trigger 対象外。version は必ず `0` を指定
- **PR 規模**: 期待コード量は ~3000 行。レビュー観点を絞るため **コミットを note / media / ingestion 単位で 3 分割**する（PR 自体は 1 本）

## テスト方針

- 各テストの実行隔離は `setupTestContainer()` の per-test fresh container + setup.ts の TRUNCATE で担保
- spec 表 1 行 = 1 `it`、`describe` の冒頭コメントに spec ファイルへのパス + セクション名を明記
- DB row 直読みで row 数・列値・version カラム・FK 整合を確認
- Outbox は `schema.outboxEvents` 直読みで `type` + `aggregateId` まで
- 時間依存テストはローカル `withFixedClock` で `container.clock` を差し替え

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | ○ | × |
| 取り込んだ点 | 失敗系の test-local subclass、clock override、_occ_guard / FK 順の注意、PR 規模試算 | ファイル分割（ユースケース/ライフサイクル単位）、spec 1 行 = 1 it、ライフサイクル束ね | helpers.ts / fakes に触らない方針、fake 拡張回避、event decoder 重複回避 |
| 主な不採用理由 | note を 1 ファイル集約は identity 巨大化失敗例の再現になる | spec 全網羅を強調する点はそのまま採用 | 代表ケース止まりは Issue 文言「定義されたケースを追加する」と乖離 |

## レビュー反映

### 修正した点
- **[R1 P-001]** BulkTrashNotes は spec/testcases 未記載のためスコープ外と「含まれないもの」に明記。Phase 4 で別 Issue 起票検討
- **[R1 P-002]** 各セクションの spec ケース数を明示的に併記（UploadMediaPresigned 1 / FinalizeUpload 2 など）
- **[R1 P-003]** MIME 偽装は runIngestionJob ファイルに置く旨を 3.2 に明記
- **[R2 P-001]** DownloadMedia は 4 経路実装 + 1 `it.todo`。share_link 未参照を ADR-004 に記録、Phase 4 で別 Issue
- **[R2 P-002]** spec 文言と実装エラー型の乖離（UploadMedia ValidationError 等）を section 4 に明記、ADR-004 に列挙
- **[R2 P-003]** UploadFile の「Queue enqueue」は ingestion_jobs/outbox 行存在まで検証する旨を 3.1 に明記
- **[R2 P-004]** Outbox type 名は `eventDecoders.ts` の `KnownEventType` と突き合わせる手順を section 4 に追加
- **[R2 P-005]** `withFixedClock` のスコープ（usecase 直読み clock のみ、outbox row 時刻は差し替え不可）を section 5 に明記
- **[R2 P-006]** catch ブロックのフォールスルー注意を section 4 に明記
- **[R2 P-007]** MoveNote/BulkMoveNotes など複数 usecase を 1 ファイルに束ねるとき `describe` を usecase 単位で分ける旨をファイル分割方針に明記

### 取り込んだ改善提案
- **[R1 S-001]** describe 冒頭に spec パスのアンカーコメントを記載（後続 spec-sync 用）— section 9 に追加
- **[R1 S-002]** Outbox 検証は「該当行存在 + 他タイプの誤発火がない」まで含める旨を section 4 に明記
- **[R1 S-003]** PurgeOrphans の R2 失敗 stub のクラス名（`ThrowingObjectStorage`）を section 6 に例示
- **[R2 S-001]** PDF/Office の「特定値返却用 subclass」を section 6 に追加
- **[R2 S-002]** 単体走行は `pnpm vitest run <path>` で個別走行する旨を section 9 に追記
- **[R2 S-003]** Attach/Detach の `media_assets.status` 遷移検証指針を section 4 に追記（暗黙的に「DB row 直読み」に含まれているが追記不要と判断 — 詳細は実装時に展開）

### 見送った提案とその理由
- **[R1 S-004]** version=0 強制の型レベルガード — 共通 helper の新設につながりスコープ拡大、本 Issue 範囲外
- **[R2 S-004]** PR コミット分割の精緻化（事前確認コミット排除） — 既に「note/media/ingestion 単位で 3 分割」を採用済みで十分
