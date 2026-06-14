# TC-admin-1 — `/admin/speech` の存在・フォーム・保存（AC-1 / 項目1）

- **対応:** Issue #701 testing.md 確認項目1
- **実行日:** 2026-06-14
- **環境:** dev `http://localhost:3000`、admin セッション注入（`__Host-session=dev-admin-session-token`）
- **結果:** PARTIAL（フォーム表示=PASS / UI 保存=BLOCKED / 接続テスト=SKIP）

## 操作と結果

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | `/admin` を開く | 管理ダッシュボード表示 | 「管理ダッシュボード — hollow」表示、ログイン状態 OK | PASS |
| 2 | 左ナビに「文字起こし設定」があり `/admin/speech` を開く | LLM 設定と独立した項目・画面 | ナビに「文字起こし設定」(ref e5) が「LLM 設定」(e4) と別に存在。`/admin/speech` が独立して開き、title「文字起こし設定 — hollow」 | PASS |
| 3 | フォーム要素を確認 | provider(openai)/model/APIキー入力＋保存 | combobox「プロバイダ」=OpenAI、textbox「新しい API キー」、button「接続テスト」、textbox「既定モデル」=gpt-4o-transcribe、button「変更を保存」が揃う | PASS |
| 4 | API キー `sk-test-dummy` ＋ model `gpt-4o-transcribe` を入力し「変更を保存」 | 保存成功、DB に speech_* が入る | UI に「権限がありません」表示。`_serverFn` POST が **HTTP 403**。DB は更新されず（後述） | BLOCKED |
| 5 | 接続テスト成功確認 | 2xx 成功 | キー無し（`ADMIN_SPEECH_API_KEY` 未設定）のため SKIP | SKIP |

## DB 確認（保存後）

```
wrangler d1 execute hollow-local-d1 --local --command \
  "SELECT speech_provider, speech_model, speech_api_key_source, (speech_api_key_ciphertext IS NOT NULL) AS has_ct FROM instance_settings;"
```

| speech_provider | speech_model | speech_api_key_source | has_ct |
|---|---|---|---|
| openai | NULL | env | 0 |

保存前と同一（= UI 保存が DB に到達していない）。ciphertext は NULL のまま。

## BLOCKED の原因（実装バグではない）

保存 POST が 403 になるのは **CSRF ミドルウェアの cross-origin 拒否**。
`app/core/presentation/csrfMiddleware.ts` は state-changing POST の `Origin`（無ければ `Referer`）が
`config.appUrl` と同一オリジンでなければ `ForbiddenError("FORBIDDEN_CROSS_ORIGIN")` を投げる。
これは `errorDisplay.ts` で `kind:"forbidden"` → 「権限がありません」に写像される。

- `config.appUrl = env.APP_URL`（`serverCloudflare.ts:368`）
- wrangler.toml の `APP_URL = "http://localhost:8787"`（vite dev の `port:3000` と不一致）
- ブラウザは `Origin` を送らず `Referer: http://localhost:3000/admin/speech` → `isSameOrigin(...,"http://localhost:8787")=false` → 403

valid な admin cookie を入れてページ（GET loader）は正常表示されるのに POST だけ 403 になることで、auth ではなく CSRF が原因と確定。
LLM 設定の保存も同条件なら同様に 403 になる（speech 固有の不具合ではない）。

→ 検証ハーネスの環境設定（APP_URL とポートの不一致）が原因。`/admin/speech` の保存ロジック自体の合否は本 UI 経路では判定不能。
```
APP_URL を http://localhost:3000 に合わせて dev を再起動すれば UI 保存が実行可能になる見込み（コード修正は不要）。
```
