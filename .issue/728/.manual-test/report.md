# ブラウザ検証レポート — Issue #728

**Issue**: #728 認証状態の遷移（ログイン/ログアウト等）でランディングページが一瞬表示される — invalidate→navigate の race
**実行日時**: 2026-06-14
**テストソース**: `.issue/728/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**ブラウザ**: agent-browser 0.27.3

## 結果サマリー

- テストケース: 1 件（PASS: 1 / FAIL: 0）
- 起票した Issue: なし

## 実行したテスト

### TC-001: `_app` 配下からログアウト → /login 着地（AC-1）— PASS

dev-admin の seed セッション cookie（`__Host-session`）を CDP 経由で注入し、認証済みホーム `/` でサイドバー＋ユーザーメニュー表示を確認。ユーザーメニューから「ログアウト」を実行し、`/login` に正常着地。ログインフォーム（メール・パスワード欄、「ログイン」ボタン）が表示され、認証済み UI（サイドバー・Dev Admin メニュー）は完全に消失。ログアウト後に `/login` でブラウザバックしても認証ガードが有効（認証済みホームに戻らない）。

**チラつき所見**: 遷移過程の 1 フレーム瞬間表示は DOM snapshot では捕捉不可（後述）。最終状態に異常（ランディング誤着地・認証 UI 残存）は一切なし。

詳細: `results/TC-001.md`

## ブラウザ検証外の AC とその担保

- **AC-2（ログイン → /）/ AC-3（リセット確認 → /）**: dev seed がパスワード credential・メールトークン fixture を持たず、フォームからの実ログイン/リセット到達が非現実的。code review + ユニットテスト（順序 assert）で担保。
- **AC-5（退会 → ランディング回帰）**: clearCache インライン → ヘルパー置換で呼ぶ router メソッド不変＝挙動完全等価。既存ユニットテスト green。

## チラつき（sub-frame race）の検証粒度

症状は「認証状態遷移時に 1 フレームだけランディングが描画される」visual race。agent-browser の snapshot は settled state を撮るため 1 フレームの瞬間表示は構造的に捕捉できない。本検証は回帰確認（フローが壊れず正しい着地点へ遷移）を主目的とし、race 解消の核心は以下で担保:

- ユニットテスト: `clearAppShellCache`（filter 厳密一致）、`UserMenu`（clearCache → navigate 順序）
- コードレビュー: 計画 2 ラウンド + 実装差分目視

## 環境・後始末

- シード: `pnpm db:migrate`（適用済み）+ `pnpm seed:dev-admin`（dev-admin@example.com / admin）
- サーバー: テスト後に停止
- 既存データへの破壊的変更なし（seed は冪等）
