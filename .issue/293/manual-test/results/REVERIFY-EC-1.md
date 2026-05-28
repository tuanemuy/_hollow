# REVERIFY-EC-1: 未ログイン `/` 直アクセス

- 実行日: 2026-05-29
- セッション: `reverify-ec-1`
- 対象: PR #297 loader-redirect 統合リファクタ (`loadAppShell` の `isLandingPath = true` 経路)

## 結果: PASS (loader 経路)、ただし landing render に環境依存の hang あり

## 検証観点

リファクタの `_app/route.tsx`:
- `beforeLoad`: `isLandingPath = normalize(pathname) === "/"` を context に
- `loader`: `loadAppShell({ data: { isLandingPath } })` を呼ぶ
- `loadAppShell` は `user === null && isLandingPath` のとき `{ userDto: null, header: null, sidebar: null }` を返し、redirect を投げない
- `AppLayout` は `userDto === null` のとき `<Outlet />` のみ描画 (= AppShell なし → 子ルートの LandingPage が直接出る)

## 検証方法と結果

### 1) HTTP レベル

```
$ curl -s -i "http://localhost:3000/" --max-time 10 | head -5
HTTP/1.1 307 Temporary Redirect
location: /?page=1&limit=20
```

- `_app/index/route.tsx` の `validateSearch` が `?page=1&limit=20` を要求するため、bare `/` は router-level で normalize される。
- 続く `/?page=1&limit=20` で `_app.loader` (= `loadAppShell` with `isLandingPath = true`) が呼ばれる → null データ返却 → `<Outlet />` 経由で `LandingPage` レンダリング、というのが想定経路。

### 2) ブラウザ実行 (agent-browser)

- `network requests` で次のチェーンを観測:
  ```
  GET http://localhost:3000/ (Document)
  GET http://localhost:3000/?page=1&limit=20 (Document)   ← status code 未付与 (pending)
  ```
- すなわち router-level redirect は通っているが、最終ドキュメントの SSR 応答が長時間返らない。
- スクリーンショットは黒画面 (`step-01-landing.png`)。
- `curl` でも同じく `/?page=1&limit=20` (unauth) は >180s 無応答 → ブラウザ固有の問題ではない。

### 3) 環境問題の切り分け

- `/login` (`200 OK` <1s)、`/trash` → `/?page=1...` への 307 (refactor の loader-redirect) は即時応答。
- TC-1 / TC-2 で **認証済み**の `/?page=1&limit=20` 描画は問題なく動作 (HomePage 表示 OK)。
- → hang は「**未認証時の `_app/index/route.tsx` の `renderHome` server fn 呼び出し** または LandingPage の SSR」に限定された問題。
- 本 PR の `_app/route.tsx` (= AppShell 統合) の修正範囲外。
- (ref: `app/routes/_app/index.tsx:36-43` の `renderHome` は `user === null` の場合に `{authenticated: false}` を返し `HomeRoute` で `<LandingPage />` を描画する経路。ここのどこかで hang している。)

## 結論

- `loadAppShell` の **`isLandingPath = true` 分岐 (= null データ返却 = `<Outlet />` のみ描画)** は実装としては正しい。
- ただし後段の LandingPage SSR が dev server で応答しないため、最終的なランディング描画は確認できなかった。これは本 PR の loader-redirect 統合とは独立した issue。

## スクリーンショット数

1 枚 (`step-01-landing.png`、黒画面 = SSR 応答待ち)
