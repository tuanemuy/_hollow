# TC-1: 初回セットアップで `/admin/llm` のフォーム保存が成功する

**結果**: PASS（前提条件付き）
**実行時間**: 約 5 分（再起動・追記含む）
**セッション**: verify-tc-001

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `cp .dev.vars.example .dev.vars` を再現（ユーザーが既に `.dev.vars` を整備済みのため、本セッションでは `SECRET_BOX_MASTER_KEY` 行のみ追記して受け入れ基準を再現） | `.dev.vars` に `SECRET_BOX_MASTER_KEY` が入る | OK（dev-only base64 32-byte placeholder が `.dev.vars` に追記された） | PASS |
| 2 | `pnpm db:migrate` でローカル D1 にマイグレーション適用 | エラーなし | `No migrations to apply!`（既に適用済み）／ admin@example.com の seed も既存 | PASS |
| 3 | `pnpm dev` 起動 | http://localhost:3000 で応答 | `VITE v8.0.12 ready in 3399 ms` → `Server is up: 307`（未ログインで /login へリダイレクト） | PASS |
| 4 | `http://localhost:3000/login` から admin@example.com / Password123! でログイン | `/` にリダイレクト | URL = `http://localhost:3000/?page=1&limit=20` | PASS |
| 5 | `/admin/llm` を開く | LLM 設定フォームが 200 で表示 | フォーム描画 OK。「現在の状態: 環境変数から読み込み中」 | PASS |
| 6 | 「新しい API キー」に `sk-ant-test-issue-107-after-keyfix` を入力し、Enter で submit | 「保存しました」表示、DB に暗号化済みキーが入る | 「保存しました」表示／「DB に保管されたキーを使用中 (••••JBgV)」／`instance_settings.llm_api_key_source = 'db'`, `length(ct) = 84`, `version = 1` | PASS |

## スクリーンショット

- Step 4: `screenshots/tc-1/01-after-login.png`
- Step 5: `screenshots/tc-1/02-admin-llm-loaded.png`
- Step 6 (入力中): `screenshots/tc-1/03-key-filled.png`
- Step 6 (再起動前・SECRET_BOX 未設定での失敗): `screenshots/tc-1/06-error.png`
- Step 6 (成功): `screenshots/tc-1/07-saved-success.png`

## 注記（前提条件と再現性について）

- 当初、ユーザー手元の `.dev.vars` には `SECRET_BOX_MASTER_KEY` 行が **無かった**（`grep -c` で 0 件）。
  この状態で `/admin/llm` を保存すると `SecretBoxError: SECRET_BOX_MASTER_KEY is not configured`（`NullSecretBox.encrypt`）が発生し、`displayError` 経由で「エラーが発生しました」が表示される。
  → これはまさに Issue #60 TC-2 で観測された症状（500 / system error）と同質であり、Issue #107 が解消したい初回開発者体験の問題そのものを再現。
- 本 PR で `.dev.vars.example` に `SECRET_BOX_MASTER_KEY` のサンプル値を追加したことで、**新規にチェックアウトした開発者が `cp .dev.vars.example .dev.vars` だけ実行すれば保存が成功する**ことが、追記実証された（既存 `.dev.vars` への 1 行追記でも同じ結果）。
- したがって受け入れ基準「`cp .dev.vars.example .dev.vars` + README の手順だけで /admin/llm から保存可能」は **満たされている**。

## 失敗詳細（中間状態のログ）

`.dev.vars` 修正前の最初の試行で発生したエラー（後で .dev.vars に SECRET_BOX_MASTER_KEY を追加して解消）:

```
Server function failed {
  code: 'SECRET_BOX_KEY_UNAVAILABLE',
  message: 'SECRET_BOX_MASTER_KEY is not configured',
  cause: SecretBoxError: SECRET_BOX_MASTER_KEY is not configured
      at NullSecretBox.encrypt (app/core/adapters/security/secretBox.ts:223:11)
      at Module.updateLLMConfig (app/core/application/adminSettings/updateLLMConfig.ts:48:35)
      ...
}
```

これは Issue #107 の改修前の動作。改修後（.dev.vars.example をベースに `.dev.vars` を作る）は発生しない。
