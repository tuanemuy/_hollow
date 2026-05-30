# 動作確認計画 — Issue #208: changePassword の二重 hash 解消

**Issue:** #208
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更は **adapter / application 層の内部最適化**であり、外部から観測できる挙動（パスワード変更の成否・エラー）は変わらない。主たる検証は統合テストで行う。

### 検証環境の起動（ブラウザ確認をする場合）

```bash
pnpm dev
```

Cloudflare Workers ランタイム（Miniflare）で開発サーバーが起動する。

### テスト実行（主たる検証手段）

```bash
# identity 系を含む統合テスト（Miniflare + in-memory D1）
pnpm test:integration

# 全テスト
pnpm test
```

### デプロイ方法

なし（検証環境および統合テストで確認できる）。

## 確認項目

### 1. パスワード変更の round-trip（正常系）

- **目的:** 二重 verify / 二重 hash を解消しても、正しい現パスワードでの変更が従来どおり成功し、新パスワードでログインできることを確認する。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. `identity.integration.test.ts` の `describe("ChangePassword")` → `it("changes the password when current is correct")` が PASS することを確認する。
  3. （ブラウザ確認をする場合）アクティブなユーザーでログイン → セキュリティ設定画面でパスワード変更 → 一度ログアウトし、新パスワードでログインできる／旧パスワードで失敗することを確認する。
- **期待結果:** 新パスワードでログイン可、旧パスワードは `AuthenticationError`。テストは無変更で green。
- **確認ポイント:** 変更後に `accounts.password` が scrypt 形式（`isScryptEncoded`）で書かれていること（= legacy アカウントも write 一回で scrypt 化される）。

### 2. 誤った現パスワードの拒否（異常系・401 契約）

- **目的:** usecase の pre-verify を廃止し adapter が直接 `AuthenticationError` を throw する経路に変えても、誤った現パスワードが `AuthenticationError('invalid_credentials')`（HTTP 401 相当）で拒否されることを確認する。
- **手順:**
  1. `identity.integration.test.ts` の `it("rejects an incorrect current password with invalid_credentials")` が PASS することを確認する。
  2. （ブラウザ確認をする場合）セキュリティ設定画面で現パスワードを誤入力してパスワード変更を試みる。
- **期待結果:** `isAuthenticationError(error) === true` かつ `error.code === "invalid_credentials"`。ブラウザでは 401 相当のエラー表示。
- **確認ポイント:** `kind` が `unauthorized`（401）であり `business`（422）になっていないこと。

## エッジケース・異常系

### 1. lazy upgrade 経路（logIn / requestEmailChange）への非干渉

- **目的:** 本変更が `verifyPassword`（logIn）/ `verifyPasswordForUser`（requestEmailChange）の lazy upgrade を壊していないことを確認する（非ゴール遵守）。
- **手順:**
  1. `identity.integration.test.ts` の `describe("lazy upgrade from legacy PBKDF2 to scrypt")` が PASS することを確認する。
  2. `describe("RequestEmailChange")` 系のテストが PASS することを確認する。
- **期待結果:** legacy アカウントの logIn 時 rehash、再認証経路はいずれも従来どおり green。

### 2. soft-delete 済み actor のパスワード変更（任意）

- **目的:** 新しい専用 verify helper の行 selection（`deletedAt` / `password===null` 判定）が `verifyPasswordForUser` と等価であることを担保する。
- **手順:** soft-delete 済みユーザーで `changePassword` を呼ぶテストを追加した場合、それが `AuthenticationError('invalid_credentials')` を返すことを確認する。
- **期待結果:** `invalid_credentials`（情報差なし = enumeration defence 維持）。

## 既存機能への影響確認

- **パスワード変更フロー（SecurityForm）:** 変更なしで動作すること。
- **ログイン（logIn）:** legacy → scrypt の lazy upgrade を含め無変更で動作すること。
- **メールアドレス変更（requestEmailChange）:** 再認証の lazy upgrade が無変更で動作すること。

## 確認チェックリスト

- [ ] `pnpm test:integration` が全 green（identity 系含む）
- [ ] `describe("ChangePassword")` の 2 ケースが PASS
- [ ] lazy upgrade / RequestEmailChange テストが PASS（非ゴール経路の非干渉）
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がクリーン
- [ ] （任意）ブラウザでパスワード変更 round-trip と誤入力拒否を確認
