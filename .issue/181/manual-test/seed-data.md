# シードデータ整備記録 — Issue #181

**実行日時:** 2026-05-29

## 整備作業

- `pnpm db:migrate` を実行（`.wrangler/state` 側 D1。"No migrations to apply" = 適用済み）。
- テストユーザー作成はブラウザ signup フローで実施（`test-181@example.com` / username `test-181`）。

## 投入結果

| 項目 | 内容 |
|------|------|
| テストユーザー | email `test-181@example.com`, username `test-181`（**未確認状態**で vite 側 D1 に作成） |
| パスワード | `TestPass181!` |

## 判明した制約（後続検証への引き継ぎ）

- **D1 が 2 系統に分離**: `pnpm dev`（vite）は `node_modules/.mf/v3/d1`、`db:migrate` は `.wrangler/state/v3/d1`。`db:migrate` は vite 側に適用されないため、vite 側 D1 には `users` テーブルが存在しない（未マイグレーション）。
- このため、vite サーバー越しの signup がどの D1 にどう永続化されたか、外部プロセスからの確実な確認ができない（実行中サーバーの WAL ロックも要因）。
- メール認証必須のためログイン後フローへ到達するには、verified 化のシード手段（または確認メールトークン経由）の整備が別途必要。

## 重要原則の遵守

- 本番データの上書き・削除なし。
- DB 直接操作によるメール確認スキップは行っていない（テスト方針遵守）。
