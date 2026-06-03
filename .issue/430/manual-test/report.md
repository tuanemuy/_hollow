# ブラウザ検証レポート — Issue #430

**実行日:** 2026-06-03
**テストソース:** `.issue/430/testing.md`
**サーバー:** http://localhost:5180（`pnpm dev --port 5180`）
**ツール:** agent-browser 0.27.0

## サマリー

| TC | 対象 | 種別 | 結果 |
|----|------|------|------|
| TC1 | P23 `/settings/prompts` 文言整合（残課題1） | UI 表示 | **PASS（全6項目）** |
| TC2 | admin `/admin/prompts` title/directory 導線（残課題2 補助） | 文言 PASS / 保存実動作 BLOCKED（環境要因） |

## TC1: P23 文言整合（残課題1） — 全項目 PASS

| 項目 | 確認できた文言 | 判定 |
|------|---------------|------|
| セクション説明 | 「各用途について、あなたの分析の意図を補足できます。空欄のままならシステム既定の動作が適用されます。」 | PASS |
| textarea ラベル | 「あなたの分析の指示（任意）」 | PASS |
| placeholder | 「あなたの分析の意図を記入（空欄ならシステム既定の動作）」 | PASS |
| 空保存バリデーション | 「分析の指示を入力してください（空にする場合は「デフォルトに戻す」を使用）」 | PASS |
| ミスリード表現の不在 | 「全文上書き／プロンプト本文」が画面上 0 件 | PASS |
| デフォルトプロンプト details 残存 | `<details>デフォルトプロンプト</details>` 存在 | PASS |

スクリーンショット: `screenshots/p23-loaded.png`, `screenshots/p23-validation.png`

## TC2: admin title/directory 導線（残課題2 の UI 補助確認）

- 画面文言は #396 の意図モデルに整合（ラベル「分析の指示（任意）」、title placeholder「どう分析してほしいかの意図を記入…」、説明「どんな観点でタイトルを付けてほしいかの意図を補足できます」）。
- title カードへの入力で保存ボタンが活性化（配線正常）。
- **保存 POST は BLOCKED**: dev server を 5180 で起動したが `wrangler.toml` の `APP_URL` が 8787 のため、`csrfMiddleware` が `FORBIDDEN_CROSS_ORIGIN` で state-changing server function を 403。**#430 の実装起因ではなく検証環境のポート不一致**。
- 残課題2 の本体（title/directory 意図の LLM 送出反映）は実 LLM が必要で定性確認はローカル困難なため、自動テストで担保:
  - `app/core/adapters/llm/__tests__/prompts.test.ts`（追記の有無・位置・非対称配置・JSON 契約 tail 維持）
  - `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts`（title/directory の resolveFor 解決・structureToHtml 伝播）

スクリーンショット: `screenshots/admin-prompts-title-save-attempt.png`

## 起票した Issue

なし（FAIL は環境要因のみで実装バグなし）。

## 補足

admin 保存導線をブラウザで実検証する場合は dev server を `APP_URL` と同じ 8787 で起動するか `wrangler.toml` の dev 用 `APP_URL` を合わせる必要がある。これは #430 とは独立した検証環境の設定差。
