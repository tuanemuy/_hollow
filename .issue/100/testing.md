# 動作確認計画 — Issue #100: feat(infra): wire R2 ObjectStorage / TempFileStorage and remove production Stubs

**Issue:** #100
**作成日:** 2026-05-22

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。プロジェクト全体の初回セットアップは省略。

### 検証環境の起動（local dev）

```bash
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` で Cloudflare Workers ローカル実行（miniflare 経由）。`.dev.vars` に R2 SigV4 用 secrets (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`) を投入してから起動する。

### 自動テスト

```bash
pnpm typecheck         # tsgo で型検証
pnpm lint:fix          # Biome lint + autofix
pnpm format            # Biome format
pnpm test:unit         # vitest run
pnpm test:integration  # vitest run --config vitest.config.integration.ts
```

### デプロイ方法（staging）

```bash
# 0. 前提: Pulumi stack が provision 済み、SOPS secrets 投入済み
pnpm --filter @hollow/infra secrets:edit:staging   # R2_* secrets が揃っているか確認
pnpm infra:up:staging                              # Pulumi で resource 整合（既に上がっていれば no-op）

# 1. wrangler.staging.toml を render（Pulumi outputs を template に流し込み）
pnpm infra:render:staging

# 2. web + relay + consumer + pruner + dlq の全 worker を staging に deploy
pnpm deploy:staging:all
```

> **要確認:** Pulumi stack の初回 `up` 実行や、SOPS で R2 API token を新規発行する手順は本Issueの実装スコープ外（既に provision 済み前提）。未投入なら別Issueで扱う。

### staging tail（実行ログ確認）

```bash
# web worker
pnpm wrangler tail --config wrangler.staging.toml
# consumer worker
pnpm wrangler tail --config wrangler.staging.toml --env consumer
```

---

## 確認項目

### 1. 自動テスト: 全 green

- **目的:** Stub クラス削除に伴う test 書き換え後も、unit / integration の全テストが通ることを確認する
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint:fix && pnpm format`
  3. `pnpm test:unit`
  4. `pnpm test:integration`
- **期待結果:** 全コマンドが exit 0 で完了
- **確認ポイント:**
  - `serverCloudflare.test.ts` の downgrade 検証ケースが `rejects.toThrow(StorageUnavailableError)` / `rejects.toThrow(TempFileStorageUnavailableError)` で port 全メソッドをカバー
  - `handlers.integration.test.ts` の R2TempFileStorage spy が ingestion 経路で hit する
  - `StubObjectStorage` / `StubTempFileStorage` への参照が grep でゼロになっている: `grep -rn "StubObjectStorage\|StubTempFileStorage" app/` で no matches

### 2. local dev: R2 binding 未配備時の挙動互換性

- **目的:** `.dev.vars` から R2_* を空にしたとき、container 構築は成功し operation 時に `StorageUnavailableError` が返る（既存 Stub と同等の挙動）ことを確認
- **手順:**
  1. `.dev.vars` の R2_* 3 項目を `""` 空文字に置換
  2. `pnpm dev` 起動
  3. ログイン後、admin 画面で画像挿入 / メディアアップロードを試みる
  4. ブラウザの DevTools / server log で reject 内容を確認
- **期待結果:**
  - サーバー起動自体は成功（`Loaded` / `Ready on http://...` 等）
  - メディアアップロード API が `StorageUnavailableError` または同等の error 表示で失敗
  - サーバー process が unhandled rejection で abort しない
- **確認ポイント:** `async () => { throw }` クロージャ実装が既存 Stub と完全な挙動互換になっていること

### 3. local dev: R2 binding 配備時の媒体 upload

- **目的:** `.dev.vars` に R2 secrets を投入したとき、`R2ObjectStorage.put()` 経路が選ばれ、操作が成功すること
- **手順:**
  1. `.dev.vars` に有効な R2 API token を投入
  2. `pnpm dev` 起動
  3. admin 画面で画像挿入
  4. miniflare in-memory R2 simulator または実 R2 bucket に object が記録されるか観測
- **期待結果:** アップロード成功、画像表示成功
- **確認ポイント:** dev 環境では miniflare の R2 simulator が in-memory で動くため、実 R2 への書き込みは staging で別途検証する

### 4. staging deploy: media upload で実 R2 への書き込み（完了条件 (3)）

- **目的:** staging worker から実 R2 bucket への `put` / `get` が成功することを確認
- **手順:**
  1. `pnpm --filter @hollow/infra secrets:edit:staging` で R2_* secrets 投入確認
  2. `pnpm infra:render:staging`
  3. `pnpm deploy:staging:all`
  4. staging URL でログイン
  5. note 作成画面で画像をアップロード
  6. Cloudflare dashboard → R2 → staging bucket（`tanstack-start-template-objects-staging` 等）で object 出現を目視
  7. note 公開画面で画像が表示されること（presign download 経路）を確認
- **期待結果:**
  - upload 成功
  - dashboard 上で object key と size が確認できる
  - presigned URL からの画像取得が 200 で返る
- **確認ポイント:**
  - `wrangler tail` で `StorageUnavailableError` が出ていないこと
  - `R2ObjectStorage.presignDownload` が SigV4 計算済み URL を返していること

### 5. staging deploy: ingestion 経路で TempFileStorage 読み書き（完了条件 (4)）

- **目的:** ingestion job が `R2TempFileStorage.put → get` のラウンドトリップを完了することを確認
- **手順:**
  1. staging URL で ingestion job を作成（HTML をアップロード）
  2. consumer worker のキューに job が enqueue される
  3. `pnpm wrangler tail --config wrangler.staging.toml --env consumer` で consumer log を観測
  4. job が `runIngestionJob` を経由して preview / commit / discard まで進む流れを log で追跡
- **期待結果:**
  - job が成功状態（または preview 段階）まで遷移
  - log に `TempFileStorageUnavailableError` が出ていない
  - R2 bucket（`tanstack-start-template-tempfiles-staging` 等）に一時 object が書き込まれ、consumer worker が `get` で取得後、必要なら削除される流れが完結
- **確認ポイント:** ingestion → preview → commit までの 3 段階で TempFileStorage に対する put / get / delete のいずれも 500 / unavailable error にならない

### 6. staging deploy: export 経路で presign download

- **目的:** export job が R2 から presigned URL を生成し、ダウンロードが成功することを確認
- **手順:**
  1. staging URL で export job を作成
  2. job 完了後、download link を踏む
  3. presigned URL が R2 endpoint（`*.r2.cloudflarestorage.com`）に向いていることを確認
  4. 200 でファイルが取得できることを確認
- **期待結果:** export ファイル取得成功
- **確認ポイント:** SigV4 計算が R2 endpoint に対して正しく適用されていること

---

## エッジケース・異常系

### 1. staging で R2 secret が部分的に欠落

- **目的:** SigV4 4 項目のうち 1 つだけ欠落した場合に、container 構築は成功し operation で `StorageUnavailableError` が返ることを確認
- **手順:**
  1. SOPS で staging secret から `R2_ACCESS_KEY_ID` だけ一時的に削除
  2. `pnpm deploy:staging:all` で deploy
  3. media upload を試行
  4. **検証後は必ず secret を復元して再 deploy**
- **期待結果:** worker 起動成功、upload API が `StorageUnavailableError` を返す（500 内部エラーや TypeError で abort しない）

### 2. local dev で `.dev.vars` に空文字を入れた場合

- **目的:** 空文字での downgrade fallback 経路が hit すること
- **手順:** 確認項目 2 と同じ
- **期待結果:** 確認項目 2 と同じ

---

## 既存機能への影響確認

- **note の閲覧・編集（image を含まない）:** R2 経路を踏まないため影響なし。回帰なきこと確認
- **ingestion 経路（job 投入だけで preview に至らない短い経路）:** TempFileStorage 経由を踏まない場合は影響なし
- **export 以外のダウンロード経路:** R2 を踏まない経路は影響なし
- **pruner / relay / dlq worker:** R2 binding を使わないため、本Issueの変更で挙動が変わらないことを `pnpm deploy:staging:all` 後の wrangler tail で確認

---

## 確認チェックリスト

- [ ] `pnpm typecheck` が green
- [ ] `pnpm lint:fix && pnpm format` が green
- [ ] `pnpm test:unit` が green
- [ ] `pnpm test:integration` が green
- [ ] `grep -rn "StubObjectStorage\|StubTempFileStorage" app/` が no matches（テスト含めて全ファイルから消えていること）
- [ ] local dev で R2_* 空時に operation が `StorageUnavailableError` を返す（unhandled rejection で abort しない）
- [ ] staging deploy 完了
- [ ] staging で media upload が R2 bucket に書き込み成功（完了条件 (3)）
- [ ] staging で ingestion 経路が TempFileStorage 読み書きを完了（完了条件 (4)）
- [ ] staging で export presign download が成功
- [ ] staging `wrangler tail` で `StorageUnavailableError` / `TempFileStorageUnavailableError` が出ていない
- [ ] pruner / relay / dlq worker の動作に回帰なし
