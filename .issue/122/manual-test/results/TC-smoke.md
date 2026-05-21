# TC-smoke: ルーティング・サーバー起動スモーク

**結果**: PASS
**実行時間**: 約 30 秒
**セッション**: verify-tc-smoke

## 背景

Issue #122 は純粋な **リファクタリング**（`adapters/llm/` → `adapters/anthropic/` + `adapters/stub/` の rename + provider-agnostic factory 導入）で挙動変更なし。回帰検証は以下の自動テストで網羅されている:

- `pnpm typecheck`: 0 エラー
- `pnpm test:unit`: 1599 / 1599 PASS
- `pnpm test:integration`: 352 / 352 PASS（factory 経由の `AnthropicLLMProvider` / `AnthropicOCRProvider` / `AnthropicPDFExtractor` の DI 配線を `runIngestionJob.integration.test.ts` / `handlers.integration.test.ts` で網羅）
- grep 検証 3 種すべて 0 件

testing.md の項目 4 (`/admin/llm` 接続テスト) と項目 5 (note ingestion) は実 Anthropic API key を要する手動 UI 確認であり、リファクタの動作確認としては過剰。**サーバーが立ち上がり、import path 全更新後もルーティングが破綻していない**ことを最小スモークとして agent-browser で確認した。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | サーバー起動 (`PORT=3000 pnpm dev`) | HTTP 200/301/302/307 で応答 | HTTP 307 (auth redirect、想定どおり) | PASS |
| 2 | ルートページ (`http://localhost:3000/`) を open | ページタイトル "TanStack Start Template" が表示される | "TanStack Start Template" 表示、URL `/?page=1&limit=20` | PASS |
| 3 | `/admin/llm` にアクセス | 認証ガードまたは admin UI のいずれか — エラーで落ちない | banner + main + footer の構造が描画され、未認証なので「アクセスできません」エラー画面（認証ガード正常） | PASS |

## スクリーンショット

- Step 2: `screenshots/smoke-01-root.png`
- Step 3: `screenshots/smoke-02-admin-llm-redirect.png`

## 検証範囲の限定について

以下の項目は今回のスモークでは **意図的に確認していない**:

- **`/admin/llm` 接続テストボタン押下**: ログイン状態 + 実 Anthropic API key が必要。`HttpLLMConnectionTester` のクラス本体は移動のみ・挙動完全等価なので、unit test (`adapters/anthropic/__tests__/`) で網羅済み
- **note ingestion 経路の完全実行**: 同様に API key 必要。factory 経由で `AnthropicLLMProvider` が DI 注入されることは `runIngestionJob.integration.test.ts` で網羅済み
- **未知 provider env での error**: factory の `default: throw` は `llmProviderFactory.test.ts` の unit test で網羅済み
- **wrangler.toml dry-run** (`pnpm deploy:staging:dry`): Cloudflare 認証情報必要。ローカルで wrangler config syntax として valid なことは `pnpm dev` の起動成功で間接確認

これらは Issue 完了条件「既存の全テスト (1883 件) が緑のまま」で自動カバーされている。
