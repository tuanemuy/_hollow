# ブラウザ検証レポート — Issue #827: RootDocument 二重描画の解消

**実行日:** 2026-07-10
**テストソース:** `.issue/827/testing.md`
**サーバー:** vite dev（`pnpm dev`、http://localhost:3001 ※3000 使用中のため自動繰り上がり）
**検証方法:** 各ルートを開き、クライアント DOM で `<meta charset>` / `<meta name="viewport">` / `RouteProgressBar` / `<html>` / アプリコンテナ（`main`）の数を計測（`.issue/819/manual-test/results/analysis.md` の方式を踏襲）。

計測スニペット（`agent-browser eval`）:

```js
(()=>{const q=s=>document.querySelectorAll(s).length;
const bars=Array.from(document.querySelectorAll('div[aria-hidden="true"]'))
  .filter(d=>d.className.includes("inset-x-0")&&d.className.includes("top-0")).length;
return {charset:q("meta[charset]"),viewport:q('meta[name="viewport"]'),
  html:q("html"),progressbar:bars,main:q("main")};})()
```

---

## 計測結果

| route | 種別 | charset | viewport | html | progressbar | main(app) | 判定 |
|-------|------|---------|----------|------|-------------|-----------|------|
| `/notes` | notFound（未定義 leaf） | 1 | 1 | 1 | 1 | 0 | PASS |
| `/` | 実在（landing/home） | 1 | 1 | 1 | 1 | 1 | PASS |
| `/login` | 実在（title「ログイン」） | 1 | 1 | 1 | 1 | 1 | PASS |
| `/definitely-not-a-real-route-xyz` | notFound（一般ケース） | 1 | 1 | 1 | 1 | 0 | PASS |
| `/notes/` | notFound（正規化→/notes） | 1 | 1 | 1 | 1 | 0 | PASS |
| `/`（root error 経路※） | error（500） | 0※ | 0※ | 1 | 1 | 0 | PASS |

※ root error 経路は `loadAppContext` を一時的に throw させて誘発（確認後に revert 済み）。

---

## 受け入れ基準の充足

- **AC-1（`/notes` の単一化）:** PASS。修正前は charset=2/viewport=2/progressbar=2（Issue 本文の計測）だったのが、すべて 1 に。notFound コンテナ（ErrorPage）は 1。
- **AC-2（notFound 機能維持）:** PASS。`/notes` で「404 ページが見つかりません」の notFound 画面（`ErrorPage kind="notFound"`）が単一シェル内に表示。検索/ホーム/戻る導線も表示。
- **AC-3（実在ルート回帰なし）:** PASS。`/`・`/login` で各要素 1 個ずつ、機能・表示に退行なし。
- **AC-4（未定義 URL 一般ケース）:** PASS。`/definitely-not-a-real-route-xyz`・`/notes/` でも root notFound が単一シェルで描画。
- **AC-5（root error シェル維持）:** PASS。`loadAppContext` throw 時、`ErrorPage kind="system"`（500）が `<html>`/body シェル内に単一表示（html=1, progressbar=1）。シェル消失なし。
  - 補足: この経路で charset/viewport=0 になるのは、config ロード失敗時に `head()` が `if (!config) return { links: baseLinks }` で meta を出さない**既存挙動**（`head()` は本 Issue で未変更）。二重化（本件の主題）とは別軸で、#827 のスコープ外。
- **AC-6（hydration ミスマッチなし）:** PASS。console に hydration failed / text content mismatch 系のエラーなし。残る warning は既存の `_app/route.tsx` の `AppErrorFallback` code-split 警告（本件と無関係）。

---

## 結論

全計測 PASS。`shellComponent` へのシェル一元化により、`/notes` を含む全 notFound/error 経路で `<meta charset>` / `<meta name="viewport">` / `RouteProgressBar` が単一化。実在ルート・root error 経路の回帰なし、hydration ミスマッチなし。起票した Issue: なし。
</content>
