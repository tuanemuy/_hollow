# 動作確認計画 — Issue #101: feat(llm): wire real LLM providers (Anthropic + extensible) with admin-settings-driven resolution

**Issue:** #101
**作成日:** 2026-05-22

---

## 確認環境

このIssueは **新規 adapter 追加 + admin UI 拡張 + DB resolution 配線** が中心。動作確認は (1) typecheck / lint / test の機械的検証、(2) provider 別の接続テスト・ingestion 動作、(3) env override / DB key 経路 / fallback の経路網羅、が三本柱。

### 検証環境の起動

```bash
pnpm dev
```

> Cloudflare Workers + D1 + Queues 環境で TanStack Start アプリが起動。`vite dev --config vite.config.cloudflare.ts` 経由（package.json scripts より）。

ローカル DB migration が必要な場合（`llm_base_url` カラム追加 migration を反映するため）:

```bash
pnpm dlx wrangler d1 migrations apply --local hollow-d1
```

> README.md「Database migrations」セクションに従う。新規 migration `0010_add_llm_base_url.sql` を local D1 に適用。

### デプロイ方法

```bash
# Staging deploy（dry-run で wrangler.toml syntax を先に確認）
pnpm deploy:staging:dry
pnpm deploy:staging:consumer:dry

# 本番 deploy（dry-run）
pnpm deploy:production:dry
pnpm deploy:production:consumer:dry
```

> `wrangler.toml` / template に追加した `ADMIN_LLM_BASE_URL = ""` が syntax error を起こさないことを dry-run で確認。

---

## 確認項目

### 1. 機械的検証（最優先）

- **目的:** 新規 adapter 追加 + async 化 + DB schema 変更で既存テストが回帰していないことを担保
- **手順:**
  1. `pnpm typecheck` を実行
  2. `pnpm lint:fix && pnpm format` を実行
  3. `pnpm test:unit` を実行
  4. `pnpm test:integration` を実行
- **期待結果:**
  - typecheck: エラー 0 件
  - lint / format: 変更ファイル全て Biome 規約に準拠
  - test: 全件 PASS、新規 adapter テスト群（OpenAI / Gemini）も PASS、`createConsumerContainer` の async 化に伴う test mock 変更後も PASS
- **確認ポイント:**
  - `exactOptionalPropertyTypes` 関連の型エラーが出ていないか
  - `LLMConfig.baseURL` の provider × baseURL invariant が全 provider で検証されているか
  - `serverCloudflare.test.ts` の 6 箇所の `createConsumerContainer` 呼び出しが全て `await` 化されているか

### 2. wrangler env sync 検証（grep）

- **目的:** `ADMIN_LLM_BASE_URL` が 7 箇所すべてに追加されたことを機械的に検証（Issue #122 ADR-008 の再発防止）
- **手順:**
  1. `grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` を実行
- **期待結果:** **7 hit**（`wrangler.toml` × 2 ブロック + `wrangler.staging.toml.tmpl` × 2 + `wrangler.production.toml.tmpl` × 2 + `renderWrangler.ts` × 1）
- **確認ポイント:**
  - `[env.relay.vars]` / `[env.pruner.vars]` / `[env.dlq.vars]` には追加されていない（これらは LLM を呼ばない worker）

### 3. wrangler.toml の syntax 検証（dry-run）

- **目的:** `ADMIN_LLM_BASE_URL` 追加 + template 変更が wrangler 設定として正しく解釈されること
- **手順:**
  1. `pnpm deploy:staging:dry`
  2. `pnpm deploy:staging:consumer:dry`
- **期待結果:** 両 dry-run が成功（exit code 0）、出力 (`dist/worker/`, `dist/consumer/`) が生成

### 4. `/admin/llm` — provider dropdown と conditional baseURL 表示

- **目的:** admin UI で 3 provider が選択可能、OpenAI 選択時のみ baseURL フィールドが現れる
- **手順:**
  1. `pnpm dev` でローカル起動、ブラウザで `/admin/llm` にアクセス
  2. provider dropdown を確認（anthropic / openai / gemini が並ぶ）
  3. anthropic 選択 → baseURL フィールド非表示
  4. openai 選択 → baseURL フィールド表示、inline help（「OpenAI 本家は空欄、Azure / Groq / vLLM 等は base URL（`/chat/completions` を含まないパスまで）」「Azure は `?api-version=...` を含めて保存」「PDF 取り込みには `gpt-4o` 系モデル指定が必要」）が表示
  5. gemini 選択 → baseURL フィールド非表示
