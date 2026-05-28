# EC-1: 未ログインで `/` 直アクセス

**結果:** PASS
**実行日:** 2026-05-28
**セッション:** verify-ec-1

## 目的

未ログインで `/` を直アクセスした際に、`<LandingPage />` が表示され、AppShell（Header / Sidebar）は表示されないことを確認する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | 新セッションで `http://localhost:3000/` を直アクセス | URL `/?page=1&limit=20` に遷移し、`<LandingPage />`（Hollow / 散らかった頭の中に、静かな置き場所を / 機能紹介 / フッター）が描画される。AppShell（Header の検索 input・Sidebar）は表示されない | `screenshots/ec-1/step-1-landing.png` |

## 補足

- 未ログイン時の `/` は `_app.beforeLoad` の例外（`normalized === "/"`）により redirect を投げず、`loader` (`loadAppShellChrome`) が `userDto: null` を返し、`AppLayout` で `<Outlet />` だけが描画される
- フルページ着地なので server side で `beforeLoad` が走るため動作する
