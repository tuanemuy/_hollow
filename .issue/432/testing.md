# 動作確認計画 — Issue #432: testLLMConnection の env apiKey 判定も length>0 に揃える

**Issue:** #432
**作成日:** 2026-06-03

---

## 確認環境

本 Issue は backend usecase（`testLLMConnection`）の presence 判定 1行変更であり、
検証は integration test（cloudflare:test ワーカー環境）で担保する。ブラウザ実機確認は不要
（UI 変更なし・admin 接続テスト経路の内部 presence 判定のみ）。

### 検証環境の起動
- `pnpm test:integration`（`vitest run --config vitest.config.integration.ts`）
  — `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` を実行。
- 静的検査: `pnpm typecheck` / `pnpm lint:fix` / `pnpm format`。

### デプロイ方法
なし（検証環境のみで確認できる）。

## 確認項目

### 1. whitespace-only env apiKey で DB へフォールバックしない

- **目的:** `ADMIN_LLM_API_KEY="   "` のとき env が presence ありと判定され（`length > 0`）、
  DB 値へフォールバックしないことを確認する。
- **手順:**
  1. `pnpm test:integration` を実行。
  2. `describe("testLLMConnection")` の新規 whitespace 回帰テストを確認。
- **期待結果:** env 値が勝ち resolvedKey は whitespace → 97行目の実質空ガードで
  `ok=false` / `"No api key available for the configured LLM provider"`、tester は未呼出。
- **確認ポイント:** 修正前（`trim().length > 0`）ではこのテストが失敗する（DB フォールバックで `ok=true`）。

## 既存機能への影響確認

- `describe("testLLMConnection")` の既存 4 ケース（非空文字列 env key）は挙動不変であること。
- `describe("updateLLMConfig")` の env-override 系テストに影響がないこと。

## 確認チェックリスト

- [ ] `pnpm test:integration` がパス（新規回帰テスト含む）
- [ ] `pnpm typecheck` がパス
- [ ] `pnpm lint:fix && pnpm format` で差分なし
- [ ] 既存 testLLMConnection / updateLLMConfig テストが引き続きパス
