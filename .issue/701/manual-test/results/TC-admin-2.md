# TC-admin-2 — 無効キーで接続テスト失敗（AC-1 / 項目2）

- **対応:** Issue #701 testing.md 確認項目2
- **実行日:** 2026-06-14
- **結果:** BLOCKED（UI 経路）／ コードレビューで設計準拠を確認（throw しない・401/403 を `{ok:false}` に畳む）

## 操作と結果

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | `/admin/speech` で API キーに `sk-invalid` を入力 | 入力できる | 入力可 | PASS |
| 2 | 「接続テスト」を押す | 「接続失敗」(401/403 由来) が UI 表示、throw でクラッシュしない | `_serverFn` POST が **HTTP 403**（CSRF）。UI は「権限がありません」。OpenAI への probe まで到達せず | BLOCKED |

## BLOCKED の原因

TC-admin-1 と同一。CSRF ミドルウェアが state-changing POST を `APP_URL(8787) != dev origin(3000)` で 403 拒否するため、
`testSpeechConnectionFn` のハンドラ（実 OpenAI probe）まで到達しない。検証ハーネスの APP_URL/ポート不一致が原因で、実装バグではない。

## 代替検証（コードレビュー）

UI 経由で probe を発火できないため、実装の正しさをコードで確認した（PASS 相当）:

- ポート `SpeechConnectionTester.ping` は `{ok, latencyMs, error?}` を返す契約（throw しない）。
  `app/core/domain/adminSettings/ports/speechConnectionTester.ts`
- OpenAI アダプタ `app/core/adapters/openai/speechConnectionPing.ts` は
  `GET https://api.openai.com/v1/models/{model}`（実音声を送らない軽量 probe, ADR-006 準拠）。
  全体を try/catch で包み、**401/403/ネットワークエラー/タイムアウトのいずれも throw せず** `{ok:false, reason:...}` を返す。
  401 は `{ok:false, reason:"invalid_api_key: ..."}`。秘密値は `maskSecrets` でマスク。
  既存ユニットテストに「reports auth failure on 401」あり。
- usecase `testSpeechConnection.ts` も全出力を `{ok, latencyMs, error}` に畳み、throw しない。
- DI 登録あり（`serverCloudflare.ts:739` `speechConnectionTester: new HttpSpeechConnectionTester()`）。

→ 無効キー → 認証失敗を `{ok:false}` として UI に反映する設計・実装は確認できた。
  実 401 応答での E2E 反映だけが CSRF 環境制約で未実施。
