# 原因分析 — Issue #239 ブラウザ検証

FAIL したテストケースは無し。ただし TC-005 の過程で、本Issueのスコープ外の既存挙動を1件発見したため記録する。

## 発見: `/settings` ルートが未認証時に `/login` へリダイレクトしない

### 観測
ログアウト後に未認証状態で:
- `/settings` → レイアウトのナビゲーションシェル（プロフィール/セキュリティ/プロンプト/アカウント削除リンク）を描画
- `/settings/profile` → `errorComponent`「エラーが発生しました」を表示

### 分類
**既存挙動（本Issueのスコープ外）**。実装バグではあるが Issue #239 の変更とは無関係。

### 根拠
- 本Issueの変更ファイルは `app/components/layout/{action.ts,UserMenu.tsx,Header.tsx,styles.ts}` のみで、`app/routes/settings/` は一切触れていない。
- `app/routes/settings/route.tsx` の `createFileRoute("/settings")` には `beforeLoad` 認証ガードが無い。子ルート（例 `app/routes/settings/profile.tsx`）の `renderProfilePage` server function 内で `requireCurrentUser()` が `redirect({ to: "/login" })` を throw するが、GET loader 内の throw がルートの `errorComponent` に捕捉され、`/login` への遷移ではなくエラー表示になる。
- 対照的に `app/routes/login.tsx` は `beforeLoad` で認証チェックしており、`_app` 配下のルートは `loadAppShell` が未認証を `/`（HOME）へリダイレクトする。`/settings` はそのどちらのパターンにも乗っていない。

### 影響
- セキュリティ上の重大な漏洩ではない（保護データ自体は描画されず、エラー or 空シェルになる）が、UX として未認証ユーザーが設定シェルやエラー画面を見てしまう。
- 本来は `/login`（または `/`）へ素直にリダイレクトされるべき。

### 対応方針
Issue #239 の意図（ログアウト導線の追加）からは外れるため、その場修正せず Phase 4 でスコープ外Issueとして起票する。`/settings` ルート（およびレイアウト）に未認証ガードを追加する別Issue。
