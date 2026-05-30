# テスト実行サマリー — Issue #208

**実行日時**: 2026-05-30
**テストソース**: .issue/208/testing.md
**サーバー**: http://localhost:3000（pnpm dev / Cloudflare Workers ローカル）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | パスワード変更 round-trip | 正常系 | PASS | - |
| TC-002 | 誤った現パスワードの拒否 | 異常系 | PASS | - |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## 確認できたこと（Issue #208 の外部挙動不変性）

- 正しい現パスワードでのみ変更が成立し、旧パスワードは無効化、新パスワードでログイン可（TC-001）。
- 誤った現パスワードは「認証が必要です」= **401 相当（unauthorized kind）** で拒否され、パスワードは変更されない（TC-002）。
  - これは本変更の要: adapter が `BusinessRuleError`(422) ではなく `AuthenticationError`(401) を投げる経路が、transport boundary まで正しく通っていることを end-to-end で実証。
- 二重 hash 解消（内部最適化）による外部挙動の退行は見られなかった。

## 環境メモ

- メール送信は dev で実送信されないため、`verifications` テーブルから認証トークンを直接取得して `/verify-email?token=...` で認証（統合テストの `readVerificationToken` と同じ identifier 規約 `email_verification:<userId>` / value=JSON `{token,...}`）。
- フォームは React 制御コンポーネントのため、agent-browser のネイティブ setter + input/change イベント dispatch で入力。
