# 動作確認計画 — Issue #122: refactor(llm): provider-agnostic LLM adapter abstraction

**Issue:** #122
**作成日:** 2026-05-21

---

## 確認環境

このIssueは **純粋なリファクタリング** (rename + factory + env 追加) で挙動変更なし。動作確認は「既存テストが全て緑のまま」と「DI 配線が依然として実 Anthropic adapter に到達する」の確認が中心。

### 検証環境の起動

```bash
pnpm dev
```

> Cloudflare Workers + D1 + Queues 環境で TanStack Start アプリが起動。`vite dev --config vite.config.cloudflare.ts` 経由（package.json scripts より）。

### デプロイ方法

```bash
# Staging への deploy
pnpm deploy:staging         # メイン worker
pnpm deploy:staging:consumer # consumer worker (ADMIN_LLM_PROVIDER を必要とする)

# Dry-run で wrangler.toml が正しく解釈されるかチェック
pnpm deploy:staging:dry
pnpm deploy:staging:consumer:dry
```

> `wrangler.toml` の `ADMIN_LLM_PROVIDER` 追加が syntax error を起こさないことを dry-run で確認。本番反映は別 Issue クローズ後に判断。

---

## 確認項目

### 1. 既存テスト全件が緑（最優先）

- **目的:** rename + import path 全更新で 1883 件のテストが回帰していないことを担保
- **手順:**
  1. ローカルで `pnpm typecheck` を実行
  2. `pnpm lint:fix && pnpm format` を実行（Biome）
  3. `pnpm test` を実行（unit + integration）
- **期待結果:**
  - typecheck: エラー 0 件
  - lint / format: 変更ファイル全てが Biome 規約に準拠
  - test: 全 1883 件（または同等数）が PASS、新規 factory test も PASS
- **確認ポイント:**
  - `exactOptionalPropertyTypes` 関連の型エラーが出ていないか（`RequestServerConfig.adminLlmProvider` の conditional spread が機能しているか）
  - import path 漏れによる「Cannot find module '@/core/adapters/llm/...'」エラーが残っていないか

### 2. grep 検証: rename と Stub 分離の整合性

- **目的:** ディレクトリ rename と Stub 分離が両方向で完全に行われていることを機械的に検証
- **手順:**
  1. `grep -rn "adapters/llm" app/ infra/` を実行（コード本体 + JSDoc 対象）
  2. `grep -rn "AnthropicLLMProvider\|AnthropicOCRProvider\|AnthropicPDFExtractor" app/core/adapters/stub/` を実行
  3. `grep -rn "StubLLMProvider\|StubOCRProvider\|StubPDFExtractor" app/core/adapters/anthropic/` を実行
  4. `ls app/core/adapters/` で `llm/` ディレクトリが残っていないことを確認
- **期待結果:**
  - 1.〜3. すべて 0 件
  - 4. `anthropic/` と `stub/` が存在し、`llm/` は存在しない
- **確認ポイント:**
  - `docs/` / `.issue/` / `spec/` 内の歴史的記録は更新スコープ外なので、grep 範囲は `app/` と `infra/` に限定する

### 3. wrangler.toml の syntax 検証

- **目的:** `ADMIN_LLM_PROVIDER` 追加が wrangler 設定として正しく解釈されること
- **手順:**
  1. `pnpm deploy:staging:dry` を実行
  2. `pnpm deploy:staging:consumer:dry` を実行
- **期待結果:**
  - 両 dry-run が成功（exit code 0）
  - 出力 (`dist/worker/`, `dist/consumer/`) が生成される
- **確認ポイント:**
  - `[vars]` (top-level) と `[env.consumer.vars]` の両方に `ADMIN_LLM_PROVIDER = "anthropic"` が含まれていること
  - `[env.relay.vars]` / `[env.pruner.vars]` / `[env.dlq.vars]` には追加されていない（これらは LLM を呼ばないため）

### 4. `/admin/llm` 接続テスト（手動 UI 確認）

- **目的:** `HttpLLMConnectionTester` を `adapters/anthropic/` に移動した後も admin UI から接続テストが動くこと
- **手順:**
  1. `pnpm dev` で起動
  2. ブラウザで admin にログイン → `/admin/llm` ページに遷移
  3. LLM provider を `"anthropic"` に設定し、API key を入力（dummy でも可）
  4. "Test connection" ボタンを押す
- **期待結果:**
  - API key が有効 → `{ ok: true, latencyMs: ... }`
  - API key が無効 → `{ ok: false, error: "..." }`（HTTP 401 等を含む）
  - 例外で UI が固まらない（probe never throws の挙動維持）
