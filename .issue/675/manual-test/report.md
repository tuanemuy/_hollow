# ブラウザ検証レポート — Issue #675: dev 限定エントリ分離

**実行日:** 2026-07-11
**テストソース:** `.issue/675/testing.md`
**検証対象:** dev エントリ分離（`app/server.cloudflare.dev.ts` 新設）による dev-only コードの本番混入防止
**サーバー:** wrangler dev (:8787) / vite dev (:3000)

---

## サマリー

| # | テスト | 対応 AC | 結果 |
|---|--------|---------|------|
| TC-1 | prod ビルドの構造検証（dev コード不在） | AC-1, AC-2 | PASS |
| TC-2 | dev ビルドの構造検証（dev コード存在） | AC-3, AC-4, AC-7 | PASS |
| TC-3 | prod エントリ起動＋通常応答＋sitemap | AC-9 | PASS |
| TC-4 | prod エントリで dev proxy 不発火 | AC-9 | PASS |
| TC-5 | dev エントリ（build:local）起動＋dev proxy 発火 | AC-4, AC-5 | PASS |
| TC-6 | dev サーバー（pnpm dev）で dev エントリ有効 | AC-3 | PASS |
| TC-7 | dev エントリ経由で管理ダッシュボード描画（回帰確認） | 回帰なし | PASS |
| TC-8 | バインディング二重化バグの検出→修正 | — | PASS（修正済み） |

**合計: 8 件（PASS: 8 / FAIL: 0）**

起票した Issue: なし（全 PASS）

---

## 詳細

### TC-1: prod ビルドの構造検証（AC-1/AC-2）
- `pnpm build`（production）後、`dist/server/index.js` および全 JS バンドルを force-text grep（`grep -a`）。
- 期待: `InlineRelayTrigger` / `inline-dev` / `buildDevObjectStorageResponse` / `resolveInlineRelayGate` / `resolveDevObjectStorageGate` がゼロ。
- 実際: **全滅（0 件）**。dev-only コードは prod バンドルに構造的に載らない。
- 注: `dist/server/wrangler.json` にはローカル `wrangler.toml [vars]` 由来の `R2_DEV_OBJECT_PROXY` / `/dev/r2` が残るが、これは設定メタデータでありコードではない。本番デプロイは `wrangler.production.toml` を使うため無関係。

### TC-2: dev ビルドの構造検証（AC-3/AC-4/AC-7）
- `pnpm build:local` 後、`dist/server/index.js` を force-text grep。
- 実際: `InlineRelayTrigger` x3 / `buildDevObjectStorageResponse` x3 / `inline-dev` x2 / `/dev/r2/` x2 が **存在**。dev-only コードは dev バンドルに載る。

### TC-3: prod エントリ起動＋通常応答＋sitemap（AC-9）
- `pnpm build && pnpm start`（:8787、起動前 8787 は 0 listeners で stale なしを確認）。
- `GET /` → 200 `text/html`。
- `GET /sitemap.xml` → 200 `application/xml`（10396 bytes、正しい urlset）。fetch フロー書き換え後も sitemap 分岐が生存。
- `GET /admin` → 200。

### TC-4: prod エントリで dev proxy 不発火（AC-9）
- `GET /dev/r2/x`（prod サーバー）→ 404 `text/html`（アプリの「ページが見つかりません」404 ページ）。
- dev proxy の `preRoute` hook が prod エントリには存在せず、通常ルーティングにフォールスルーすることを確認。

### TC-5: dev エントリ起動＋dev proxy 発火（AC-4/AC-5）
- `pnpm build:local && pnpm start`（:8787）。
- `GET /` → 200、`GET /sitemap.xml` → 200 `application/xml`。
- `GET /dev/r2/x`（dev サーバー）→ 404 `text/plain` 本文 `Not Found` ＝ dev proxy の `not_found` レスポンス。**prod（HTML 404）との差異により dev proxy の発火を決定的に確認**。

### TC-6: dev サーバー（pnpm dev）で dev エントリ有効（AC-3）
- `pnpm dev`（vite dev, :3000）。
- `GET /` → 200、`GET /dev/r2/x` → 404 `text/plain` `Not Found`（dev proxy 発火）、`GET /sitemap.xml` → 200。
- vite dev サーバー経路でも `config` カスタマイザの `main` 上書きにより dev エントリが有効。

### TC-7: dev エントリ経由で管理ダッシュボード描画（回帰確認）
- agent-browser で `__Host-session=dev-admin-session-token` を CDP 注入し `/admin` をロード。
- タイトル「管理ダッシュボード — hollow」、URL は `/admin` に留まる（認証成立・リダイレクトなし）。
- ナビゲーション（ダッシュボード / LLM 設定 / ユーザー / ジョブ監視 等）と主要メトリクス・直近24時間チャートが正常描画。dev エントリ経由でもアプリ全体に回帰なし。

### TC-8: バインディング二重化バグの検出→修正
- **検出**: 初回実装の `vite.config.cloudflare.ts` は `config` カスタマイザが `{ ...config, main }` と設定全体を spread して返しており、`@cloudflare/vite-plugin` の差分マージにより `d1_databases`(1→2)・`r2_buckets`(2→4)・`services`(1→2)・`definedEnvironments`(5→10) が二重連結。`wrangler dev` が `"DB assigned to multiple D1 Database bindings"` で起動不能だった。
- **原因**: `WorkerConfigCustomizer<true>` の型は `(config) => Partial<WorkerConfig> | void`（＝差分を返す契約）。全体を返すと自身にマージされ配列が重複する。
- **修正**: カスタマイザを delta のみ返す形（dev: `{ main: dev エントリ }` / prod: `undefined`）に変更。再ビルドで全モード単一バインディング（d1:1/r2:2/services:1/envs:5）に復帰し、両サーバーが正常起動することを確認。ADR-004 に記録。

---

## 既存機能への影響
- `pnpm typecheck`：pass
- `pnpm lint:fix` / `pnpm format`：No fixes
- `pnpm test:unit`：297 files / 4507 tests **全 PASS**（`inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` 含む）
- worker エントリ（relay/consumer/pruner/dlq/indexer）：無変更・回帰なし

## 未実施（構造・起動検証で代替済み）
- inline relay の outbox 実ドレイン（AC-3/AC-7 の完全 E2E）と R2 proxy 経由アップロード往復（AC-4 の完全 E2E）は、認証済み管理者による実操作＋背景ジョブ観測が必要な深い E2E。inline relay / dev proxy のロジックは**移設のみ（ロジック不変）**で単体テスト pass、かつ両 hook の配線は起動時のエンドポイント差異（dev proxy の plain-text 404）で発火を確認済みのため、構造・起動・配線レベルの検証で代替した。
