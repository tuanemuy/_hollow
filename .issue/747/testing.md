# 動作確認計画 — Issue #747: processed_events の刈り込み経路を新設

**Issue:** #747
**作成日:** 2026-06-18

---

## 確認環境

このIssueは UI を持たない pruner Worker（daily cron）の変更。確認の主軸は自動テスト（unit / integration）。pruner Worker は `pnpm dev` / `pnpm start` では起動しないため、ブラウザでの手動確認は対象外。

### 検証環境の起動（自動テスト）

```bash
# 型チェック
pnpm typecheck

# unit テスト（pruneProcessedEvents の cutoff 計算・ログ等）
pnpm test:unit

# integration テスト（D1 実DB での DELETE 境界、daily tick での両テーブル刈り込み）
pnpm test:integration
```

### 検証環境の起動（ローカル D1 での実挙動確認 — 任意）

ローカル D1 に直接 SQL を流して刈り込み境界を目視確認したい場合:

```bash
# ローカル D1 にマイグレーション適用（未適用時のみ）
pnpm db:apply:local

# 任意の SQL ファイルをローカル D1 に実行（確認用クエリ）
pnpm db:execute:local <SQLファイルパス>
```

### デプロイ方法

ステージング pruner Worker への反映:

```bash
# ドライラン（ビルド検証のみ、デプロイしない）
pnpm deploy:staging:pruner:dry

# 実デプロイ
pnpm deploy:staging:pruner
```

本番 pruner Worker への反映:

```bash
pnpm deploy:production:pruner:dry   # ドライラン
pnpm deploy:production:pruner       # 実デプロイ
```

env var `PROCESSED_EVENTS_RETENTION_MS` は `wrangler.toml` / `wrangler.staging.toml` / `wrangler.production.toml` の `[env.pruner.vars]` に置く（デプロイ時に反映）。

## 確認項目

### 1. cutoff より古い processed_events 行が刈られる

- **対応する受け入れ基準:** AC-2, AC-3
- **目的:** retention を超えた `processed_events` 行が daily tick で削除されること。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. `idempotencyStore.integration.test.ts` の `pruneProcessed` ケースと、`handlers.integration.test.ts` の pruner ブロックに追加した `processed_events` 刈り込みケースが PASS することを確認する。
- **期待結果:** cutoff より古い行のみ削除され、削除件数が返る。
- **確認ポイント:** cutoff 境界ちょうどの行の扱い（`< olderThan` で厳密に古い行のみ）。

### 2. 再配信され得る新しい行は保持される

- **対応する受け入れ基準:** AC-3
- **目的:** retention 内（= まだ再配信され得る）の dedup 記録が消えないこと。冪等化の正しさを壊さない。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. cutoff より新しい行を保持する integration ケースが PASS することを確認する。
- **期待結果:** 新しい行は削除されず残る。`deleted` は古い行の件数のみ。
- **確認ポイント:** 14日（既定 retention = CF Queues メッセージ最大保持期間）内の行が確実に残ること。

### 3. daily tick で outbox と processed_events の両方が刈られる

- **対応する受け入れ基準:** AC-2, AC-4
- **目的:** 既存の `outbox_events` 刈り込みを壊さず、同一 tick で `processed_events` も刈られること。
- **手順:**
  1. `pnpm test:integration` で `handlers.integration.test.ts` の pruner ブロックを実行する。
  2. `runPruneTick` が `{ outboxDeleted, processedEventsDeleted }` を返し、既存の outbox 刈り込みケースが回帰していないことを確認する。
- **期待結果:** 両テーブルの削除件数が正しく返る。outbox 既存テストは PASS のまま。

### 4. retention の env var 上書き

- **対応する受け入れ基準:** AC-1
- **目的:** `PROCESSED_EVENTS_RETENTION_MS` が設定されれば既定値を上書きすること。
- **手順:**
  1. `pnpm test:unit` で `pruneProcessedEvents.test.ts` の cutoff 計算ケース（任意 retentionMs を渡して cutoff = now - retentionMs）が PASS することを確認する。
  2. `env.ts` の `readPruneTuning` が `PROCESSED_EVENTS_RETENTION_MS` を読むことをテストまたはコードで確認する。
- **期待結果:** env var 未設定なら既定14日、設定すればその値で cutoff が計算される。

## エッジケース・異常系

### 1. 刈り込み対象が0件

- **目的:** 削除対象がなくてもエラーにならず、件数0で構造化ログが出ること。
- **手順:** unit テストの「0件でもログする」ケースを確認する。
- **期待結果:** `deleted: 0` が返り、info ログが1件出る。

### 2. DB エラー時の翻訳

- **目的:** adapter での DELETE 失敗が `mapDbError` で共有エラー契約に翻訳されること。
- **手順:** `D1IdempotencyStore.pruneProcessed` が `mapDbError` でラップされていることをコードで確認する。
- **期待結果:** driver ネイティブエラーが application 層に漏れない。

## 既存機能への影響確認

- **consumer の冪等化（`hasProcessed` / `markProcessed`）**: 刈り込みは古い行のみを対象とするため、現役の dedup 判定に影響しないこと。`idempotencyStore.integration.test.ts` の既存ケースが回帰しないこと。
- **outbox 刈り込み（`pruneOutbox`）**: `runPruneTick` 戻り値型変更後も `outbox_events` の刈り込み挙動が不変であること。
- **pruner Worker エントリ（`pruner.ts`）**: 戻り値を使わないため、型変更後もビルド・実行が通ること（`pnpm deploy:staging:pruner:dry` で検証可）。
