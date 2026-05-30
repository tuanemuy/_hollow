# ブラウザ検証レポート — Issue #201: フォームのエラー UX 改善

**実行日時**: 2026-05-30
**テストソース**: `.issue/201/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**ツール**: agent-browser 0.27.0
**対象**: `/signup` (SignUpForm) / `/setup` (AdminSignUpForm)

## 結果概要

**6 件中 6 件 PASS（FAIL 0）**

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-1 | validation 入力保持＋日本語メッセージ | PASS |
| TC-2 | conflict の field 直下表示 | PASS |
| TC-3 | Setup Token 不一致 callout＋入力保持 | PASS |
| TC-4 | AdminSignUpForm 正常系 | PASS |
| TC-5 | SignUpForm 正常系 | PASS |
| Edge-1 | acceptTerms 未チェック | PASS |

## 主要な確認事項（Issue #201 の達成）

### 入力保持（問題1の解消）
- validation / conflict / setup-token いずれのエラー後も username / email / displayName / acceptTerms が保持される。
- password / setupToken（機微フィールド）は確実に空にリセット（ADR-001 どおり）。

### エラー内容の明瞭化（問題2の解消）
- **conflict**: username / email 重複が該当フィールド直下に赤字「すでに登録されています」＋ `aria-invalid=true` ＋ `aria-describedby` 紐付きで表示。汎用 summary callout / fallback「操作を完了できませんでした…」は出ない（ADR-002 あり版採用どおり）。
- **validation 日本語化**: 「メールアドレスの形式が正しくありません。」等の日本語が field 直下に表示。Zod デフォルト英語は出ない。
- **field キー非露出**: 英語キー（`username:` 等）がどこにも露出しない（ステップ2の整形どおり）。
- **Setup Token 不一致**: 専用 callout（role="alert"）「Setup Token が正しくありません。値を確認してもう一度入力してください。」を表示。

### 非回帰
- SignUpForm「確認メールを送信しました」、AdminSignUpForm「管理者アカウントを作成しました」の成功フローに到達。

## スクリーンショット

- TC-1: `screenshots/tc-1/step-01-before-submit.png`, `step-02-after-submit.png`
- TC-2: `screenshots/tc-2/step-01-username-conflict.png`, `step-02-email-conflict.png`
- TC-3: `screenshots/tc-3/step-00-initial.png`, `step-01-before-submit.png`, `step-02-token-error.png`
- TC-4: `screenshots/tc-4/step-01-success.png`
- TC-5: `screenshots/tc-5/step-01-filled.png`, `step-02-success.png`
- Edge-1: `screenshots/edge-1/step-01-before.png`, `step-02-after.png`

## 別件で観測した既存バグ（本 Issue 起因ではない・Phase 4 で起票）

password 最小長が presentation schema=8、ドメイン値オブジェクト=12 で不整合。UI ヒント「8文字以上」は誤誘導。`PASSWORD_MIN_LENGTH` は PasswordReset 系（本 Issue スコープ外）と共有のため別 Issue で対応。

## 検証メモ

- agent-browser の `click` では React 19 `<form action>` の submit が発火しないケースがあり、テキスト欄フォーカス＋`press Enter`（implicit submission）で送信した。アプリのフォーム送信ロジック自体は正常で、ツール互換性の問題。
- conflict 確認にローカル D1 既存ユーザー（`existing-user` / `existing@example.com`）を流用。
- `.dev.vars` の `ADMIN_SETUP_TOKEN` をテスト中のみ `test-setup-token` に設定し、終了後に空文字へ復元済み。
