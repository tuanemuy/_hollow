# Manual-test Summary — Issue #101

**実行日時**: 2026-05-22
**テストソース**: `.issue/101/testing.md`
**サーバー**: http://localhost:3000 (`pnpm dev`)
**認証**: `admin@example.com` / `Password123!`（Better Auth credential）

## UI 検証結果

| TC | 名前 | 種別 | 結果 |
|----|------|------|------|
| TC-4 | provider dropdown + conditional baseURL 表示 | UI | **PASS** |
| TC-8 (UI 部分) | provider 変更時の警告 + apiKey required 切替 (ADR-008) | UI | **PASS** |
| TC-Edge2 | openai + malformed baseURL の HTML5 URL バリデーション | UI | **PASS** |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 機械的検証結果（CLI 経由）

これらは bash CLI で実行済み、別途記録:

| TC | 検証内容 | 結果 |
|----|---------|------|
| TC-1 | typecheck / lint / test 全件 PASS | **PASS** (1747 unit + 360 integration tests) |
| TC-2 | `grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` | **PASS** (7 sync sites + 1 comment) |
| Integration | createConsumerContainer の 5 path（env override / DB ciphertext / NullSecretBox fallback / etc.） | **PASS**（Wave 4B 追加分） |
| ADR-008 | provider 変更時の `BusinessRuleError(ProviderChangedRequiresApiKey)` enforcement | **PASS**（adminSettings.integration.test 拡張分） |

## スキップした TC（API key / 外部接続 / staging 必要）

以下は staging 環境または本番運用後の検証として PR 説明に記載:

| TC | 名前 | スキップ理由 |
|----|------|-------------|
| TC-3 | `pnpm deploy:staging:dry` syntax 検証 | staging 環境への deploy が必要、PR マージ後の staging 反映時に検証 |
| TC-5 | OpenAI 本家での接続テスト + 保存 + ingestion | 実 OpenAI API key 必要 |
| TC-6 | Groq 等の非本家 OpenAI 互換 endpoint | 実 Groq API key + 外部接続 |
| TC-7 | Gemini プロバイダで接続テスト + ingestion | 実 Gemini API key 必要 |
| TC-9 | note ingestion で選択 provider 動作 | 実 API key + ingestion queue + ソース URL |
| TC-10 | DB key 経路（secretBox.decrypt） | integration test (`createConsumerContainer.integration.test.ts`) でカバー |
| TC-11 | NullSecretBox fallback | integration test でカバー |
| TC-12 | Anthropic regression | 既存 unit / integration test が CI で常時カバー |

## 確認できた主要な動作

1. **provider dropdown**: `Anthropic Claude` / `OpenAI-compatible` / `Google Gemini` の 3 オプションが提示される
2. **conditional baseURL field**: openai 選択時のみ `<input type="url" name="baseURL">` が render され、anthropic/gemini では DOM に存在しない
3. **inline help（openai 時）**: 「OpenAI 本家は空欄で OK」「Azure / Groq / vLLM の場合は base URL」「Azure は `?api-version=...`」「PDF は `gpt-4o` 系」の 4 要素すべて表示
4. **provider 変更時の警告バナー**: `role="alert"` で「プロバイダの変更 — プロバイダを変更すると API キーの再入力が必要です」が表示。「現在の保存値: Anthropic Claude」と差分も視認可能
5. **apiKey required 動的切替**: 初期 `required=false` → provider を保存値以外に切替えると `required=true` に動的変更
6. **HTML5 URL validation**: baseURL に `not-a-url` を入力 → `input.validity.valid === false` でフォーム送信がブロックされる（URL は `/admin/llm` のまま不変）

## サーバー側 invariant の到達経路

- ADR-008 サーバサイド `BusinessRuleError(ProviderChangedRequiresApiKey)` は **integration test (`adminSettings.integration.test.ts`) で 3 ケースカバー済み**: provider 変更時 apiKey 必須化、新キー指定時の re-encrypt、変更なし時の ciphertext 維持
- ADR-004 の VO invariant（provider × baseURL）は **valueObject.test.ts で 7 ケースカバー済み**
- UI 経由では HTML5 `required` / `type="url"` validation が先にブロックするため、サーバ層 reject 経路には到達せず（想定通り）

## 起票したIssue

なし（全 UI TC PASS、サーバー側 invariant は test でカバー済み）

## 成果物

- `seed-data.md` — シードデータ整備記録
- `server-info.md` — サーバー情報
- `results/TC-4.md` / `TC-8.md` / `TC-Edge2.md` — TC 別詳細
- `results/summary.md` — 本ファイル
- `screenshots/tc-4/`, `tc-8/`, `tc-edge2/` — 各 TC のスクリーンショット
