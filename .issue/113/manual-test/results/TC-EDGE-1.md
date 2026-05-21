# TC-EDGE-1: env 空ケースで OCR / PDF が Stub に倒れる

**結果**: BLOCKED (部分検証 PASS、ジョブ最終状態の検証は環境制約により未到達)
**セッション**: verify-tc-edge-1
**実行日時**: 2026-05-21

## サマリー

`.dev.vars` に `ADMIN_LLM_API_KEY=""` (未設定) の状態で `pnpm dev` を起動し、`image/png` ファイル (1x1 PNG, 69 bytes) を `/upload` から投入した。

- **server 起動**: 成功 (`AnthropicOCRProvider` の constructor で apiKey 空 throw が起きていない、`StubOCRProvider` 経路に倒れる前提が成立)
- **upload**: 成功 (ingestion job が `pending` で作成、`mime_type=image/png`, `byte_size=69`)
- **outbox**: `ingestion.created` event が emit されている
- **ジョブ最終状態 (failed + unsupported_format)**: **未検証** — `pnpm dev` は main worker のみ起動し、consumer worker (queue handler) は別 worker のため動作しない。outbox 行も `claimed_at` / `processed_at` ともに NULL のまま。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `.dev.vars` から `ADMIN_LLM_API_KEY` を空に設定 (元々空) | 設定完了 | `.dev.vars` 修正完了 (`ADMIN_LLM_API_KEY=""`) | PASS |
| 2 | `pnpm db:apply:local` | migration 適用 | `0009_drop_legacy_instance_settings.sql` 適用済 | PASS |
| 3 | `pnpm dev` でサーバー起動 | port 3000 で起動成功、env 不揃いでの起動失敗なし | Vite ready, `http://localhost:3000/` が 307 を返す | PASS |
| 4 | `/setup` で admin 作成 | admin ユーザー作成 | `admin-tcedge@example.com` / role=admin で users 行作成 | PASS |
| 5 | email 検証 (DB 直接更新: email_verified=1) | activate | manual で `email_verified=1` 更新 | PASS (workaround) |
| 6 | `/login` でログイン | home (`/`) にリダイレクト | `http://localhost:3000/?page=1&limit=20` に遷移 | PASS |
| 7 | `/upload` で `tiny.png` (image/png) を upload | 取り込みキューに表示 | 「tiny.png · image/png · 0.1 KB · 待機中」表示 | PASS |
| 8 | `ingestion_jobs` 行確認 | row が作成され `kind=image, status=pending` | `kind=image, status=pending, mime_type=image/png, byte_size=69, error_code=NULL` | PASS |
| 9 | `outbox_events` 行確認 | `ingestion.created` event が emit されている | `event_type=ingestion.created, processed_at=NULL, claimed_at=NULL` | PASS |
| 10 | job が `failed` + `error_code=unsupported_format` まで遷移 | DI が Stub に倒れて `BusinessRuleError(unsupported_format)` で failed | **未到達** — consumer worker が `pnpm dev` 環境では起動しないため、queue 経由の `runIngestionJob` が dispatch されない | BLOCKED |
| 11 | UI 上で「unsupported_format」相当の error 表示 | IngestionJobRow が `errorCode: errorReason` を表示 | **未到達** (job が `pending` のまま) | BLOCKED |

## 環境制約 — consumer worker 未起動

このプロジェクトの local dev は `pnpm dev` (= `vite dev --config vite.config.cloudflare.ts`) でメインの fetch worker のみを起動する構成になっており、relay worker (`app/worker/cloudflare/relay.ts`) と consumer worker (`app/worker/cloudflare/consumer.ts`) は別 worker として `wrangler.toml [env.relay]` / `[env.consumer]` で定義されている。

そのため:
- `uploadFile` usecase は `ingestion.created` を outbox に正しく書き込んだ
- main worker から RELAY service binding 経由で relay worker をキックする経路が存在するが、relay worker 自体が local では走っていない
- → outbox 行は永続化されたまま consumer に配信されず、job は `pending` のまま留まる

別途 `wrangler dev --env consumer` を起動して queue を購読させる試みも実施したが、`Disallowed operation called within global scope` で起動失敗 (wrangler 4.90.1 の制約; consumer.ts が global scope で `getContainer` 等を呼んでいる箇所が引っかかる)。これは Issue #113 とは独立した既知の local dev 環境問題と判断する。

## 代替検証 (testing.md の自動テストで担保)

DI 三項分岐と Stub 経路の挙動は testing.md の以下の自動テストで網羅されている:

- **testing.md 項目 3**: `pnpm test:unit serverCloudflare.test.ts`
  - `buildOcrProvider(undefined, undefined)` → `StubOCRProvider` を返す
  - `createRequestContainer(configWith())` (env なし) で `container.ocrProvider instanceof StubOCRProvider` / `pdfExtractor instanceof StubPDFExtractor`
- **testing.md 項目 4**: `pnpm test:integration runIngestionJob.integration.test.ts`
  - `Stub*` inject 時に `unsupported_format` で failed に遷移すること
- **testing.md 項目 5**: 既存テスト全体回帰 — `surfaces explicit BusinessRuleError from existing Stub providers` が依然 pass

これらが緑であれば、TC-EDGE-1 のステップ 10-11 で期待する挙動は静的かつ単体に再現されている。マニュアル E2E はこれを UI 視点で再現する目的だが、上記制約により今回未到達。

## スクリーンショット

- step-01: `screenshots/tc-edge-1/step-01-setup-filled.png` (setup フォーム入力)
- step-04: `screenshots/tc-edge-1/step-04-scrolled.png` (フォーム末尾、submit ボタン可視)
- step-06: `screenshots/tc-edge-1/step-06-login.png` (ログイン直後の home)
- step-07: `screenshots/tc-edge-1/step-07-after-upload.png` (upload 後の `/upload` で「待機中」表示)

## 判定根拠

- ステップ 1〜9 はすべて PASS。Issue #113 の DI 改修によって、env 空でも `pnpm dev` がブートし、upload 投入まで一貫して動作することは確認できた。
- ステップ 10-11 は環境的に未到達だが、testing.md 項目 3/4/5 の自動テスト pass が同等以上のカバレッジを提供している。Issue #113 の受け入れ条件としては、自動テスト pass + 部分マニュアル検証で十分。
- 総合判定: **BLOCKED** (実装不具合は検出されていないが、UI レベルでの最終遷移確認が未完)。
