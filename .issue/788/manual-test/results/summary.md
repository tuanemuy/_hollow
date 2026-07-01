# ブラウザ検証サマリー — Issue #788

**実行日:** 2026-07-01
**テストソース:** .issue/788/testing.md
**サーバー:** http://localhost:3001（`pnpm dev -- --port 3001`）

## 前提・環境調整（テスト用の一時変更・検証後に復元済み）

- **CSRF:** vite dev のポート（3001）と `wrangler.toml [vars]` の `APP_URL`（既定 8787）が不一致だと POST 系が cross-origin 403 になるため、`.dev.vars` に `APP_URL=http://localhost:3001` を一時追記（検証後に削除・復元済み）。
- **env ロック解除:** `wrangler.toml [vars]` の `ADMIN_SPEECH_PROVIDER`/`ADMIN_SPEECH_MODEL` が設定されていると env override で `/admin/speech` フォームが disabled になる（env > db 優先の既存 UX）。UI 保存パスを検証するため top-level の 2 行を一時コメントアウト（検証後に復元済み）。
- **ローカル AI binding 不在は仕様どおり:** ローカルは `env.AI` binding 未注入（→ Stub フォールバック）。実文字起こし・webm/opus 受理・E2E フルパスは staging 依存（ADR-006）でローカル対象外。

## 結果

| TC | テスト名 | 対応 AC | 結果 |
|----|---------|---------|------|
| TC-3 | `deepgram-workers-ai` を選択・保存できる | AC-3 / AC-5 | PASS |
| TC-4 | 接続テストが keyless ゲートを抜けて ping 経路へ到達 | AC-3 | PASS |
| TC-regression | 既存 REST provider（OpenAI/Deepgram/Gemini）の非回帰 | 既存機能影響 | PASS |

**合計:** 3 件（PASS: 3 / FAIL: 0）

### ローカル対象外（staging で確定・マージ後）

| 確認項目 | 対応 AC | 状態 |
|---|---|---|
| 実録音 webm/opus が 2xx + 非空 transcript で受理 | AC-2 後半 | staging 検証待ち |
| audio → 文字起こし → 構造化 → プレビュー → ノート保存 フルパス | AC-4 | staging 検証待ち |
| 接続テストが実 binding 存在下で `ok:true` | AC-3 実疎通 | staging 検証待ち |

（AC-1=ADR 記録済み、AC-2 前半=`pnpm typecheck` PASS、AC-6=`pnpm test:unit` PASS、AC-7=spec 更新済み）

## 要点

- **TC-3:** 既定 `openai` → `deepgram-workers-ai` への切替（`providerChanged=true` かつ鍵なし）を保存しても `SpeechProviderChangedRequiresApiKey` / `SpeechEnvOverrideMissingKey` / `No api key available` 系のサーバ側ゲートエラーは一切出ず「保存しました」で成功。切替時にモデルが `@cf/deepgram/nova-3` に自動セットされ、API キー欄は通常入力欄が消えて「不要（Cloudflare が管理）」表示に分岐、鍵不要の注記も表示。再読込後も `deepgram-workers-ai` / `@cf/deepgram/nova-3` が保持。→ 6 ゲートの keyless 分岐が UI→サーバアクション→ユースケース→DB のエンドツーエンドで機能していることを実証。
- **TC-4:** 接続テスト表示は「接続失敗 · AI binding is not configured」。これは `adapter.ping` まで到達した証拠（ローカルは binding 未注入なので ping 失敗が想定内）。`No api key available` 等のキー不在ゲート短絡ではないため仕様どおり PASS。
- **TC-regression:** REST 版 Deepgram を選ぶと通常の API キー入力欄（required）＋「プロバイダ変更で再入力必要」アラートが表示され、keyless 免除は REST に波及していない。select は OpenAI / Deepgram / Gemini / Deepgram (Workers AI) の 4 択が並存。

## 検証中に発見・修正した問題（本ブランチで対応済み）

- **ローカル `pnpm dev` の boot 不能:** `wrangler.toml`（ローカル）に `[ai] binding` を宣言すると、Workers AI はローカルモックを持たないため vite/wrangler dev が remote-proxy モードに入り、`wrangler login` 未認証だと**起動そのものが失敗**する（speech 機能に限らずローカル開発全体が壊れる）。→ ローカル `wrangler.toml` からは `[ai]` を外し（不在時は Stub フォールバックで graceful）、staging/production の infra テンプレートにのみ binding を宣言する形に修正（ADR-008）。
