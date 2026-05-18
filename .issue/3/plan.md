# 実装計画 — Issue #3: [spec-sync] frontend: P46 管理者ジョブ監視画面が未実装（metrics.tsx は別物）

**Issue:** #3
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

`spec/pages/index.md` の `P46 管理: ジョブ監視画面` 仕様と実装の乖離を解消する。`/admin/jobs` を新規ルートとして追加し、以下を提供する。

- 取り込みジョブ（ingestion）一覧（全ユーザー横断）
- エクスポートジョブ（export）一覧（全ユーザー横断）
- メディア孤児クリーンアップ／ゴミ箱自動パージ／期限切れエクスポート artifact 削除の状況表示
- 失敗ジョブの再実行（spec G3）

関連シナリオ:
- **G3**: 失敗ジョブは再試行ボタンを表示 — 本 Issue で UI + retry 遷移を実装。実行配線は ADR-002 のとおり別 Issue。
- **B2 / C4 異常系**: 一部失敗の ingestion / アップロード失敗 → 当該失敗ジョブは admin 一覧に表示される（Step 2 の `findRecent` で自動カバー）。
- **H4 異常系（自動パージジョブの失敗 → アラート表示）**: 履歴永続化が前提で本 Issue のスコープ外。Phase 4 で別 Issue を起票する（ADR-003）。

## スコープ

### 含まれるもの

1. 取り込み／エクスポートジョブの全ユーザー横断 read-only リスト用 port メソッド + D1 adapter 実装
2. 取り込み／エクスポートジョブの D1 インデックス追加（`updated_at` 単独 sort 用）
3. 失敗 → pending を許す `retry` ドメイン遷移（ingestion / export）と event 追加
4. 上記を駆動する admin 専用 usecase 2 本（`retryIngestionJob` / `retryExportJob`）
5. `/admin/jobs` ルート + サーバーコンポーネント + クライアントコンポーネント
6. AdminLayout ナビへの「ジョブ監視」追加
7. メディア孤児・ゴミ箱・期限切れエクスポートのセクションは「cron 駆動・実行履歴非保持」と画面に明示（追加実装なし、ADR-003）
8. 上記に対応する domain ユニット / application 統合テスト
9. failed 行は一覧上部にピン留めして G3 の意図（失敗を素早く検知）を満たす

### 含まれないもの

- ジョブ listing 用 usecase の新設 — UsersTable パターン（page server component で `requireAdminUser` 後、`loadXxx` から直接 repository を呼ぶ）に揃える
- 実行履歴テーブルの新設（メディア孤児／ゴミ箱／期限切れエクスポート の "last run" 永続化）
- メディア孤児・ゴミ箱・期限切れエクスポート の admin 手動キック UI
- ジョブのページング、ステータスフィルタ、検索（spec が要求していない）
- owner 名解決（`username` / `displayName` 表示）— `ownerId` のみ表示
- 既存 `metrics.tsx`（利用状況メトリクス）への変更
- ingestion / export ワーカー実行配線そのもの（queue consumer から `runIngestionJob` / `runExportJob` を呼ぶ配線。ADR-002）
- H4 異常系の自動パージ失敗アラート（履歴永続化が前提のため）

## 実装ステップ

### 1. ドメイン層: `retry` 遷移を追加

- **対象ファイル:**
  - `app/core/domain/ingestion/entity.ts` — `IngestionJob.retry(job: FailedIngestionJob, now): WithEventDrafts<PendingIngestionJob, IngestionEvent>` を追加。`status: 'pending'` へ戻し、`errorCode`/`errorReason`/`preview` を `null` リセット、`version.next()`、`updatedAt` 更新。`tempStorageKey === null` の failed job は domain エラーで拒否（コード命名は既存 `IngestionErrorCode` の規約 `INGESTION_*` に従い `INGESTION_INVALID_STATE_FOR_RETRY` / `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` を追加）。
  - `app/core/domain/ingestion/events.ts` — `IngestionEvents.retryRequested` を追加。
  - `app/core/application/ingestion/eventDecoders.ts` — `ingestion.retryRequested` のデコーダ登録（consumer 側で `unknown event type` にならないように）。
  - `app/core/domain/export/entity.ts` — `ExportJob.retry(job: FailedExportJob, now): WithEventDrafts<PendingExportJob, ExportEvent>` を追加。`status: 'pending'` へ戻し、`completedAt: null` リセット、`progress` リセット、`errorCode`/`errorReason` を `null`、`failedNoteIds` を空配列 `[]` に戻す。
  - `app/core/domain/export/events.ts` — `ExportEvents.retryRequested` を追加。
  - `app/core/application/export/eventDecoders.ts` — `export.job.retryRequested` のデコーダ登録。
  - 必要に応じて domain ユニットテストを追加（`__tests__/`）。
