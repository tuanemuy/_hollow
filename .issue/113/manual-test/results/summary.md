# テスト実行サマリー — Issue #113 manual-test

**実行日時:** 2026-05-21
**テストソース:** .issue/113/testing.md (エッジケース 1, 2 のみ実機検証)
**サーバー:** http://localhost:3000 (pnpm dev、main fetch worker のみ)

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-EDGE-1 | env 空ケースで Stub に倒れる | エッジ | BLOCKED (部分 PASS) | job 作成・outbox emit まで PASS。最終 `failed` 遷移は consumer worker 非起動のため未到達 |
| TC-EDGE-2 | `ADMIN_LLM_API_KEY` だけ設定 → Stub 維持 | エッジ | PASS (中核観点) / BLOCKED (最終遷移) | `pnpm dev` が `model is empty` で起動失敗しないこと、`/upload` で AnthropicOCRProvider constructor が走らず Stub に短絡することを実機で確認 |

**合計:** 2 件 (PASS: 1 中核観点 / BLOCKED: 2 最終遷移)

## 重要な観察

- **Issue #113 の DI 三項分岐ロジックは plan 通り動作**: TC-EDGE-2 で `adminLlmApiKey && adminLlmModel ? Anthropic* : Stub*` の AND 条件が partial 欠落時に Stub に短絡することを実機で確認。`AnthropicOCRProvider` / `AnthropicPDFExtractor` の constructor (`apiKey` / `model` 空チェック) は env 不揃い時に呼ばれないため、起動失敗は発生しない。
- **Issue #113 由来の不具合は検出されず**

## BLOCKED 理由 (Issue #113 とは独立)

- `pnpm dev` は main fetch worker のみ起動する構成で、`runIngestionJob` を dispatch する consumer worker (`wrangler.toml [env.consumer]`) は別 worker のため動かない
- `npx wrangler dev --env consumer` も wrangler 4.90.1 の制約 (`Disallowed operation called within global scope`) で起動失敗
- 同等の挙動は以下のテストで網羅される設計:
  - testing.md 項目 3: DI unit test (`serverCloudflare.test.ts`) - 4 ケース × OCR / PDF
  - testing.md 項目 4: `runIngestionJob.integration.test.ts` の Stub inject case
  - 両方とも自動テストで PASS 済

## 副次観察 (Issue #113 scope 外、Phase 4 起票候補)

- `signUp.ts` の `buildVerificationLink` が `/auth/verify` で URL 生成するが実ルートは `/verify-email`。シードデータ整備時に手動で `email_verified=1` を DB 更新して回避。

## 起票した Issue

- なし (Issue #113 由来の問題なし)

## クリーンアップ

- pnpm dev サーバー停止 (PID kill)
- agent-browser セッション全クローズ
- `.dev.vars` / `wrangler.toml` を backup から復元
- ポート 3000 解放確認済