- **確認ポイント:**
  - import path 変更で `HttpLLMConnectionTester` が破綻していないこと
  - 既存挙動と完全等価

### 5. note ingestion 経路の動作（手動 UI 確認）

- **目的:** factory 経由で `AnthropicLLMProvider` / `AnthropicOCRProvider` / `AnthropicPDFExtractor` が実 adapter として注入されること
- **手順:**
  1. `pnpm dev` で起動
  2. admin で LLM 設定を保存（API key + model `claude-3-...` 等）
  3. note ingestion を実行（既存ワークフロー）
  4. ingestion job が成功し note が HTML 構造化されていることを確認
- **期待結果:**
  - 実 LLM provider が呼ばれて HTML 構造化 / metadata suggestion が動く
  - `StubLLMProvider` の `BusinessRuleError(UnsupportedFormat)` が誤って発火していない
- **確認ポイント:**
  - factory `createLLMProvider({ provider: "anthropic", ... })` 経路が `AnthropicLLMProvider` を返していること（DI のスモークテスト）

---

## エッジケース・異常系

### 1. 未知 provider が env に設定された場合

- **目的:** factory の runtime guard (`default: throw`) が動くこと
- **手順:**
  1. `wrangler.toml` の `ADMIN_LLM_PROVIDER` を一時的に `"openai"` に書き換え
  2. `pnpm dev` で起動
  3. `/admin` 経由で LLM 設定を保存
  4. note ingestion を実行
- **期待結果:**
  - `Error: Unsupported LLM provider: openai` が server-function 経由で error response として返る
  - admin UI でエラーが構造化表示される（presentation 層の error mapping）
- **確認ポイント:**
  - silent fallback ではなく明示的な error として表面化していること
- **後始末:** 確認後 `wrangler.toml` を `"anthropic"` に戻す

### 2. `ADMIN_LLM_PROVIDER` 未設定の場合

- **目的:** default fallback (`"anthropic"`) が動くこと（既存挙動互換）
- **手順:**
  1. `wrangler.toml` から `ADMIN_LLM_PROVIDER` を一時的にコメントアウト
  2. `pnpm dev` で起動
  3. LLM 設定 + note ingestion を実行
- **期待結果:**
  - `buildLlmProvider(undefined, key, model)` 内の `provider ?? "anthropic"` が機能し、`AnthropicLLMProvider` が注入される
  - ingestion が成功
- **後始末:** 確認後 `wrangler.toml` を戻す

### 3. API key / model 未設定の場合

- **目的:** Stub fallback が依然として動くこと
- **手順:**
  1. admin で LLM 設定を空にする（または env から `ADMIN_LLM_API_KEY` を抜く）
  2. note ingestion を実行
- **期待結果:**
  - `StubLLMProvider` が `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` を throw
  - admin UI で「LLM is not configured」相当のエラーが表示される（既存挙動）

---

## 既存機能への影響確認

- **note ingestion 全経路**: factory 経路導入で `AnthropicLLMProvider` インスタンスの生成タイミングが変わっていないこと（既存と同様 `createRequestContainer` 内で eager 生成）
- **admin/llm 接続テスト**: `HttpLLMConnectionTester` のディレクトリ移動による影響なし
- **consumer worker (queue 経由)**: `[env.consumer.vars]` の `ADMIN_LLM_PROVIDER` が読まれ、queue 経由 ingestion でも factory が `AnthropicLLMProvider` を返すこと
- **OCR / PDF extraction 経路**: 同様に factory 経由で `AnthropicOCRProvider` / `AnthropicPDFExtractor` が注入されること

---

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラー 0
- [ ] `pnpm lint:fix && pnpm format` で全変更ファイルが Biome 規約準拠
- [ ] `pnpm test` で全テスト PASS（新規 factory test 含む）
- [ ] `grep -rn "adapters/llm" app/ infra/` が 0 件
- [ ] `grep -rn "Anthropic*Provider\|Anthropic*Extractor" app/core/adapters/stub/` が 0 件
- [ ] `grep -rn "Stub*Provider\|Stub*Extractor" app/core/adapters/anthropic/` が 0 件
- [ ] `app/core/adapters/llm/` ディレクトリが存在しない
- [ ] `pnpm deploy:staging:dry` 成功
- [ ] `pnpm deploy:staging:consumer:dry` 成功
- [ ] `/admin/llm` 接続テストが動作
- [ ] note ingestion で実 `AnthropicLLMProvider` が呼ばれる
- [ ] 未知 provider env で factory が throw
- [ ] `ADMIN_LLM_PROVIDER` 未設定で `"anthropic"` 既定挙動
- [ ] API key/model 未設定で `StubLLMProvider` 挙動維持
