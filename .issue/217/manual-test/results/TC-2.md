# TC-2: サイドバーの「アップロード」が `/upload` への遷移リンクになっていること

**結果**: PASS
**実行時間**: 約25秒
**セッション**: verify-217-tc-2

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | member ログイン → ホーム表示 | `/?page=1&limit=20` | 同上 | PASS |
| 2 | サイドバー「アップロード」項目の DOM 確認 | `<a href="/upload">` で `#upload` ハッシュなし | `{ href: "/upload", text: "アップロード", dataActive: null }` | PASS |
| 3 | サイドバー「アップロード」をクリック | `/upload` に画面遷移 | `location.href = "http://localhost:3001/upload"` | PASS |
| 4 | URL ハッシュ確認 | `#upload` が付かない | `location.hash = ""` | PASS |
| 5 | モーダル UI 表示確認 | モーダルが開かない | `document.querySelector('[role="dialog"]') === null` | PASS |
| 6 | サイドバー「アップロード」のハイライト | `data-active` 付与 | `data-active=""`、`aria-current="page"` | PASS |

## 観察

- ADR-003 の data 属性運用（statically-on は `data-active=""`）に沿った実装になっており、`data-[active]:` Tailwind variant でハイライトが反映される。

## スクリーンショット
- Step 1 (home): `screenshots/tc-2/step-1-home.png`
- Step 2 (after click → /upload): `screenshots/tc-2/step-2-upload-page.png`
