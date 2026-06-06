# Issue #532 ブラウザ動作確認結果

`pnpm dev`（workerd, http://localhost:3000）を起動し、SSR HTML の `<head>` を確認。

## トップページ `/`（http=200）

| 項目 | 期待 | 実測 | 判定 |
| --- | --- | --- | --- |
| `<title>` | `hollow` | `<title>hollow</title>` | PASS |
| `meta description` | hollow 固有の説明 | `静かで個人的なテキストアーカイブ。ノートを保存・整理し、必要に応じて公開・限定共有できる Web サービスです。` | PASS |
| `apple-mobile-web-app-title` | `hollow` | `hollow` | PASS |
| `og:title` | `hollow` | `hollow` | PASS |
| `og:site_name` | `hollow` | `hollow` | PASS |
| `twitter:title` | `hollow` | `hollow` | PASS |
| `"TanStack Start Template"` 出現 | 0 件 | 0 件 | PASS |

## 主要ルートの応答（テンプレ残骸なし）

`/`・`/about`・`/login`・`/terms`・`/privacy` は 200、`/search` は 307（クエリ付与のための正常リダイレクト）。いずれもテンプレ文字列の露出なし。

`/about` 等のサブページのタイトルサフィックス（`… — hollow`）は、トップで実証済みの `buildHead(config, …)` → `config.siteName` と同一コードパスで生成されるため、`config.siteName = "hollow"` の差し替えで一律に反映される。

## 自動テスト

- `pnpm typecheck`: PASS
- `pnpm test:unit`: 3240 passed
- `pnpm test:integration`: 579 passed（キュー名変更後もグリーン）
- 残骸ゼロ確認 grep: コード/設定に `tanstack-start-template` / `TanStack Start Template` の出現 0 件

## 判定

全テストケース PASS（7/7）。FAIL なし。起票した Issue なし。
