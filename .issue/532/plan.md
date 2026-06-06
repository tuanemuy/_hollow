# Issue #532 対応計画 — サイトメタデータのテンプレ初期値を hollow 固有へ差し替え

## 意図

`app/config.ts` のサイトメタデータがテンプレ初期値 `"TanStack Start Template"` のまま残り、`head.ts` 経由で全ページの `<title>` / OGP / meta description に露出している。SEO・ブランディング・ソーシャル共有に実害があるため、hollow 固有の値へ差し替える。あわせて他のテンプレ残骸（`tanstack-start-template`）を棚卸しして一掃する。

## プロダクト像（メタデータ文言の根拠）

`app/content/legal/about.md` のサービス概要より:

> hollow は、静かで個人的なテキストアーカイブを目的とした Web サービスです。利用者は自身のノートを保存・整理し、必要に応じて公開や限定共有を行えます。

ドメインは `hollow.maku-ja.com`（staging: `staging.hollow.maku-ja.com`）。

## スコープ

### コア（実害あり）— `app/config.ts`

| キー | 現在値 | 変更後 |
| --- | --- | --- |
| `siteName` | `"TanStack Start Template"` | `"hollow"` |
| `defaultTitle` | `"TanStack Start Template"` | `"hollow"` |
| `defaultDescription` | テンプレ英文 | hollow 固有（about.md に整合する日本語、meta description 向けに簡潔に） |
| `themeColor` | `"#ffffff"` | 変更なし（`tokens.css` の `--color-bg: #ffffff` に一致しており正しい） |
| `locale` | `"ja_JP"` | 変更なし |
| `twitterHandle` | コメントアウト | 変更なし（公式アカウント未定のため） |

### 棚卸し（テンプレ残骸 `tanstack-start-template` の一掃）

ユーザー露出はないが、Issue 方針「他のテンプレ残骸も洗い出して棚卸し」に従い、コード/設定から `tanstack-start-template` 文字列を一掃する。docs/spec/.issue 配下の歴史的記述は対象外。

1. `package.json` の `"name": "tanstack-start-template"` → `"hollow"`
2. `wrangler.toml` の **local indexer** セクション
   - `name = "tanstack-start-template-indexer"` → `"hollow-local-indexer"`
   - `database_name = "tanstack-start-template-d1"` → `"hollow-local-d1"`
   - ※ 後者は他の binding が `hollow-local-d1` を使う中で唯一テンプレ名が残った**不整合バグ**。staging/production の indexer は既に `hollow-*` でクリーン。
3. 内部識別子（`Symbol.for(...)` レジストリキー。各ファイル内で writer/reader が定数経由で揃うため安全に rename 可能）
   - `app/server.cloudflare.ts`: `@tanstack-start-template/request-als` → `@hollow/request-als`
   - `app/core/application/di/containerStore.ts`: `@tanstack-start-template/container-store` → `@hollow/container-store`
4. 統合テストのキュー名（テストフィクスチャ。config と test の両側を揃える）
   - `vitest.config.integration.ts` / `app/worker/cloudflare/__tests__/handlers.integration.test.ts`
   - `tanstack-start-template-events` → `hollow-local-events`（wrangler.toml local の `queue = "hollow-local-events"` に一致）
   - `tanstack-start-template-events-dlq` → `hollow-local-events-dlq`

### スコープ外

- staging/production の wrangler 設定: 既にクリーン（残骸なし）。
- `README.md` 冒頭の `# tanstack-start-template` 等の説明文: ドキュメント整備は別軸。今回は意図（メタデータ実害）とコード/設定の棚卸しに集中。残る場合は Phase 4 で要否判断。

## 不変条件

- `app/config.ts` の `content` は `Omit<AppConfig, "appUrl">` 型に適合し続ける（型 `app/core/application/di/types.ts`）。
- `Symbol.for` キーの rename は各ファイル内で完結し、cross-module の文字列結合を壊さない（SSR/RSC は同一ソースを読むため `Symbol.for` 経由で同期）。
- 統合テストのキュー名は config と test 双方を同一文字列に揃える（不一致は integration test を壊す）。

## 検証

`testing.md` 参照。型・lint・unit・integration をグリーンにし、`pnpm dev` で `<head>` に hollow 値が出ることをブラウザ確認。最後に `grep -rn "tanstack-start-template\|TanStack Start Template"`（docs/spec/.issue 除く）でコード/設定に残骸ゼロを確認する。
