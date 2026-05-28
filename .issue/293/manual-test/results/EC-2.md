# EC-2: 未ログインで `/trash` 直アクセス

**結果:** PASS
**実行日:** 2026-05-28
**セッション:** verify-ec-2

## 目的

未ログインで `/trash` を直アクセスした際に、`/` + `HOME_SEARCH` にリダイレクトされ、ランディングが表示されること（`/login` には行かない）を確認する。

## 実行ログ

| Step | 操作 | 結果 | スクリーンショット |
|---|---|---|---|
| 1 | 新セッションで `http://localhost:3000/trash` を直アクセス | URL `/?page=1&limit=20` にリダイレクト、`<LandingPage />` が描画される。`/login` には飛ばない | `screenshots/ec-2/step-1.png` |

## 補足

- `_app.beforeLoad` が `normalized !== "/" && user === null` で `throw redirect({ to: "/", search: HOME_SEARCH })` を投げる
- フルページ着地なので server side で `beforeLoad` が走るため動作する
- 期待挙動どおり `/login` ではなく `/` + `HOME_SEARCH` にリダイレクト