- **期待結果:** dropdown の 3 オプション切替で baseURL の表示/非表示が連動

### 5. OpenAI 本家プロバイダで接続テスト + 保存

- **目的:** OpenAI 本家での happy path 動作確認
- **手順:**
  1. `/admin/llm` で provider = openai を選択
  2. baseURL: 空欄（デフォルトの `https://api.openai.com/v1` が使われる）
  3. model: `gpt-4o`
  4. apiKey: 有効な OpenAI API key を入力
  5. 「接続テスト」ボタンを押下
  6. 成功 → 「保存」ボタン押下
- **期待結果:**
  - 接続テストが「成功」を返す（`pingOpenAI` 経由）
  - 保存後 DB に `provider = "openai"`, `model = "gpt-4o"`, `baseURL = null`, `encryptedApiKey` がセット

### 6. 非本家 OpenAI 互換 endpoint（baseURL 差し替え）

- **目的:** ADR-001 の「`baseURL` 差し替えで Groq / Azure / vLLM 等をカバー」の核心動作確認
- **手順:**
  1. `/admin/llm` で provider = openai
  2. baseURL: `https://api.groq.com/openai/v1` （Groq 無料枠で確認）
  3. model: `llama-3.3-70b-versatile` （Groq の利用可能モデル）
  4. apiKey: Groq API key を入力
  5. 接続テスト → 成功
  6. 保存
- **期待結果:**
  - 接続テストが成功（adapter が `baseURL` の `/v1` 末尾に `/chat/completions` を append して `https://api.groq.com/openai/v1/chat/completions` を叩く）
  - DB に `baseURL = "https://api.groq.com/openai/v1"` がセット
- **確認ポイント:** ADR-001 の `URL` クラス利用ロジックが正しく動作（path 末尾 `/v1` → `/v1/chat/completions`）

### 7. Gemini プロバイダで接続テスト + 保存

- **目的:** Gemini 独立 adapter の happy path、`x-goog-api-key` header 認証の動作確認
- **手順:**
  1. `/admin/llm` で provider = gemini
  2. baseURL: フィールド非表示（VO invariant で null 必須）
  3. model: `gemini-1.5-pro`
  4. apiKey: Google AI Studio で発行した Gemini API key
  5. 接続テスト → 成功
  6. 保存
- **期待結果:**
  - 接続テストが成功
  - `pingGemini` が `x-goog-api-key` HTTP header で認証（URL に apiKey 含まれず）
  - DB に `provider = "gemini"`, `baseURL = null` がセット

### 8. provider 変更時の apiKey 再入力必須化（ADR-008）

- **目的:** provider を切り替えた瞬間に `apiKeyPlain` を必須化する usecase invariant 確認
- **手順:**
  1. 5 で OpenAI を保存した状態から、provider dropdown を anthropic に変更
  2. apiKey フィールドを空欄のまま「保存」ボタン押下
- **期待結果:**
  - サーバ validation で `BusinessRuleError(ADMIN_SETTINGS_PROVIDER_CHANGED_REQUIRES_API_KEY)` がエラー表示
  - UI 上で apiKey 欄が必須マーク（`required` attribute）付きでハイライト
  - 警告文「プロバイダを変更すると API キーの再入力が必要です」が表示

### 9. note ingestion で選択 provider が呼ばれる（consumer worker 経路）

- **目的:** Issue 完了条件「note ingestion で admin が選択した provider が呼ばれて HTML 構造化 / metadata suggestion が動く」
- **手順:**
  1. 7 で Gemini provider を保存
  2. note のソース URL を ingestion キューに投入（admin UI または `/notes/{id}/ingest` 等の経路）
  3. consumer worker が job を pick up
  4. ingestion job のステータスを admin UI またはログで確認
- **期待結果:**
  - ingestion 完了、HTML 構造化と metadata suggestion が Gemini 経由で生成
  - DB の note に Gemini で生成されたメタデータが反映

### 10. DB key 経路（`secretBox.decrypt` 経由の resolution）

- **目的:** Issue 完了条件「admin が DB に保存した `encryptedApiKey` を `secretBox.decrypt` 経由で解決して factory に渡せる」
- **手順:**
  1. `ADMIN_LLM_API_KEY` env を unset（ローカル `.dev.vars` から削除）
  2. `SECRET_BOX_MASTER_KEY` env は set のまま（`WebCryptoSecretBox` が動く状態）
  3. DB に OpenAI provider + ciphertext を保存済みの状態（5 の手順後）
  4. `pnpm dev` 再起動
  5. ingestion job を投入
