# RERUN-TC-1: `/` → `/notes/$noteId/` 遷移で AppShell 同一性

**結果:** PASS
**実行日:** 2026-05-28
**セッション:** verify-rerun-tc-1
**修正対象:** `app/routes/_app/route.tsx` の `beforeLoad` を `createServerFn` (`resolveAppAuth`) でラップ

## 目的

ログイン → `/` → ノート詳細 (`<Link>` SPA 遷移) → ブラウザバック で、AppShell（Header / Sidebar）の表示と入力状態（Header 検索 input 値、Sidebar の展開状態）が保持されることを検証する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | `/login` を開く → email/password 入力 | OK (banner / ログインフォーム描画) | `screenshots/rerun-tc-1/step-1-login-filled.png` |
| 2 | ログインボタン押下 → `/?page=1&limit=20` に遷移 | URL 遷移成功、Header / Sidebar / ノートリスト描画 (エラーなし) | `screenshots/rerun-tc-1/step-2-after-login.png` |
| 3 | Header 検索 input (`ref=e21`) に "test" を type | `document.querySelector('input[type=search]').value === "test"` | `screenshots/rerun-tc-1/step-3-search-typed.png` |
| 4 | ノート「Foo配下の検証用ノート 1」(`ref=e51`) をクリック → SPA 遷移 | URL: `/notes/01938f02-0000-7000-8000-000000000101`、エラー画面なし (`'エラーが発生しました'` 含まず)、Header の searchbox には `test` 保持、complementary (Sidebar) も同じツリー表示 | `screenshots/rerun-tc-1/step-4-note-detail.png` |
| 5 | `back` で `/` に戻る → `wait --load networkidle` | URL: `/?page=1&limit=20`、エラー画面なし、Header search input の値は `"test"` を保持、Sidebar の Bar / FooRenamed2 が `▾` (展開) で維持 | `screenshots/rerun-tc-1/step-5-back.png` |

## 検証ポイント

- `'エラーが発生しました'` を含まない: Step 4, 5 両方で `false`
- Header 検索 input に "test" が残る: Step 4 で snapshot に `searchbox "ノート検索" [ref=e12]: test`、Step 5 で `eval` `"test"`
- Sidebar の展開状態維持: Bar / FooRenamed2 が `▾` プレフィックス（展開）のまま

## 修正の効果

前回 (TC-1 失敗時) の根本原因だった `beforeLoad` 内での `@/lib/server/currentUser` 動的 import は、クライアント側のナビゲーションで `getCurrentUser` が `undefined` となり `_app.errorComponent` がトリガーされていた。

今回の修正で `beforeLoad` は `resolveAppAuth` server fn を呼ぶ形になり、クライアント側遷移でも RPC として正しく実行されるようになった。SPA 遷移後も AppShell が破壊されず、入力状態 (検索 input の `"test"`、Sidebar の展開状態) が保たれることを確認。
