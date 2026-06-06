# 動作確認計画 — Issue #456: lazy upgrade を status OK 確定後に遅延させる

**Issue:** #456
**作成日:** 2026-06-06

---

## 確認環境

本 Issue は `D1CredentialStore.verifyPassword` / `logIn` の内部挙動（legacy PBKDF2 → scrypt rehash のタイミング）の変更で、ユーザーに見える UI 変更は無い。主軸は実 D1（in-memory）を使う統合テストで担保する。

### 検証環境の起動（自動テスト）

```bash
pnpm typecheck
pnpm test:integration
```

統合テストは `vitest.config.integration.ts` 経由で実 SQLite（`:memory:`）にマイグレーションを流したコンテナ（`setupTestContainer()`）上で走るため、別途 DB 起動やマイグレーションコマンドは不要。

### ブラウザでのスモーク確認（任意）

通常のログイン経路が壊れていないことだけ手動で確認する場合:

```bash
pnpm db:migrate        # ローカル D1 にマイグレーション適用
pnpm seed:dev-admin    # 開発用 admin ユーザを投入
pnpm dev               # 開発サーバ起動
```

### デプロイ方法

なし（検証環境＝統合テストで確認できる）。

## 確認項目

### 1. active ユーザは従来どおり rehash される

- **目的:** legacy PBKDF2 を持つ active ユーザが logIn すると、scrypt 形式へ書き換わる（rehash タイミングが UoW#1 → UoW#3 に移っても最終結果は不変）。
- **手順:**
  1. `pnpm test:integration` を実行し、`identity.integration.test.ts` の既存 lazy upgrade テスト（iter=100,000 / 600,000）が PASS することを確認。
- **期待結果:** 既存 lazy upgrade テストが green。logIn 後に `accounts.password` が scrypt 形式に書き換わっている。
- **確認ポイント:** rehash タイミング変更で既存挙動が退行していないこと。

### 2. pending ユーザは rehash されない

- **目的:** legacy PBKDF2 を持つ pending（email 未認証）ユーザが正しいパスワードで logIn を試みると、`unverified` で拒否され、かつ rehash が走らない。
- **手順:**
  1. 新規追加テストケースを `pnpm test:integration` で実行。
- **期待結果:** `AuthenticationError('unverified')` で拒否。`accounts.password` が legacy prefix（`pbkdf2-sha256-v1$`）のまま、`updated_at` sentinel が不変。
- **確認ポイント:** scrypt 演算（rehash 用 UoW#3）に到達していないこと。

### 3. suspended / deleted ユーザは rehash されない

- **目的:** legacy PBKDF2 を持つ suspended / deleted ユーザが正しいパスワードで logIn を試みると、`account_unavailable` で拒否され、rehash が走らない。
- **手順:**
  1. 新規追加テストケースを `pnpm test:integration` で実行。
- **期待結果:** `AuthenticationError('account_unavailable')` で拒否。`accounts.password` が legacy prefix のまま、`updated_at` sentinel が不変。
- **確認ポイント:** status チェックで throw 済みのため rehash 用 UoW に到達しないこと。

## エッジケース・異常系

### 1. 既に scrypt 形式のユーザは余分な UoW を起こさない

- **目的:** 既に scrypt の active ユーザが logIn しても rehash 用 UoW（追加 batch）が発生しない（needsRehash=false）。
- **手順:**
  1. 通常の scrypt ユーザで logIn する既存テストが green であることを確認。
- **期待結果:** logIn 成功・session 発行。`updated_at` 不変（rehash 用 update が積まれない）。

## 既存機能への影響確認

- **changePassword（legacy round-trip）:** `verifyCurrentForChange` を変更しないため既存テストがそのまま green であること。
- **requestEmailChange（再認証）:** `verifyPasswordForUser` を変更しないため既存テストがそのまま green であること。
- **通常ログイン（scrypt）:** ブラウザスモークで dev サーバにログインでき、セッションが発行されること（任意）。

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る
- [ ] active ユーザの lazy upgrade（既存テスト）が green
- [ ] pending ユーザで logIn → `unverified` 拒否 + rehash 不発火
- [ ] suspended ユーザで logIn → `account_unavailable` 拒否 + rehash 不発火
- [ ] deleted ユーザで logIn → `account_unavailable` 拒否 + rehash 不発火
- [ ] changePassword / requestEmailChange の既存テストが green
- [ ] `pnpm test:integration` 全体が green
