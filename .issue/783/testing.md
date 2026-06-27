# 動作確認計画 — Issue #783: prune terminal-state job rows (export_jobs / tag_merge_jobs) on a retention window

**Issue:** #783
**作成日:** 2026-06-27

---

## 確認環境

このIssueは UI を持たない pruner Worker（daily cron）の変更。確認の主軸は自動テスト（unit / integration）。pruner Worker は `pnpm dev` / `pnpm start` では起動しないため、ブラウザでの手動確認は対象外。スキーマ／マイグレーション変更はない（`idx_export_jobs_updated_at` / `idx_tag_merge_jobs_updated_at` は既存）。

### 検証環境の起動（自動テスト）

```bash
# 型チェック（WorkerContainer への jobStatePruner 追加の波及・共有テストヘルパー含む）
pnpm typecheck

# unit テスト（pruneExportJobs / pruneTagMergeJobs の cutoff 計算・ログ、runPruneTick の best-effort 隔離・purge 前段実行順）
pnpm test:unit

# integration テスト（D1 実DB での終端フィルタ DELETE 境界、completed 除外、非終端保持、daily tick happy path）
pnpm test:integration
```

### 検証環境の起動（ローカル D1 での実挙動確認 — 任意）

ローカル D1 に直接 SQL を流して刈り込み境界を目視確認したい場合:

```bash
# ローカル D1 にマイグレーション適用（未適用時のみ。本Issueは新規マイグレーションなし）
pnpm db:apply:local

# 任意の SQL ファイルをローカル D1 に実行（確認用 SELECT / seed）
pnpm db:execute:local <SQLファイルパス>
```

`export_jobs` / `tag_merge_jobs` に各 status・各 `updated_at` の行を seed し、`updated_at` の境界で削除・保持を SELECT で目視する用途。

### デプロイ方法

ステージング pruner Worker への反映:

```bash
pnpm deploy:staging:pruner:dry   # ドライラン（ビルド検証のみ、デプロイしない）
pnpm deploy:staging:pruner       # 実デプロイ
```

本番 pruner Worker への反映:

```bash
pnpm deploy:production:pruner:dry   # ドライラン
pnpm deploy:production:pruner       # 実デプロイ
```

