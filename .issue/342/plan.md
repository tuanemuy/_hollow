# 実装計画 — Issue #342: fix(routes): add authentication guard to /settings route

**Issue:** #342
**作成日:** 2026-05-30
**複雑度:** 小規模

---

## 目的

`/settings`（および配下の各ページ）に未認証ガードが無く、ログアウト後にアクセスすると空の設定シェルやエラー画面が表示される。未認証ユーザーが `/settings` 系ルートにアクセスしたら `/login` へリダイレクトされるようにする。

## スコープ

### 含まれるもの
- `/settings` レイアウトルート（`app/routes/settings/route.tsx`）への未認証ガード追加
- 未認証時に `/login` へリダイレクト

### 含まれないもの
- `/exports`・`/views` など、同様にガードが無い他ルートの修正（別Issueの範囲。本Issueの意図は `/settings` 限定）
- ログイン後に元のページへ戻す return-path 機能（Issueの要件外）
- 子ルートの `requireCurrentUser()` 呼び出しの変更（レイアウトでガードすれば子は到達しないため不要）

## 実装ステップ

### 1. `/settings` レイアウトに `beforeLoad` 認証ガードを追加

- **対象ファイル:** `app/routes/settings/route.tsx`
- **変更内容:** `login.tsx` の `beforeLoad`（認証済みなら `/` へリダイレクト）と対称な形で、認証状態を確認する server function を定義し、`beforeLoad` で未認証なら `/login` へリダイレクトする。
  - `createServerFn({ method: "GET" })` + `errorResponseMiddleware` で `getCurrentUser`（`@/core/presentation/authMiddleware`）を呼び、`{ authenticated: user !== null }` を返すヘルパーを追加
  - `Route` の定義に `beforeLoad` を追加し、未認証なら `throw redirect({ to: "/login" })`
- **理由:** `beforeLoad` での redirect は TanStack Router が正しくナビゲーションとして処理する。一方、子ルートの GET loader 内で throw される redirect はレイアウトの `errorComponent` に捕捉されてしまい、エラー表示になる（Issue #239 分析の根拠）。レイアウト層でガードすることで配下の全ページを一括で保護できる。

## 設計判断

- **リダイレクト先は `/login`**: Issue 本文の「期待: /login へリダイレクト」に従う。`_app` 配下は `/`（HOME）へ飛ばすが、設定ページはランディングを持たない純粋な認証必須ページなので、ログイン導線へ直接送る `/login` が自然。`login.tsx` が「認証済みなら `/` へ」と対称になる。
- **ガードの実装場所はレイアウトルート（`settings/route.tsx`）**: 子ルートそれぞれに足すより、レイアウトの `beforeLoad` 一箇所で配下全体を保護できる。`login.tsx` と同じ `createServerFn` + `beforeLoad` パターンを踏襲し、プロジェクトの確立されたパターンに沿う。

## リスクと注意点

- `beforeLoad` は server / client 双方で実行されるため、server-only な import は `createServerFn` ハンドラ内の動的 import に閉じ込める（`login.tsx` と同じ作法）。
- 既存の認証済みフローに影響を与えないこと（認証済みユーザーは従来どおり設定ページを閲覧できる）。

## テスト方針

- 未認証で `/settings`・`/settings/profile`・`/settings/security`・`/settings/prompts`・`/settings/account-delete` にアクセス → いずれも `/login` へリダイレクトされる。
- 認証済みで同ルートにアクセス → 従来どおり各設定ページが表示される。
- `pnpm typecheck && pnpm lint && pnpm format:check` がパスする。
