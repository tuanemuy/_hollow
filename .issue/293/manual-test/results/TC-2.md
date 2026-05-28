# TC-2: 連続遷移で AppShell 維持

**結果:** FAIL
**実行日:** 2026-05-28
**セッション:** verify-tc-2

## 目的

`/` → `/tags` → `/trash` → `/notes/new` の連続クライアント遷移後も Header / Sidebar が同じ位置にあり、UI が再マウントされたような大きな描画変化が起こらないことを確認する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | ログイン → `/?page=1&limit=20` をハードリロード | AppShell 描画 OK（Header / Sidebar / ノートリスト） | `screenshots/tc-2/step-1-home.png` |
| 2 | Sidebar の「タグ」リンクをクリック → `/tags` 遷移 | URL は `/tags` に変わるが、画面は `_app.errorComponent`（「エラーが発生しました」）のみ | `screenshots/tc-2/step-2-tags.png` |
| 3 以降 | `/trash`, `/notes/new` への連続遷移 | 既にエラーコンポーネントに置き換わったため SKIP（後続も同じ失敗が予想される） | — |

## 失敗詳細

TC-1 と完全に同根。`_app/route.tsx` の `beforeLoad` が `server-only` モジュールをクライアントから動的 import しているため、`<Link>` を踏んだ瞬間にクライアントで `TypeError: getCurrentUser is not a function` が throw され、AppShell 全体がエラーコンポーネントに置き換わる。

`loadDirectoryTree` の呼び出し回数を計測するまでもなく、連続遷移自体が機能しない。

## 所感

- Issue #293 の目的（連続遷移時に AppShell を再マウントしない）は、現状の実装では **全く果たされていない**
- そもそも `<Link>` での遷移が成立しないため、Sidebar 内の任意のリンク押下で同じ失敗が再現される
