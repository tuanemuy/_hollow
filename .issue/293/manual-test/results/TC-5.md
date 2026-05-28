# TC-5: Header 検索フォーム経由の `/` 着地

**結果:** PASS
**実行日:** 2026-05-28
**セッション:** verify-tc-5

## 目的

`/tags` ページから Header の検索フォームに「example」を入力して送信 → `/?q=example` に遷移し、AppShell（Header / Sidebar）が引き続き表示されることを確認する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | ログイン → `/tags` をハードリロードでアクセス | AppShell 描画 OK（タグ管理ページ、Header の検索 input、Sidebar の Bar/FooRenamed2 展開済み） | `screenshots/tc-5/step-1-tags.png` |
| 2 | Header の検索 input に "example" を入力 → Enter | URL `/?q=example&page=1&limit=20` に遷移。Header / Sidebar 維持。メイン領域は「『example』の検索結果」「0 件のノート」見出し。NoteList は「該当するノートがありません」 | `screenshots/tc-5/step-2-search-submit.png` |

## 補足

- Header 検索 form は `<form action="/" method="get">` のフルページ遷移
- フルページ遷移なので `_app.beforeLoad` は **サーバーサイドで** 実行される。これにより `server-only` モジュールの動的 import が成功し、ルートのガード処理 + AppShell 描画が完了する
- 同じ動作はクライアントサイド遷移（`<Link>`）では再現しない（TC-1 / TC-2 を参照）

## 所感

- TC-5 単体は期待通り動作するが、これは「フルページ遷移なら動く」という当然の挙動を確認しただけで、Issue #293 が解決すべき「AppShell の同一性保持」とは別軸
- むしろ TC-5 が PASS でも TC-1 / TC-2 の FAIL は重大