- retention env var `EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` は `wrangler.toml` / `wrangler.staging.toml` / `wrangler.production.toml` の `[env.pruner.vars]` に置く（デプロイ時に反映。未設定なら既定7日）。
- purge 配線に伴い、pruner env へ `OBJECT_STORAGE` r2_bucket バインディング + `R2_OBJECT_BUCKET_NAME` var を追加する。presign 3 secret（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`）は SOPS で deploy 時注入する運用前提。**この binding/secret が揃わないと purge の `objectStorage.delete` が `StorageUnavailableError` を throw し（per-row catch で tick は継続するが）prod で R2 artifact が削除されず orphan が残る**ため、ステージング／本番反映時に pruner env の R2 設定が揃っているかを必ず確認する（`pnpm deploy:staging:pruner:dry` のビルドだけでは検出できない運用前提）。

## 確認項目

### 1. cutoff より古い tag_merge_jobs の終端行が刈られる

- **対応する受け入れ基準:** AC-1
- **目的:** retention を超えた `tag_merge_jobs` の `completed` / `failed` 行が削除されること。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. `jobStatePruner.integration.test.ts` の tag_merge ケース（古い `completed` / `failed` が削除、`deleted` 件数一致）が PASS することを確認する。
- **期待結果:** cutoff より古い終端行のみ削除され、削除件数が返る。
- **確認ポイント:** cutoff 境界ちょうどの行の扱い（`< cutoff` で厳密に古い行のみ）。tag_merge は artifact を持たないため `completed` も終端集合に含まれる。

### 2. cutoff より古い export_jobs の終端行が刈られる（completed は除外）

- **対応する受け入れ基準:** AC-2, AC-8
- **目的:** retention を超えた `export_jobs` の `failed` / `cancelled` / `expired` が削除され、`completed` は**年齢に関わらず除外**されること（ライブ R2 artifact の orphan 化回避）。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. `jobStatePruner.integration.test.ts` の export ケース（古い `failed` / `cancelled` / `expired` が削除、古い `completed` は**保持**）が PASS することを確認する。
- **期待結果:** 終端3 status（completed 以外）のうち cutoff より古い行のみ削除される。`completed` 行はどれだけ古くても残る。
- **確認ポイント:** D1 アダプタの DELETE 述語が `status IN ('failed','cancelled','expired')` で構造的に `completed` を除外していること。これにより本 prune が artifact ライフサイクル（`purgeExpiredExports` の責務）に干渉しない。

### 3. 非終端行（pending / processing）は年齢に関わらず保持される

- **対応する受け入れ基準:** AC-3
- **目的:** 進行中・スタックしたジョブが消えないこと。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. 両テーブルで「古い `pending` / `processing` が削除されない」ケースが PASS することを確認する。
- **期待結果:** 非終端行は `updated_at` がどれだけ古くても削除されない。
- **確認ポイント:** 述語に `pending` / `processing` が一切含まれないこと。

### 4. retention の env var 上書き / 既定が日単位

- **対応する受け入れ基準:** AC-5, AC-6
- **目的:** `EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` が設定されれば既定を上書きし、既定値が日単位であること。
- **手順:**
  1. `pnpm test:unit` で `pruneExportJobs.test.ts` / `pruneTagMergeJobs.test.ts` の cutoff 計算ケース（任意 retentionMs を渡して cutoff = now - retentionMs）が PASS することを確認する。
  2. `DEFAULT_EXPORT_JOBS_RETENTION_MS` / `DEFAULT_TAG_MERGE_JOBS_RETENTION_MS` が日単位（7日 = 604800000）であることを定数アサートで確認する。
  3. `env.ts` の `readPruneTuning` が両 env var を読むことをテストまたはコードで確認する。
- **期待結果:** env var 未設定なら既定7日、設定すればその値で cutoff が計算される。ポーリング完了窓（数秒間隔）より桁違いに長い。

### 5. daily tick で既存刈り込み + 新規 prune 2本 + purge が動く（失敗隔離）

- **対応する受け入れ基準:** AC-7, AC-9
- **目的:** 既存の outbox / processed-events / activity-log / llm-call-log 刈り込みを壊さず、同一 tick で `purgeExpiredExports`（前段）→ `export_jobs` / `tag_merge_jobs` prune が動き、いずれかの失敗が他や tick 全体を巻き戻さないこと。
- **手順:**
  1. `pnpm test:unit` で `runPruneTick.test.ts` を実行する。
  2. purge / 各 prune のいずれかが throw しても、他の prune・outbox・tick が継続し `error` ログのみで握りつぶされる隔離ケースが PASS することを確認する。
  3. purge が `export_jobs` prune より**前**に呼ばれる順序（completed→expired を先に進める）のケースを確認する。
  4. `pnpm test:integration` で `handlers.integration.test.ts` の pruner ブロックが purge 配線込みで例外なく完走することを確認する。
- **期待結果:** `runPruneTick` の戻り値契約（`{ outboxDeleted, processedEventsDeleted }`）は不変。purge・新 prune はログのみ。各処理が独立 try/catch で隔離される。
- **確認ポイント:** purge の呼び出し経路が追加されたこと（配線前は一度も呼ばれていなかった）。purge を前段に置くことで completed→expired→prune の連鎖が tick 内で閉じること（ただし同一 tick で新規 expired 化された行は cutoff より新しく、その tick では prune されない）。

## エッジケース・異常系

### 1. 刈り込み対象が0件

- **目的:** 削除対象がなくてもエラーにならず、件数0で構造化ログが出ること。
- **手順:** unit テストの「0件でもログする」ケースを確認する。
- **期待結果:** `deleted: 0` が返り、info ログ（deleted / retentionMs / cutoff）が1件出る。

### 2. DB エラー時の翻訳

- **目的:** adapter での DELETE 失敗が `mapDbError` で共有エラー契約に翻訳されること。
- **手順:** `D1JobStatePruner` の各メソッドが `mapDbError` でラップされていることをコードで確認する。
- **期待結果:** driver ネイティブエラーが application 層に漏れない（runPruneTick の try/catch で error ログに落ちる）。

### 3. pruner env に R2 binding が無い状態での purge

- **目的:** objectStorage が unavailable フォールバックでも tick がクラッシュしないこと。
- **手順:** テスト env（R2 binding 無し）で `runPruneTick` を走らせ、completed 期限切れ行を seed しない限り `objectStorage.delete` が呼ばれず tick が完走することを `handlers.integration.test.ts` で確認する。
- **期待結果:** purge の per-row `catch`（warn 握りつぶし）により tick は継続。ただし prod では artifact が削除されないため R2 binding 追加が必須（確認環境セクションの注記参照）。

## 既存機能への影響確認

- **既存 pruner 刈り込み（outbox / processed_events / activity_log / ingestion_burst_log / llm_call_log）**: `runPruneTick` への purge・新 prune 追加後も従来どおり動き、戻り値型が不変であること。`handlers.integration.test.ts` の既存ケースが回帰しないこと。
- **MergeTagDialog / ExportJobDetail のポーリング**: retention 窓（日単位）はポーリング完了窓（数秒間隔）より桁違いに長いため、終端状態の読み取りに影響しないこと（挙動不変）。
- **purgeExpiredExports のロジック**: 呼び出し経路の追加のみで `findExpired` 述語・R2 削除順序・遷移ロジックは無変更であること（consumer 等の他経路から呼ばれていないため回帰元はない）。
- **集約リポジトリ（ExportJobRepository / TagMergeJobRepository）**: prune は専用 worker ポート（`JobStatePruner`）経由で、集約リポジトリには手を加えないため request/consumer 経路に影響しないこと。
- **relay / dlq / indexer / consumer worker**: purge 配線は `WorkerContainer` を太らせず `createRequestContainer` を別途構築する方式（ADR-005 案Y）のため、これら worker の `WorkerContainer` / `ConsumerContainer` 利用に波及しないこと。
- **pruner Worker エントリ（`pruner.ts`）**: 戻り値を使わないため、配線追加後もビルド・実行が通ること（`pnpm deploy:staging:pruner:dry` で検証可）。
