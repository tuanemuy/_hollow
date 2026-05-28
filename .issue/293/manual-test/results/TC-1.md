# TC-1: `/` → `/notes/$noteId/` 遷移で AppShell 同一性

**結果:** FAIL
**実行日:** 2026-05-28
**セッション:** verify-tc-1

## 目的

ログイン → `/` → ノート詳細遷移 → ブラウザバック で、AppShell（Header / Sidebar）の状態（Sidebar 展開、Header 検索 input 値・フォーカス）が保持されることを検証する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | `/login` 表示 → email/password 入力 | OK | `screenshots/tc-1/step-1-login-filled.png` |
| 2 | ログインボタン押下 | URL は `/?page=1&limit=20` に変わるが、画面は「ログイン中…」のまま固まる | `screenshots/tc-1/step-2-post-login.png`, `step-3-stuck.png` |
| 3 | `/?page=1&limit=20` をハードリロード（SSR 経由で AppShell 描画させる） | AppShell が描画される（Header の検索 input、Sidebar の Bar/FooRenamed2 が `expanded=true` で展開済み、ノート 2 件のリスト） | `screenshots/tc-1/step-3-hard-reload.png` |
| 4 | Header 検索 input にフォーカスして "test" を type | input.value=`"test"`, document.activeElement = `<input type=search>`, expandedDirs=`["Bar","FooRenamed2"]` | `screenshots/tc-1/step-4-search-typed.png` |
| 5 | ノート「Foo配下の検証用ノート 1」をクリック → `/notes/01938f02-…-101` | URL は遷移するが、画面は `_app.errorComponent`（「エラーが発生しました」）のみ。Header / Sidebar が消える。 | `screenshots/tc-1/step-5-note-detail.png` |
| 6 | `back` で `/` に戻る | URL は `/?page=1&limit=20` に戻るが、画面は依然エラーコンポーネントのまま。AppShell も search 値 / 展開状態も保持されていない | `screenshots/tc-1/step-6-back.png` |

## 失敗詳細

### 根本原因

`app/routes/_app/route.tsx:58-66` の `beforeLoad` で、サーバー専用モジュール `@/lib/server/currentUser` を `await import(...)` で動的 import している。

```ts
beforeLoad: async ({ location }) => {
  const { getCurrentUser } = await import("@/lib/server/currentUser");
  const user = await getCurrentUser();
  ...
}
```

`app/lib/server/currentUser.ts` は冒頭に `import "@tanstack/react-start/server-only";` を持つため、クライアントバンドルでは関数本体が消され、import は空（ないし stub）モジュールを返す。

クライアント側ナビゲーション（`<Link>` 押下や `history.back`）では `beforeLoad` がクライアントで再実行されるため、`getCurrentUser` が `undefined` となり、

```
TypeError: getCurrentUser is not a function
  at Object.beforeLoad (http://localhost:3000/app/routes/_app/route.tsx:49:22)
```

が throw され、`_app.errorComponent` が描画される。

### サーバーログ抜粋

```
23:02:35 [vite] (client) [console.error] Route error: TypeError: getCurrentUser is not a function
    at Object.beforeLoad (http://localhost:3000/app/routes/_app/route.tsx:49:22)
```

### 影響範囲

`_app` 配下の **全てのクライアントサイドナビゲーション** が、AppShell ごとエラーコンポーネントに置き換わる。
本 Issue が目指す「AppShell の同一性保持」が達成できないどころか、`<Link>` を使った遷移自体が破壊されている状態。

### 期待される修正方向

`beforeLoad` も `loader` (`loadAppShellChrome`) と同じく `createServerFn` でラップし、ネットワーク越しに呼び出す形に変更する必要がある。

- `loader: () => loadAppShellChrome()` は server fn として正しく定義されているのでクライアントから呼べる
- 一方で `beforeLoad` は server fn 化されておらず、`server-only` モジュールを direct import している
- 同じ `getCurrentUser` を返す server fn（例: `getAppShellSession`）を作り、`beforeLoad` でそれを呼ぶ形にするのが筋

## ステップごとの所感

- TC-1 の本体（state 保持の確認）はそもそも実施できない。`<Link>` 経由の遷移時点でクラッシュする
- ハードリロード経由なら AppShell は正常に描画される（SSR で `beforeLoad` がサーバーサイドで実行されるため）
