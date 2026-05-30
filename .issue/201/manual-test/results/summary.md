# テスト実行サマリー — Issue #201

**実行日時**: 2026-05-30
**テストソース**: .issue/201/testing.md
**サーバー**: http://localhost:3000 (`pnpm dev`)

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | validation 入力保持＋日本語メッセージ (SignUpForm) | 正常系 | PASS | username/email/displayName/acceptTerms 保持、password 空、英語キー非露出 |
| TC-2 | conflict の field 直下表示 (SignUpForm) | 異常系 | PASS | username/email 衝突とも field 直下「すでに登録されています」、summary callout なし |
| TC-3 | Setup Token 不一致 callout＋入力保持 (AdminSignUpForm) | 異常系 | PASS | 専用 callout、機微 (password/setupToken) リセット、非機微保持 |
| TC-4 | AdminSignUpForm 正常系 | 正常系 | PASS | 「管理者アカウントを作成しました」成功画面 |
| TC-5 | SignUpForm 正常系 | 正常系 | PASS | 有効データ（12文字 password・一意 email）で「確認メールを送信しました」確認 |
| Edge-1 | acceptTerms 未チェック | 異常系 | PASS | field 直下日本語 validation、入力保持、成功画面に到達せず |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 検証で確認された Issue #201 の達成事項

- **入力保持**: username / email / displayName / acceptTerms が validation・conflict・setup-token エラー後も保持され、password / setupToken（機微）は確実にリセットされる。
- **validation 文言の日本語化**: Zod デフォルト英語ではなく日本語メッセージが field 直下に表示。
- **field キー非露出**: 英語の `username:` 等のキーがどこにも出ない。
- **conflict の field 直下表示**: username / email 重複が該当フィールド直下に赤字＋`aria-invalid`＋`aria-describedby` 紐付きで表示。汎用 summary callout / fallback 文言は出ない。
- **Setup Token 不一致**: 専用 callout（role="alert"）で表示、setupToken 欄のみ `aria-invalid` / `data-error`。
- **正常系の非回帰**: SignUpForm / AdminSignUpForm とも成功画面に到達。

## 起票した Issue

なし（全 PASS）。ただし下記の別件バグを Phase 4 で起票予定（本 Issue スコープ外）。

## 別件で観測した既存バグ（本 Issue 起因ではない）

- **password 最小長の不整合**: presentation schema (`app/components/auth/schema.ts` `PASSWORD_MIN_LENGTH=8`) とドメイン値オブジェクト (`app/core/domain/identity/valueObject.ts` `PASSWORD_MIN_LENGTH=12`) が食い違う。UI ヒント「8文字以上」は誤誘導で、8〜11文字は Zod を通過後にドメインで `password_too_short` business エラーになる（現状は本 Issue の改善で「パスワードが短すぎます」summary に整形済み）。`PASSWORD_MIN_LENGTH` は PasswordReset 系（スコープ外フォーム）と共有のため、定数修正は別 Issue で対応。

## 検証メモ

- agent-browser の `click` では React 19 `<form action>` の submit が発火しないことがあったため、テキスト欄フォーカス＋`press Enter`（implicit submission）で送信。アプリのフォーム送信ロジック自体は正常（ツール互換性の問題）。
- conflict 確認にはローカル D1 既存ユーザー（username=`existing-user` / email=`existing@example.com`）を流用。
- `.dev.vars` の `ADMIN_SETUP_TOKEN` をテスト中のみ `test-setup-token` に設定し、終了後に空文字へ復元済み。
