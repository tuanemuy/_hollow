# TC-Reg: 公開ビュー /notes/public/$noteId のリグレッション

**結果**: PASS
**セッション**: verify-502-noauth（未認証）

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 公開ノート /notes/public/$noteId（public）を開く | AppShell なしで公開ビュー表示 | title「公開デザインガイド」、`article` で本文表示 | PASS |
| 2 | 公開専用 chrome 確認 | AppShell の Sidebar/検索は無し | searchbox「公開ノートを検索」（AppShell の「ノート検索」ではない）、`complementary "サイドバー"` 無し | PASS |

export を `notes/` ツリーから抜き出しても公開ビューは独立して健在。AppShell は付かない（公開ページ用 chrome のまま）。
スクリーンショット: `screenshots/tc-regression/public-view-b079.png`