- **理由:** spec G3 が再実行ボタンを明示。`failed → pending` の遷移はドメインに存在せず、entity 一級の純粋遷移として追加することで OCC / event drafts / 不変条件をすべて domain 側に閉じ込められる（adapter にロジックが漏れない）。

### 2. ポート拡張: admin 横断 listing

- **対象ファイル:**
  - `app/core/domain/ingestion/ports/ingestionJobRepository.ts` — `findRecent(opts: { limit: number; offset?: number }): Promise<readonly IngestionJob[]>` を追加。JSDoc に「admin 用 read-only 取得。OCC 書き込み対象ではない」と明記。
  - `app/core/domain/export/ports/exportJobRepository.ts` — 同様に `findRecent` を追加。
- **理由:** 既存 `findByOwner` は actor 所有のみ。admin 監視では全ユーザー横断が必要。引数を `ownerId` 任意にせず別メソッドにすることで意図が明確になる。

### 3. アダプター実装 + D1 マイグレーション

- **対象ファイル:**
  - `app/core/adapters/d1/repositories/ingestionJobRepository.ts` — `findRecent` を実装。`ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`。`mapDbError` でラップ。
  - `app/core/adapters/d1/repositories/exportJobRepository.ts` — 同様。
  - `app/core/adapters/d1/schema.ts` — `idx_ij_updated_at`（ingestion_jobs.updated_at DESC, id DESC） / `idx_export_jobs_updated_at`（export_jobs.updated_at DESC, id DESC）を追加。
  - `migrations/00XX_admin_job_listing_indexes.sql`（新規） — 上記 index 追加 DDL。
- **理由:** ドライバ固有エラーを共通エラー契約に翻訳する既存パターンに準拠。`(status, updated_at)` 複合 index は status を WHERE で絞らない sort では使えないため、`updated_at` 単独 index を事前追加してプロダクションでのフルスキャン化を回避する。

### 4. アプリケーション層: 失敗ジョブ再実行 usecase

- **対象ファイル:**
  - `app/core/application/ingestion/retryIngestionJob.ts`（新規） — `assertAdmin(userRepository, actorUserId)` → UoW で `ingestionJobRepository.findById` → `IngestionJob.retry(failed, now)` → `save(entity, expectedVersion)` → `collectEvents`。`failed` 以外の状態は domain で `BusinessRuleError('INGESTION_INVALID_STATE_FOR_RETRY')`、`tempStorageKey === null` は `BusinessRuleError('INGESTION_NO_TEMP_STORAGE_FOR_RETRY')`。
  - `app/core/application/export/retryExportJob.ts`（新規） — 同様。export は `tempStorageKey` 不変条件はなく `failed` 以外で `BusinessRuleError`。
  - 各々の `__tests__/<name>.integration.test.ts` を追加。
- **理由:** spec G3 を満たす最小実装。Outbox / event 経由のジョブ起動配線が未整備（ADR-002）のため、本 Issue では retry 遷移と event 発行までを担う。実行配線は別 Issue。
- **配置:** `adminSettings/` 配下ではなく対応するドメイン直下に置く。理由は (a) `retryIngestionJob` は ingestion ドメインの遷移を駆動する usecase で、`adminSettings/` の用途（管理者向け設定の編集系）と性質が異なる、(b) 既存の owner-scoped な `getIngestionJobs.ts` 等と並べた方が grep で見つけやすい。`assertAdmin` を usecase 冒頭で呼ぶことで境界は保証する。

### 5. プレゼンテーション層: ページ + ナビ

