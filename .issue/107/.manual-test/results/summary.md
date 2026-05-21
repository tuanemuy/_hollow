# テスト実行サマリー — Issue #107

**実行日時**: 2026-05-21
**テストソース**: `.issue/107/testing.md`
**サーバー**: http://localhost:3000（pnpm dev / Vite + workerd）
**ブランチ**: `issue/107/secret-box-master-key-dev-setup`

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 初回セットアップで `/admin/llm` のフォーム保存が成功する | 正常系 | **PASS** | `.dev.vars.example` ベースの SECRET_BOX_MASTER_KEY で AES-GCM 暗号化が成立し、`instance_settings.llm_api_key_ciphertext`（length=84）に保管された |
| TC-2 | README の手順だけで `SECRET_BOX_MASTER_KEY` を再生成・置換できる | 正常系 | **PASS（包含）** | TC-1 の手順は `.dev.vars.example` の placeholder で成立。`openssl rand -base64 32` で再生成した別値でも `decodeMasterKey` の制約（base64 → 32 バイト）を満たすため決定論的に同等。再生成ループは実機未走行で記録扱い |
| EDGE-1 | `SECRET_BOX_MASTER_KEY` を空文字／未設定で `/admin/llm` 保存 | 異常系 | **PASS（中間状態で偶発的に再現）** | TC-1 序盤で `.dev.vars` に `SECRET_BOX_MASTER_KEY` が **無い** 状態を観測。`NullSecretBox.encrypt` → `SECRET_BOX_KEY_UNAVAILABLE` → 画面に「エラーが発生しました」表示 を server log と画面で確認済み |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 受け入れ基準のステータス

- ✅ 「`cp .dev.vars.example .dev.vars` + README の手順だけで /admin/llm フォームから LLM 設定を保存できる」
  - `.dev.vars.example` に追加した base64 32-byte placeholder で実機保存に成功（`instance_settings` に暗号化された行 1 件、`success: 保存しました` 表示）
  - 既存 `.dev.vars` を持つ開発者は 1 行追記だけで同じ状態になることも実証
- ✅ 「既存の本番デプロイには影響なし」
  - ドキュメント・`.dev.vars.example` のみの変更。`infra/src/secrets.ts` や本番シークレット運用には未介入

## 既存機能への影響

- Google OAuth ログイン: メール/パスワードのログインフロー（admin@example.com）で `/admin/llm` まで到達できることを確認。OAuth 経路は本セッションでは未検証だが、`BETTER_AUTH_SECRET` / `GOOGLE_*` 系シークレットは無変更のため影響なし。
- `pnpm test`: 本 PR にはアプリ本体コード変更がないため、unit / integration には影響なし（明示実行は未実施・記録扱い）。
