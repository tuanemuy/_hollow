# 実装計画 — Issue #4: identity の 3 ユースケースの integration test が欠落

**Issue:** #4
**作成日:** 2026-05-18
**複雑度:** 小規模

---

## 目的

`spec/testcases/identity/index.md` で定義されている以下 3 ユースケースの integration test が欠落しているため、既存テストファイルに describe ブロックを追加する。

1. `RevokeAllOtherSessions`
2. `RequestEmailChange`
3. `VerifyEmailChange`

## スコープ

### 含まれるもの
- `app/core/application/identity/__tests__/identity.integration.test.ts` への 3 describe ブロック追加
- 3 usecase のインポート追加

### 含まれないもの
- usecase 実装そのものの変更
- 他テストファイルへの変更
- スペック文書の変更

## 実装ステップ

### 1. インポート追加

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`
- **変更内容:** `revokeAllOtherSessions`, `requestEmailChange`, `verifyEmailChange` の 3 関数を import する
- **理由:** 新規 describe ブロックから呼び出すため

### 2. `RevokeAllOtherSessions` describe ブロック追加

- **対象ファイル:** 同上
- **挿入位置:** `LogIn / LogOut` describe ブロックの直後
- **テストケース:**
  - 5 セッション（current 1 + 他 4）を持つユーザーで `revokeAllOtherSessions` を呼ぶ → `revokedCount=4`、current セッションのみ残る

### 3. `RequestEmailChange` describe ブロック追加

- **対象ファイル:** 同上
- **挿入位置:** `ChangePassword` describe ブロックの直後
- **テストケース:**
  - 正常: 有効な新メアドと正しい current パスワードで challenge が発行される
  - 新メアドが既存ユーザーに取られている: `BusinessRuleError('email_taken')`
  - current パスワード不正: `AuthenticationError('invalid_credentials')`

### 4. `VerifyEmailChange` describe ブロック追加

- **対象ファイル:** 同上
- **挿入位置:** `RequestEmailChange` describe ブロックの直後
- **テストケース:**
  - 正常: email が payload.newEmail に更新される
  - request と verify の間に他ユーザーが newEmail を取得: `BusinessRuleError('email_taken')`
  - token の expiresAt を過去に書き換えて期限切れをシミュレート: `BusinessRuleError('token_expired')`

## リスクと注意点

- `readVerificationToken` ヘルパーが `"email_change"` purpose を既にサポートしていることを確認済み（型定義に含まれている）
- セッションは revoke 時に物理削除される（`revokeAllForUser` は DELETE）
- `RequestEmailChange` の戻り値は `void` のため、challenge 発行確認は DB を直接参照する
- expired token テストは DB の `expiresAt` を `new Date(0).toISOString()` に書き換えてシミュレートする

## テスト方針

- `pnpm test:integration` で全 integration test を実行
- 新規 describe ブロックの各 it がすべて PASS であることを確認
