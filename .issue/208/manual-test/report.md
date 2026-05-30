# ブラウザ検証レポート — Issue #208

**Issue:** #208 perf(security): changePassword で legacy lazy upgrade + 新パスワード書き込みの二重 hash を解消
**実行日時:** 2026-05-30
**テストソース:** .issue/208/testing.md
**サーバー:** http://localhost:3000（`pnpm dev`）

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | パスワード変更 round-trip（正常系） | ✅ PASS |
| TC-002 | 誤った現パスワードの拒否（異常系） | ✅ PASS |

**合計 2 件 / PASS 2 / FAIL 0** — 起票した Issue なし。

## 詳細

### セットアップ（シードデータ）
- `/signup` でテストユーザー（`changepass-test@example.com` / `changepasstest` / `Passw0rd!000`）を作成。
- dev は実メール送信なしのため、`verifications` テーブルから `email_verification:<userId>` のトークンを取得し `/verify-email?token=...` で認証 → アクティブ化（自動ログイン）。

### TC-001: パスワード変更 round-trip
1. `/settings/security` で 現=`Passw0rd!000` / 新=`NewPassw0rd!1` を送信 → 「変更しました」表示（成功）。
2. 旧パスワード `Passw0rd!000` でログイン → 失敗（「ログインできませんでした。認証が必要です」）。
3. 新パスワード `NewPassw0rd!1` でログイン → 成功（ホームへ遷移）。

→ 二重 hash 解消後も、変更成立・旧パス無効化・新パス有効化が従来どおり。

### TC-002: 誤った現パスワードの拒否
1. `/settings/security` で 現=`WrongPass99!a`（誤）/ 新=`Another0rd!2` を送信 → 「認証が必要です」エラー（401 相当）、成功メッセージなし、変更不成立。

→ adapter が `AuthenticationError('invalid_credentials')`（kind: unauthorized → 401）を投げる経路が transport boundary まで正しく機能。`BusinessRuleError`(422) への退行なし。

## スクリーンショット
`.issue/208/manual-test/screenshots/` 配下:
- setup-01-signup.png / setup-02-verified.png
- tc-001-01-submit.png / tc-001-02-result.png / tc-001-03-oldpass-fail.png / tc-001-04-newpass-ok.png
- tc-002-01-submit.png / tc-002-02-error.png

## 結論
Issue #208 の内部最適化（changePassword の二重 verify / 二重 hash 解消、legacy rehash 抑制、adapter からの 401 直 throw）による**外部挙動の退行は確認されなかった**。
