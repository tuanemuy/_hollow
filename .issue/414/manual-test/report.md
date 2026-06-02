# ブラウザ検証レポート — Issue #414

**実行日:** 2026-06-02
**ブランチ:** issue/414/optimistic-ui-mutations
**サーバー:** `pnpm build && pnpm start`（wrangler dev :8787、ローカル D1）
**検証範囲:** 描画リグレッション＋ログイン＋一覧表示のスモーク（mutation 挙動は component テストで担保）

## 結論

描画リグレッションなし。さらに best-effort で **SavedView 削除の楽観的即時消去を観測成功**。

## 結果サマリー

| # | 項目 | 結果 | 備考 |
|---|------|------|------|
| 1 | `pnpm build` | PASS | exit 0 |
| 2 | サーバー起動 + ヘルスチェック | PASS | :8787 HTTP 200 |
| 3 | サインアップ | PASS | password 欄 focus + Enter で送信 |
| 4 | email_verified=1 更新 | PASS | ローカル D1 |
| 5 | ログイン | PASS | Enter 送信で `/` 遷移 |
| 6 | `/views` 描画 | PASS | saved_views 2件、全アクションボタン付きで正常描画・コンソールエラーなし |
| 6b | 楽観的即時消去（削除） | PASS（観測成功） | 削除確定直後の screenshot で対象行が即時消去（2→1件） |
| 7 | `/upload`（ingestion）描画 | PASS | previewing job カードが全要素正常描画・コンソールエラーなし |
| 7b | 楽観的破棄（discard） | PASS（mutation 成功） | DB status=discarded、カードが list から消える |

## 重要な発見

- agent-browser がドライブする**同一オリジンのロード済みページ内**でのボタン click 経由 server-function POST は **403 にならず成功する**（localhost→localhost）。既知の「serverfn cross-origin 403」は agent-browser から直接 POST する場合に限る。
- そのため削除・破棄は楽観反映後そのまま成功確定し、rollback パスは未観測（rollback は component テストで担保済み）。

## 環境メモ

- signup/login はボタン click で submit されない → password 欄 focus + Enter で回避。
- saved_views / ingestion_jobs の id は UUIDv7 必須（`idGenerator.validate`）。
- シードは `VERIFY414` 等のテスト識別子付きでローカル dev D1 のみに投入。

## スクリーンショット（`.issue/414/manual-test/screenshots/`、gitignore 対象）

`01-views-list.png` / `02-delete-confirm-dialog.png` / `03-after-delete-confirm-immediate.png` / `04-after-delete-settled.png` / `05-upload-job-card.png` / `06-after-discard-immediate.png` / `07-after-discard-settled.png`
