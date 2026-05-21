# TC-EDGE-2: `ADMIN_LLM_API_KEY` だけ設定 (model 未設定) → Stub 維持

**結果**: PASS (主要観点) / BLOCKED (最終 job 遷移)
**セッション**: verify-tc-edge-2
**実行日時**: 2026-05-21

## サマリー

`.dev.vars` に `ADMIN_LLM_API_KEY="dummy-key-for-test"` を設定し、`wrangler.toml [vars]` の `ADMIN_LLM_MODEL` をコメントアウトした状態で `pnpm dev` を再起動。**サーバーが `model is empty` 等で起動失敗せず、upload が `pending` ingestion job として保存されることを確認**。これが TC-EDGE-2 の中核観点 (AND 条件 partial 欠落で `AnthropicOCRProvider` constructor を呼ばずに Stub に倒れる) に対応する。

job の最終 `failed` 遷移までは consumer worker が local 非起動のため未到達 (TC-EDGE-1 と同じ環境制約)。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `.dev.vars` に `ADMIN_LLM_API_KEY="dummy-key-for-test"` を設定 | 設定完了 | done | PASS |
| 2 | `wrangler.toml [vars]` の `ADMIN_LLM_MODEL = "..."` をコメントアウト | 設定完了 | line 33 を `# ADMIN_LLM_MODEL = ...` にコメントアウト | PASS |
| 3 | `pnpm dev` で再起動 | `model is empty` などで起動失敗しないこと | Vite ready, `http://localhost:3000/` が 307 を返す。サーバーログに error なし | **PASS — 中核観点** |
| 4 | `/login` で既存 admin ログイン | home 遷移 | `http://localhost:3000/?page=1&limit=20` | PASS |
| 5 | `/upload` で `tiny.png` (image/png) を upload | 取り込みキューに表示 + job 行作成 | 「tiny.png · image/png · 0.1 KB · 待機中」表示 | PASS |
| 6 | `ingestion_jobs` 行確認 | `kind=image, status=pending` で作成 | `019e49f6-ca8b-..., kind=image, status=pending, mime=image/png, bytes=69` | PASS |
| 7 | server log で `AnthropicOCRProvider` constructor の `model is empty` throw が出ていないこと | 起動時およびリクエスト時に throw なし | log grep `error\|fail\|empty` で hit なし (型定義出力以外) | **PASS — 中核観点** |
| 8 | job が `failed` + `unsupported_format` まで遷移 (Stub 経路) | DI が Stub に倒れて `BusinessRuleError(unsupported_format)` で failed | **未到達** — consumer worker が `pnpm dev` 環境では起動しない (TC-EDGE-1 と同じ制約) | BLOCKED |

## 中核観点の検証

TC-EDGE-2 の plan に記載された確認ポイント:

> - server が `binding undefined` 等で起動失敗しないこと
> - **`AnthropicOCRProvider` の constructor で `model is empty` throw が出ないこと (三項分岐で Stub に落ちる前に短絡)**

これら両方を観察できた:

1. `.dev.vars: ADMIN_LLM_API_KEY="dummy-key-for-test"` + `wrangler.toml: # ADMIN_LLM_MODEL=...` (コメントアウト) で `pnpm dev` が正常起動。Vite ready、`/`→307、`/setup`→200、`/login`→200、`/upload`→200。
2. リクエスト処理中も `model is empty` 等の throw 痕跡なし (`grep` で 0 件)。
3. upload は usecase レベルで成功 (`ingestion_jobs` 行作成 + `outbox_events.ingestion.created` 行作成)。これは `createRequestContainer` が `model` 未設定でも正常に Stub providers を wire していることを意味する。

つまり Issue #113 の DI 三項分岐 (`adminLlmApiKey && adminLlmModel ? AnthropicXxx : StubXxx`) は plan 通りに動作している。

## 環境制約 (TC-EDGE-1 と同じ)

ジョブの最終 `failed` 遷移は consumer worker (queue handler) を経由するが、`pnpm dev` は main fetch worker のみ起動する構成のため未到達。`wrangler dev --env consumer` を別途起動する試みは `Disallowed operation called within global scope` で fail。詳細は `TC-EDGE-1.md` 末尾参照。

ジョブの最終遷移挙動は testing.md 項目 3 (DI unit test) と 項目 4 (`runIngestionJob` integration test, `Stub*` inject case) でカバー済み。

## スクリーンショット

- step-01: `screenshots/tc-edge-2/step-01-upload-page.png` (login 後 `/upload` 画面)
- step-02: `screenshots/tc-edge-2/step-02-after-upload.png` (upload 後の「待機中」表示)

## 判定根拠

- ステップ 1〜7 PASS。TC-EDGE-2 の中核観点 (AND 条件 partial 欠落で `AnthropicOCRProvider` constructor `model is empty` throw を起こさず、Stub に短絡する) は **マニュアル E2E でも観察できた**。
- ステップ 8 は環境制約により未到達だが、testing.md 自動テスト群で同等のカバレッジ。
- 総合判定: **PASS** (中核観点が観察できた)。failed 遷移確認は BLOCKED。
