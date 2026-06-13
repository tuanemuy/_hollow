# Manual-test seed (Issue #538)

`.issue/538/testing.md`（アップロード導線の「投げっぱなし＋キュー編集」再設計）の動作確認用。

**Date:** 2026-06-13
**Database:** local D1 `hollow-local-d1`（`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`）

## 実行した準備作業

```bash
pnpm db:migrate      # "No migrations to apply!"（既適用）
pnpm seed:dev-admin  # idempotent — dev-admin ユーザー＋固定セッション投入済み
```

ローカル D1 の `ingestion_jobs` は 0 件（クリーンな状態からテスト開始できる）。

## ログイン方法（dev-admin）

| username | email | role | session token |
|---|---|---|---|
| `dev-admin` | `dev-admin@example.com` | admin (active) | `dev-admin-session-token` |

パスワードログインではなく、固定セッショントークンをクッキー注入する方式:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

クッキー名は `__Host-session`（Secure 必須）。注入後にページを開けば認証済みになる。

## LLM キーの状態

取り込みジョブを `pending → processing → previewing` まで進めるには LLM が必要。

- **DB（`instance_settings`）には LLM 設定行なし**（テーブルは空 / `/admin/llm` 未保存）。
- ただし `.dev.vars` に **env override** が揃っており、`ADMIN_LLM_API_KEY` と
  `ADMIN_LLM_MODEL` の両方が truthy のとき DI（`app/core/application/di/serverCloudflare.ts`）が
  env 値で LLM プロバイダを構成するため、**`/admin/llm` での保存操作は不要**。

`.dev.vars` のキー名（値はマスク、すべて非空を確認済み）:

| キー | 状態 |
|---|---|
| `ADMIN_LLM_PROVIDER` | set |
| `ADMIN_LLM_MODEL` | set |
| `ADMIN_LLM_API_KEY` | set |
| `BETTER_AUTH_SECRET` / `SECRET_BOX_MASTER_KEY` | set（セッション署名 / at-rest 暗号化） |
| `GOOGLE_CLIENT_*` / `R2_*` / `ADMIN_SETUP_TOKEN` | set（本テスト未使用） |

万一 env override が効かない場合のフォールバック手順:
`/admin/llm` を dev-admin で開き、プロバイダ・モデル・API キー（`.dev.vars` の
`ADMIN_LLM_PROVIDER` / `ADMIN_LLM_MODEL` / `ADMIN_LLM_API_KEY` の値を転記）を入力して保存する。
保存値は `instance_settings.llm_api_key_ciphertext` に暗号化保存される。

ローカル dev の relay/consumer（domain event dispatch）は `DEV_INLINE_RELAY` 系の
InlineRelayTrigger で動作する（testing.md 前提どおり `pnpm dev` でジョブが進行する）。

## テストファイル（/tmp/manual-test-538/）

| ファイル | 用途 |
|---|---|
| `test-note-1.md` (270B) | 確認項目 1（単一アップロード）・4（編集→commit） |
| `test-note-2.md` (292B) | 確認項目 2（複数アップロード） |
| `test-note-3.md` (223B, Front Matter 付き) | 確認項目 2・4（FM 編集の検証に便利） |
| `test-note-4.md` (213B) | 確認項目 5（破棄・再生成）・6（バッジ） |
| `invalid-binary.bin` (2KB ランダムバイナリ) | エッジケース 1・2（失敗ファイル） |

### 検証ロジックの注意（エッジケース 1・2 の解釈）

クライアント検証（`app/components/ingestion/UploadForm.tsx` の `validateUploadFiles`）は

1. `IngestionService.detectKind(mime, name)` — MIME / 拡張子で kind 判定不可なら **unsupported として client 側で弾く**
2. `file.size > DEFAULT_MAX_INGESTION_BYTES`（50MB）— **oversized も client 側で弾く**

ため、「クライアント検証を通過してサーバーで失敗する」ファイルを静的に用意するのは難しい
（不正拡張子もサイズ超過も client で止まる）。`invalid-binary.bin` は **client 検証で
unsupported として弾かれる**ことを確認する用途で使う（testing.md エッジケース 1・2 は
インラインエラー表示の確認として実施。サーバー失敗を再現したい場合はネットワーク切断や
DevTools でのリクエスト改変が必要）。

## 注意

- dev サーバーは未起動（manual-test 本体が `pnpm dev` で起動する。port 3000 固定）。
- 既存データは破壊していない（migrate は no-op、seed は idempotent）。
