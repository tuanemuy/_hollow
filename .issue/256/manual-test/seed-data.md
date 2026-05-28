# Seed Data — Issue #256

実行日: 2026-05-28

## 整備内容

既存の local D1 DB に baseline seed が投入済み（`.manual-test/2026-05-17/seed.sql`）。
本 Issue では追加投入なし — baseline ユーザーで UploadDialog の動作確認を行う。

## DB 状況

- DB: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite`
- マイグレーション: 既に local apply 済み（再 apply 不要）

## 使用するアカウント

| 用途 | email | password | user_id |
|---|---|---|---|
| 主検証 | existing@example.com | Password123! | 01938f00-0000-7000-8000-0000000000a1 |

## メモ

- ポート 5173 は他 worktree が使用中。Vite は自動で 5174 にフォールバックする。
- LLM 設定（`.dev.vars`）は Anthropic claude-haiku-4-5。API key は dev 用が設定済み。
- アップロードは小さいテキストファイルを使い、推論完了まで数十秒待つ前提。
