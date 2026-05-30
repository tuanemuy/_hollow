# 実装計画 — Issue #349: パスワード最小長の不整合: transport schema=8 と domain 値オブジェクト=12

**Issue:** #349
**作成日:** 2026-05-30
**複雑度:** 小規模

---

## 目的

presentation の transport schema（`app/components/auth/schema.ts`）の `PASSWORD_MIN_LENGTH = 8` が、ドメイン値オブジェクト（`app/core/domain/identity/valueObject.ts`、`12..128`）と食い違っている。8〜11 文字のパスワードは Zod transport boundary を通過し、ユースケース内の `RawPassword.create` で `BusinessRuleError("password_too_short")` が throw され、field 直下ではなく summary 領域にエラーが出る。UI ヒント「8文字以上」も誤誘導。

ドメイン値オブジェクトを真実のソースとして、transport schema を 12 に揃え、Zod が transport boundary で先に弾く（field 直下の validation エラーになる）ようにする。

## スコープ

### 含まれるもの

- `app/components/auth/schema.ts` の `PASSWORD_MIN_LENGTH` を 8 → 12 に変更
- `app/components/auth/schema.ts` の `PASSWORD_MAX_LENGTH` を 256 → 128 に変更（domain max=128 との同種の食い違いを同じ定数ブロックで解消。ADR-001 参照）
- `app/components/auth/__tests__/schema.test.ts` の有効入力パスワードを 12 文字以上に更新

### 含まれないもの

- ドメイン値オブジェクト側の変更（こちらが真実のソースなので不変）
- `spec/design/pages/P01-signup.html` 等の静的デザインモックアップの「8文字以上」表記（実装ではなく設計成果物。spec-sync の領域）
- パスワード複雑度ルール（2文字種以上）の transport 側への移植（Issue 範囲外・ADR-003 で値オブジェクト責務と確定済み）
- 既存ユーザーへの移行（ログインは `loginSchema` が `min(1)` のため影響なし）

## 実装ステップ

### 1. transport schema の定数をドメインに揃える

- **対象ファイル:** `app/components/auth/schema.ts`
- **変更内容:** `PASSWORD_MIN_LENGTH` を `8` → `12`、`PASSWORD_MAX_LENGTH` を `256` → `128`
- **理由:** ドメイン値オブジェクトが真実のソース。transport boundary で先に弾くことで field 直下の validation エラーになり、summary 領域への誤誘導が解消する。定数は signUp / adminSignUp / passwordResetConfirm / 各フォームの placeholder・minLength・強度メーターしきい値・Zod メッセージから参照されているため、定数の変更だけで全箇所に波及する。

### 2. presentation schema テストの有効パスワードを更新

- **対象ファイル:** `app/components/auth/__tests__/schema.test.ts`
- **変更内容:** `validSignUp.password` を `"Passw0rd!23"`（11 文字）→ 12 文字以上（例 `"Passw0rd!234"`）に変更
- **理由:** min が 12 になると 11 文字は「accepts a valid payload」テストを落とす。複雑度（英字＋数字＋記号）を満たす 12 文字に更新する。`too-short` テスト（`"short"`）は引き続き不正なので変更不要。

## 設計判断

- **ADR-001:** `PASSWORD_MAX_LENGTH`（256→128）も合わせて揃える判断。詳細は `adr.md` 参照。

## リスクと注意点

- 定数を参照する箇所（SignUpForm / AdminSignUpForm / PasswordResetConfirmForm の placeholder・minLength・hint・強度メーター）はすべて定数経由なので、定数変更だけで一貫して 12 に揃う。直書きの「8文字」は実装側には存在しない（grep 確認済み）。
- integration テスト（`identity.integration.test.ts`）の `strongPassword` ヘルパーは既に 12 文字を生成するため影響なし。
- `loginSchema` の password は `min(1)` で、`PASSWORD_MAX_LENGTH` のみ参照。max を 128 に下げても、domain max=128 を超える有効パスワードは存在し得ないため既存ユーザーのログインに影響なし。

## テスト方針

- `pnpm test:unit`（`schema.test.ts` を含む）が通ること
- `pnpm typecheck && pnpm lint`
- manual-test スキルで signup フォームに 11 文字 / 12 文字を入力し、11 文字が field 直下エラー（summary ではなく）になることを確認
