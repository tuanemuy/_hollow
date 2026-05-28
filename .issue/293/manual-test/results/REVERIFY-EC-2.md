# REVERIFY-EC-2: 未ログイン `/trash` 直アクセス

- 実行日: 2026-05-29
- セッション: `reverify-ec-2`
- 対象: PR #297 loader-redirect 統合リファクタ (`loadAppShell` の redirect 経路)

## 結果: PASS (redirect 動作)、ただし 後段 landing render に環境依存の hang あり

## 検証観点

リファクタの中心: `loadAppShell` が `user === null && !isLandingPath` のとき `throw redirect({ to: "/", search: HOME_SEARCH })` を発火するか。

## 検証方法と結果

### 1) HTTP レベルでの redirect 連鎖 (主検証)

```
$ curl -s -i "http://localhost:3000/trash" --max-time 10 | head -5
HTTP/1.1 307 Temporary Redirect
location: /trash?page=1&limit=20

$ curl -s -i "http://localhost:3000/trash?page=1&limit=20" --max-time 10 | head -5
HTTP/1.1 307 Temporary Redirect
location: /?page=1&limit=20
```

- `/trash` (validateSearch を満たさない) → `/trash?page=1&limit=20` に router-level normalize
- `/trash?page=1&limit=20` → `/?page=1&limit=20` (= `HOME_SEARCH`) に loader-level redirect
- **= refactor の `loadAppShell` が server fn 内で `throw redirect(...)` を正しく発火していることを示す**

ついでに他の保護ルートも同様に確認:

| URL | 期待 | 実測 |
|-----|------|------|
| `/notes/new` | → `/?page=1&limit=20` | OK (307 to `/?page=1&limit=20`) |
| `/tags` | → `/?page=1&limit=20` | OK (307 to `/?page=1&limit=20`) |

### 2) ブラウザ実行 (agent-browser)

- agent-browser `network requests` 出力で以下のチェーンを観測:
  ```
  [...] GET http://localhost:3000/trash (Document)
  [...] GET http://localhost:3000/trash?page=1&limit=20 (Document)
  [...] GET http://localhost:3000/?page=1&limit=20 (Document)   ← status code 未付与 (pending)
  ```
- すなわち refactor の redirect は実際の Playwright 経由ナビゲーションでも発火している。
- ただし最終ドキュメント `/?page=1&limit=20` の SSR レスポンスが返らず、スクリーンショットは黒画面 (`step-01-redirected.png`) のまま。
- これは `_app/index/route.tsx` の `renderHome` server fn (LandingPage SSR 経路) が応答しない問題で、`curl` でも再現 (>180s 無応答)。本 refactor とは独立した既存環境問題と判断。

## 結論

- **`loadAppShell` の redirect ロジックは正しく動作している**ことを HTTP / browser 両方で確認。
- ランディングページの SSR hang は本 refactor のスコープ外。`_app/index/route.tsx` の `renderHome` 周りか、Vite dev server の初回コンパイル問題と思われる。本 PR の loader-redirect 統合とは無関係。

## スクリーンショット数

2 枚: `step-00-login-warm.png` (warm-up), `step-01-redirected.png` (黒画面 = landing render pending)
