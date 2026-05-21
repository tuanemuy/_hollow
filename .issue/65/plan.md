# 実装計画 — Issue #65: メール検証リンクの URL が "/auth/verify" だが実フロントエンドは "/verify-email"

**Issue:** #65
**作成日:** 2026-05-21
**複雑度:** 小規模

---

## 目的

サインアップ後（および再送・管理者作成）に送信される検証メールのリンクが 404 にならず、ユーザーが検証フローを完遂できるようにする。

メール本文が指す URL（`/auth/verify?token=...`）と、TanStack Router の実ルート（`/verify-email`）が一致していないため、現在はリンククリックで 404 になる。メール側のパスを実ルートに揃える。

## スコープ

### 含まれるもの

- `app/core/application/identity/signUp.ts` の `buildVerificationLink` が生成する URL のパスを `/auth/verify` → `/verify-email` に修正する。
- 上記関数は `signUp` / `resendVerification` / `adminSignUp` の3つから参照されるため、修正は1箇所で全フローに反映される。

### 含まれないもの

- フロントエンドルート側（`app/routes/verify-email.tsx`）の変更は不要（こちらが正しい）。
- `/account/verify-email-change`（メール変更フロー）は別ルートで正常に機能しているため対象外。
- メール本文テンプレート・件名等の変更（リンクのパスのみが問題）。
- 認証・検証ロジック自体（`verifyEmail` ユースケース、`VerificationChallenge` ポート等）。

## 実装ステップ

### 1. `buildVerificationLink` の URL パス修正

- **対象ファイル:** `app/core/application/identity/signUp.ts`
- **変更内容:** `new URL("/auth/verify", appUrl)` を `new URL("/verify-email", appUrl)` に変更する。
- **理由:** 実ルートは `app/routes/verify-email.tsx` に定義された `/verify-email`。`buildVerificationLink` は `signUp` / `resendVerification` / `adminSignUp` 全てで利用されているため、ここを直すだけで3フロー全てが正しいリンクを生成する。

### 2. 静的検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し、変更が既存の品質基準を満たすか確認する。

## 設計判断

設計判断なし（明確なバグ修正、選択肢は1つ）。

## リスクと注意点

- `buildVerificationLink` は `export` されていて、`resendVerification` / `adminSignUp` から `import` されている。1箇所の修正で3経路すべてに影響することを意識する（意図通り）。
- 既存の integration test は URL 文字列の期待値を検証していないため、テストの修正は不要。
- メール本文の locale 別テンプレート側でリンクパスをハードコードしていないかは念のため確認するが、`buildVerificationLink` が `URL` オブジェクトを返してそのまま `emailSender.sendVerification` に渡しているため、テンプレート側で再構築している可能性は低い。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` がパスすること。
- `pnpm test:integration` の identity 関連テストがリグレッションなくパスすること。
- マニュアル動作確認: 新規サインアップ → 検証メール（dev ではログ等で確認できる）に含まれる URL が `/verify-email?token=...` になっていること。実際にクリックしてエラーが出ず、メール検証が完了すること。