- **期待結果:**
  - consumer worker が `createConsumerContainer` の async pre-step で DB ciphertext を読み出し、`secretBox.decrypt` で復号、OpenAI adapter に plain text apiKey を渡す
  - ingestion 成功

### 11. NullSecretBox fallback（Stub 縮退）

- **目的:** `SECRET_BOX_MASTER_KEY` 未設定時の安全網確認
- **手順:**
  1. `SECRET_BOX_MASTER_KEY` env を unset
  2. `ADMIN_LLM_API_KEY` env も unset
  3. DB に ciphertext が保存された状態
  4. `pnpm dev` 再起動 → ingestion job 投入
- **期待結果:**
  - consumer worker が DB resolution で `SecretBoxError(KeyUnavailable)` を catch
  - `StubLLMProvider` に縮退、warn ログ出力
  - ingestion は `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` で失敗（Stub の既存挙動維持）

### 12. Anthropic regression check

- **目的:** 既存 Anthropic 経路が provider 拡張で破壊されていないこと
- **手順:**
  1. `ADMIN_LLM_API_KEY` env を Anthropic key で set、`ADMIN_LLM_PROVIDER=anthropic`、`ADMIN_LLM_MODEL=claude-3-5-sonnet-latest`
  2. DB の provider も anthropic に戻す
  3. ingestion job 投入
- **期待結果:**
  - Issue #122 / PR #130 以前と同じく Anthropic で正常動作
  - factory switch / DTO / UI 変更による regression なし

## エッジケース・異常系

### 1. 接続テストエラー（無効 apiKey）

- **目的:** 各 provider で apiKey が無効な場合のエラー表示
- **手順:** 各 provider で間違った apiKey を入力 → 接続テスト
- **期待結果:** 「接続失敗」エラーが表示、UI に provider-specific なエラーメッセージ（401 / 403 等）が出る

### 2. OpenAI で baseURL が malformed URL

- **目的:** ADR-004 の VO invariant 検証
- **手順:** baseURL に `not-a-url` を入力 → 保存
- **期待結果:** Transport schema validation（`z.string().url()`）で reject、または VO `LLMConfig.create` でエラー

### 3. Gemini + baseURL を強引に POST（client validation バイパス）

- **目的:** Server-side invariant の最終 enforcement
- **手順:** ブラウザ devtools で provider = gemini + baseURL = "https://example.com" のフォームデータを POST
- **期待結果:** server fn の transport validation または VO で reject（gemini + baseURL non-null は invariant 違反）

### 4. OpenAI で非 PDF サポートモデルで PDF ingestion

- **目的:** `gpt-4o` 系以外のモデルで PDF を取り込む試み
- **手順:** model = `gpt-3.5-turbo` 等の非 PDF モデルを設定し、PDF ソースを ingestion
- **期待結果:** `PDFParseError` が job failure として記録、admin UI でエラー理由が表示

## 既存機能への影響確認

- admin UI の他のセクション（user settings、search settings 等）が provider 拡張で壊れていないか
- ingestion 以外の usecase（note CRUD、tag 編集等）が `createRequestContainer` の同期維持で従来通り動くか
- relay / pruner / dlq worker が LLM 関連 env override の有無に関係なく動作するか

## 確認チェックリスト

- [ ] 1. typecheck / lint / test 全件 PASS
- [ ] 2. `grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` が 7 hit
- [ ] 3. `pnpm deploy:staging:dry` / `:consumer:dry` 成功
- [ ] 4. provider dropdown 3 オプション + conditional baseURL 表示
- [ ] 5. OpenAI 本家で接続テスト + 保存 + ingestion 動作
- [ ] 6. Groq / vLLM 等 baseURL 差し替えで動作
- [ ] 7. Gemini で接続テスト + 保存 + ingestion 動作（`x-goog-api-key` header 確認）
- [ ] 8. provider 変更時の apiKey 再入力必須化
- [ ] 9. note ingestion で選択 provider が呼ばれる
- [ ] 10. DB key 経路（secretBox.decrypt）で resolution
- [ ] 11. NullSecretBox fallback で Stub 縮退
- [ ] 12. Anthropic regression なし
- [ ] エッジケース 1-4 すべて確認
- [ ] 既存機能（admin 他セクション / note CRUD / 他 worker）が破壊されていない