- **対象ファイル:**
  - `app/routes/admin/jobs.tsx`（新規） — `metrics.tsx` を雛形に `JobsPage` を動的 import + `renderServerComponent`。
  - `app/components/admin/Jobs/Page.tsx`（新規、server component） — `requireAdminUser` → `loadJobsSnapshot()` → セクション分けレイアウト。
  - `app/components/admin/Jobs/index.tsx`（新規、`"use client"`） — テーブル 2 種（ingestion / export）+ クリーンアップ 3 種の説明セクション。テーブル内で `status === 'failed'` 行を先頭にソート、「再実行」ボタンを失敗行に表示。`useServerFn` + `useTransition` で server fn 呼び出し → `router.invalidate()`。失敗時は `displayError` でメッセージ表示。
  - `app/components/admin/Jobs/action.ts`（新規） — `loadJobsSnapshot = cache(serverData(...))` で `unitOfWorkProvider.run` 内から `ingestionJobRepository.findRecent` / `exportJobRepository.findRecent` を `Promise.all` で並列実行し、DTO 化して返す。`retryIngestionJobFn`, `retryExportJobFn` は `createServerFn({ method: 'POST' }).inputValidator(validateInput(targetIngestionJobSchema)).handler(...)` で `requireAdminUser` → 動的 import → usecase 呼び出し。
  - `app/components/admin/schema.ts` — `targetIngestionJobSchema` / `targetExportJobSchema`（`z.object({ jobId: z.string().min(1).max(200) })`）を既存集約 schema に追加。`Jobs/schema.ts` は作らない。
  - `app/routes/admin/route.tsx` — `AdminNavItem['to']` ユニオンに `"/admin/jobs"` を追加。`ADMIN_NAV` に `{ to: "/admin/jobs", label: "ジョブ監視" }` を `/admin/metrics` の直後に追加。`import "@/components/admin/Jobs/action";` を side-effect import 群に追加。
- **理由:**
  - admin listing で page server component が `requireAdminUser` を通すパターン（`UsersTable/Page.tsx` 参照）に揃え、`loadJobsSnapshot` 側で usecase を介さず repository を直接呼ぶ。これは UsersTable パターン（`loadAdminUsers`）と一致し、二重 admin チェックを避ける。
  - retry は副作用のあるミューテーションなので usecase + `assertAdmin` 経由を維持（UsersTable の `updateUserStatusFn` 等と同じ構成）。
  - schema 集約場所も既存規約（`app/components/admin/schema.ts`）に従う。

### 6. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit && pnpm test:integration`
- manual-test スキルでブラウザ検証

## 設計判断

- **ADR-001**: `failed → pending` の `retry` 遷移をドメイン一級として追加する（adr.md 参照）。
- **ADR-002**: 再実行は retry 遷移 + Outbox イベント発行までを担い、queue consumer 配線は別 Issue 化する。
- **ADR-003**: メディア孤児・ゴミ箱・期限切れエクスポート のセクションは説明文表示に留め、追加実装はしない。H4 異常系の自動パージ失敗アラートは履歴永続化が前提のため Phase 4 で別 Issue 化する。

## リスクと注意点

- **既存実装箇所の網羅**: port に method 追加するため、`IngestionJobRepository` / `ExportJobRepository` を実装している箇所（adapter / fake / mock）すべてに `findRecent` の実装追加が必要。grep で網羅する。
- **N+1 リスク**: admin listing は `ownerId` 文字列のみ表示する。`username` / `displayName` 解決はスコープ外。
- **retry 押下の連打 / 同時押下**: client 側で `useTransition` + ボタン `disabled` で抑える。サーバ側は OCC（`expectedVersion` 不一致時の `ConflictError`）で二重押下を検出。`displayError` で `ConflictError` を可読な日本語に翻訳できるかを manual-test で確認。
- **再実行しても動かない問題**: ADR-002 の通り queue consumer が ingestion/export を実行しない。manual-test では retry 後のジョブが `pending` に戻ること・Outbox に event が乗ることまでを検証し、実際の処理進行は別 Issue とする。UI 上は「再実行を受け付けました」のトーストのみ。
- **temp blob 喪失パターン**: ingestion の retry は `tempStorageKey !== null` を要件とするが、blob 自体が物理削除済みのケースまでは domain で判定できない。配線復旧後に再度 `temp_storage` エラーで failed に落ちる可能性がある。manual-test の対象外として「temp blob が物理存在することは前提」と明記。
- **DB インデックス**: 事前に `(updated_at DESC, id DESC)` の単独 index を追加して MVP 段階のフルスキャン化を防ぐ（Step 3 で migration 追加）。

## テスト方針

### ドメインユニット
- `IngestionJob.retry` / `ExportJob.retry` の遷移可能・不可能状態、`tempStorageKey === null` の ingestion 拒否、`completedAt: null` への戻り（export）、`version` 増加、event drafts 1 件含むこと、`errorCode`/`errorReason`/`preview`/`failedNoteIds` のリセット。

