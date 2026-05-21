# TC-1: 新規環境 (instance_settings 行不在) → default フォールバック

## Status: PASS

## 検証目的
`instance_settings` テーブルが空のとき、`/admin/llm` が 200 を返し、ドメインデフォルト値でフォーム表示されること。

## 前提
- `instance_settings` 行数: 0
- 管理者: `admin@example.com` / `Password123!`

## 手順と結果

| # | 手順 | 期待 | 実測 |
|---|------|------|------|
| 1 | DB 状態確認 (`SELECT count(*) FROM instance_settings`) | 0 | 0 |
| 2 | `/login` で admin ログイン | リダイレクト成功 | `http://localhost:3000/?page=1&limit=20` |
| 3 | `/admin/llm` へ遷移 | 200 表示 | ページ表示 OK |
| 4 | LLM 設定フォーム描画 | プロバイダ / API キー / モデルセクション可視 | 「Anthropic Claude」「既定モデル: claude-3-5-sonnet-latest」 (default) |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-1/admin-llm.png`

## 所見
行不在からデフォルト ServiceConfig（`claude-3-5-sonnet-latest`、apiKeySource=env）を返す挙動が Issue #60 のパッチで正しく機能。
