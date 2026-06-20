# ブラウザ検証レポート — Issue #738: 追加の文字起こしプロバイダ（Deepgram Nova-3）

**実行日**: 2026-06-21
**テストソース**: .issue/738/testing.md
**サーバー**: http://localhost:3000（pnpm dev / vite Cloudflare runtime）

## 結果概要

API キー不要で検証可能な UI 挙動（本 Issue の目玉である provider select 追加・provider 切替時の model 自動リセット）は **全 PASS**。実 Deepgram API キーが必要な接続テスト・実文字起こし（AC-5/AC-6）はキー未保有のため SKIP。これらの境界挙動は自動テスト（adapter 2xx/4xx/5xx/timeout/空発話・ping・registry dispatch・env>db>stub 構成解決）でカバー済み。

## 検証項目

### PASS
- **TC-001（AC-3）**: `/admin/speech` の provider select に「OpenAI」「Deepgram」の2択が表示される。
- **TC-002（AC-4）**: provider を Deepgram に切り替えると model 欄が `nova-3` に自動リセット、OpenAI に戻すと `gpt-4o-transcribe` に復帰。API キー placeholder・model ヒント文言も provider 連動で双方向切替。

### 間接確認
- **確認項目3（AC-4 env ロック抑制）**: デフォルト dev サーバー（env-lock 有効）では provider select / model 欄が disabled となり model リセットが抑制されることを観測。`if (!envOverrides.model)` のリセット抑制が実環境で効いていることの裏付け。

### SKIP（実 Deepgram API キー必須）
- 確認項目4（AC-5 接続テスト成功）/ 確認項目5（AC-6 実文字起こし）/ 異常系1（AC-5 認証失敗）/ 異常系2（AC-6 縮退）。
- 理由: 有効な Deepgram API キー（`Token` 形式）未保有。adapter の HTTP 境界・ping・registry dispatch・SecretBox/フォールバックは自動テストで担保済み（pnpm test:unit 4116 / test:integration 全 pass）。

## 環境操作の記録（後始末済み）
- AC-4 の核検証のため `wrangler.toml [vars]` の `ADMIN_SPEECH_PROVIDER`/`ADMIN_SPEECH_MODEL` を一時的に空にして env-lock を外し再起動 → 検証後に元の値（`openai` / `gpt-4o-transcribe`）へ復元。git diff なしを確認済み。
- dev サーバー停止・agent-browser セッション close 済み。