### アプリケーション統合
- `retryIngestionJob` / `retryExportJob`: 非 admin → `ForbiddenError`、存在しない job → `NotFoundError`、`failed` 以外 → `BusinessRuleError`、`failed` での成功 + outbox に retryRequested イベントが乗ること。

### アダプター統合（既存パターンに合わせて任意）
- `D1IngestionJobRepository.findRecent` / `D1ExportJobRepository.findRecent` の order / limit / offset 正当性、複数 owner 横断確認。

### 手動テスト（manual-test スキル）
- `/admin/jobs` を admin で開き、各セクションが表示される。
- 取り込み / エクスポートのテーブルに failed / pending / processing / completed ジョブが表示される。failed 行が上部に表示される。
- 失敗行の「再実行」ボタン押下 → トースト表示 → 一覧再読込で `pending` に戻り failed から消える。
- `failed` 以外の状態には再実行ボタンが表示されない（あるいは押下しても `BusinessRuleError` で displayError 表示）。
- 非 admin ユーザーで `/admin/jobs` を開くと 403 ページ。
- 既存 `/admin/metrics` / `/admin/users` 等が壊れていない。
- 同時 retry（オプション）: 2 タブで同じ failed job を retry → 片方が `ConflictError` 相当のメッセージ表示。

## レビュー反映

### 修正した点
- **R1-P-001 / R1-S-003**: H4 異常系の自動パージ失敗アラートはスコープ外と明記し、Phase 4 で別 Issue を起票する旨を adr.md と plan の "含まれないもの" に追加。
- **R1-P-002 / R2-P-004**: `ExportJob.retry` で `completedAt: null` リセットを明記。
- **R1-P-003**: `failedNoteIds` は空配列 `[]` に戻すと明記。
- **R1-P-004**: queue consumer 配線が別 Issue であることを Phase 4 で起票し、UI 文言は「再実行を受け付けました」とする旨を ADR-002 に補強。
- **R2-P-001**: temp blob 喪失パターンをリスク欄に明記し、manual-test 対象外とした。
- **R2-P-002**: listing 用 usecase を新設せず UsersTable パターン（`loadJobsSnapshot` が直接 repository を呼ぶ）に統一。これに伴い Step 4 を「retry usecase 2 本のみ」に縮小し、Step 5 の `loadJobsSnapshot` 仕様を更新。
- **R2-P-003**: schema は `app/components/admin/schema.ts` 集約に追加し、`Jobs/schema.ts` は作らない。
- **R2-S-001**: DB インデックス追加 migration を Step 3 に組み込み（事前判断）。
- **R2-S-002**: event decoder 更新を Step 1 対象に明記。
- **R2-S-004**: エラーコード命名を `INGESTION_*` SCREAMING_SNAKE に統一。

### 取り込んだ改善提案
- **R1-S-001**: B2/C4 由来の failed が admin 一覧に出ることを目的セクションに明記。
- **R1-S-002**: failed 行を上部にピン留めする UI 仕様を Step 5 に追加。
- **R2-S-005**: 同時 retry シナリオを manual-test に追加（オプション）。

### 見送った提案とその理由
- **R2-S-003**: usecase 配置 ADR — listing usecase 自体を廃止したため判断不要。retry usecase は対応ドメイン直下に置く理由を Step 4 に短く記載。
- **R2-S-006**: owner 名解決 — ADR-002/003 と同じく本 Issue の意図（spec 乖離解消）を超える機能追加で YAGNI。`ownerId` 文字列表示で受け入れる。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキ) | エージェント2 (保守性) | エージェント3 (シンプル) |
|------|------|------|------|
| ベース採用 | × | ○ | × |
| 取り込んだ点 | 「クリーンアップは表示のみで手動トリガー不出」 | retry entity 遷移 + admin 横断 port メソッド構成 | YAGNI（フィルタ／ページング省略、ownerId 文字列のみ表示、クリーンアップ追加実装なし） |
| 見送った点 | `JobMonitorProvider` ポート新設・`getJobMonitorSnapshot` 集約 usecase は YAGNI 過多 | purger 手動キックラッパは ADR-003 でスコープ外、listing usecase 新設は UsersTable パターン優先で却下 | 再実行未実装は spec G3 違反のため不採用 |
