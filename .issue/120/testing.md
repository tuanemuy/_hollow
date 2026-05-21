# 動作確認計画 — Issue #120: refactor(llm): migrate AnthropicLLMProvider to anthropicMessagesClient helper

**Issue:** #120
**作成日:** 2026-05-21

---

## 確認環境

このIssueはアダプタ層の内部リファクタで、外部から観測される挙動は完全等価維持 (UI / API レスポンスに変化なし)。主要な検証は自動テスト (`pnpm test`) で網羅される。実機での確認は ingestion ジョブが実際に Anthropic API 経由で structuring → metadata suggestion を回せることを確認するスモークに限定する。

### 検証環境の起動

```bash
pnpm dev
```

`app/server.cloudflare.ts` をエントリにした Cloudflare Workers ローカル開発サーバが起動する (`wrangler dev` 経由)。`.dev.vars` に `ADMIN_LLM_API_KEY` と `ADMIN_LLM_MODEL` を設定済みであることを前提とする。

### デプロイ方法

なし。本 Issue は内部リファクタのため、検証環境のスモークのみで足りる。

## 確認項目

### 1. note ingestion が Anthropic LLM 経路で完走する

- **目的:** `AnthropicLLMProvider.invoke()` を `callAnthropicMessages` 経由に切り替えても、ingestion job 全体が変わらず完走することを確認する
- **手順:**
  1. `pnpm dev` でローカルサーバを起動
  2. 管理画面または ingestion 投入経路から、プレーンテキスト (例: 数十行の markdown 風メモ) を 1 件投入
  3. ingestion ジョブのステータスを確認 (admin UI または DB の `ingestion_jobs` テーブル)
  4. 完了後、生成された note の HTML / title / directory suggestion を確認
- **期待結果:**
  - ingestion job が `completed` 状態に遷移する
  - 生成 HTML が sanitised かつ意味的に妥当な内容になっている
  - `title_suggestion` / `directory_suggestion` が埋まっている (directory は null 可)
- **確認ポイント:**
  - Worker ログに `LLMUnavailableError` / `LLMRateLimitError` 等が出ていないこと
  - `runIngestionJob` の structuring ステップが reach (LLM 呼び出しが skip されていない) こと

### 2. 既存の OCR / PDF ingestion 経路が回帰していない

- **目的:** `buildLlmProvider` extract と `llmProvider.ts` のリファクタにより、OCR (画像) / PDF (textual) 経路が壊れていないことを確認する
- **手順:**
  1. 画像ファイル (PNG/JPEG) を 1 件 ingestion 投入
  2. PDF ファイル (textual) を 1 件 ingestion 投入
- **期待結果:** いずれも `completed` 状態に遷移し、OCR / PDF からの text が LLM structuring → sanitise → note 化される
- **確認ポイント:** OCR / PDF adapter が独立して動き、LLM 移行の影響を受けていないこと

### 3. admin "test connection" が変わらず動く

- **目的:** `llmConnectionTester.ts` は本 Issue で touch しないが、`AnthropicLLMProvider` 周辺の変更により誤って影響が出ていないことを確認する
- **手順:**
  1. admin UI の LLM 設定画面で "test connection" を実行
- **期待結果:**
  - 正しい credentials のとき `ok: true, latencyMs: N` が表示される
  - 誤った credentials のとき `ok: false, error: <provider message>` が表示される (throw されない)
- **確認ポイント:** `pingAnthropic` は helper 化していないため挙動完全同一であるべき

## エッジケース・異常系

### 1. 不正な API key で ingestion を投入

- **目的:** error mapping (HTTP 403 → `LLMQuotaExceededError` / `LLMUnavailableError`) が正しく動作することを確認
- **手順:**
  1. `.dev.vars` の `ADMIN_LLM_API_KEY` を意図的に invalid な値に差し替えて `pnpm dev` 起動
  2. ingestion を 1 件投入
- **期待結果:** ingestion job が `failed` 状態に遷移し、エラーコード/メッセージが LLM port のエラー (`LLM_UNAVAILABLE` 等) を反映している
- **確認ポイント:** Worker ログに helper 経由のエラー mapping が正しく機能していることが確認できる

### 2. timeout 状況のシミュレーション (任意)

- **目的:** `AbortError` → `LLMTimeoutError` のマッピングが helper 経由でも維持されている
- **手順:** 通常は unit test (`Step 4` の AbortError ケース) で十分。実機での再現はネットワーク状況に依存するため省略可
- **期待結果:** unit test が green

## 既存機能への影響確認

- **ingestion ジョブ全般:** 画像 / PDF / プレーンテキスト いずれの経路でも `completed` まで到達することを最低 1 件ずつ確認
- **admin LLM 設定の保存・読み出し:** リファクタ範囲外のため影響なし想定だが、設定保存 UI を 1 度操作して確認
- **admin "test connection":** 確認項目 3 で実施

## 自動テスト (主要な担保)

実機確認の前に以下を必ず緑にする:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test
pnpm vitest run app/core/adapters/llm/__tests__/llmProvider.test.ts
```

緑確認対象:
- 新規 `app/core/adapters/llm/__tests__/llmProvider.test.ts` (Step 4 で追加するテスト)
- `app/core/application/di/__tests__/serverCloudflare.test.ts` 内の `describe("buildLlmProvider", ...)` 新規 + 既存 `createRequestContainer` 経由テスト
- `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts` (回帰ガード — fetch mock 経由の image / pdfTextual パイプライン)
- `app/core/adapters/llm/__tests__/anthropicMessagesClient.test.ts`, `ocrProvider.test.ts`, `pdfExtractor.test.ts` (helper / 同列 adapter の無影響確認)

## 確認チェックリスト

- [ ] `pnpm typecheck` / `pnpm lint:fix` / `pnpm format` 全て green
- [ ] `pnpm test` 全件 green
- [ ] `pnpm vitest run` で新規 `llmProvider.test.ts` が拾われている (skip されていない)
- [ ] 確認項目 1: テキスト ingestion が completed まで到達
- [ ] 確認項目 2: 画像 / PDF ingestion が completed まで到達
- [ ] 確認項目 3: admin "test connection" が正常系・異常系で期待通り
- [ ] エッジケース 1: 不正 API key で `failed` + 妥当な error code
- [ ] git diff で `llmProvider.ts` から重複コード (invoke / throwForStatus / DEFAULT_* / 型 / isAbortError / isTransientNetworkError / extractTextContent) が削除されている
