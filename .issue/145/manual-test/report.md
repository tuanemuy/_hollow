# Manual Test Report — Issue #145

**Issue:** #145
**実行日時:** 2026-05-23
**テストソース:** `.issue/145/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev` 経由、port 3000）
**実行方針:** ユーザー承諾のうえ「できる範囲のみ」実施

## 実行サマリー

| カテゴリ | 件数 | 結果 |
|---|---|---|
| サーバー起動確認 | 1 | PASS |
| 公開ページレンダリング（ログイン不要） | 2 | PASS |
| 公開検索クエリ submission（regression） | 1 | PASS |
| **agent-browser 範囲合計** | **4** | **PASS** |
| ログイン必須テストケース | 6 | **SKIP**（理由は後述） |
| cron / D1 直接覗き必須テストケース | 4 | **SKIP**（理由は後述） |

## 実施したテスト

### 1. サーバー起動

- **手順:** `pnpm dev` をバックグラウンド起動 → 30 回×2秒のヘルスチェック
- **結果:** HTTP 307（ルート → ランディング）で正常応答。`Generating runtime types... Runtime types generated.` と `Using secrets defined in .dev.vars` のログを確認
- **判定:** PASS

### 2. ランディングページ表示

- **URL:** `http://localhost:3000/`
- **手順:** agent-browser でトップへナビゲート → snapshot + screenshot
- **結果:** Hollow ランディングが正常レンダリング。banner / navigation / hero / WHY HOLLOW / 4 articles / footer すべて表示
- **スクリーンショット:** `screenshots/top-page.png`
- **判定:** PASS

### 3. /explore 経路

- **URL:** `http://localhost:3000/explore`
- **結果:** 404 ページが正しくレンダリング（このパスは存在しない設計）。404 ページ自身に検索ボックスとリンクが設置されている
- **スクリーンショット:** `screenshots/explore-page.png`
- **判定:** PASS（404 が正しく出ること自体は regression なし）

### 4. 公開検索ページ表示

- **URL:** `http://localhost:3000/search?q=&limit=20`
- **手順:** 404 ページの「検索ページを開く」リンクから遷移
- **結果:** 「公開ノートを検索」ヘッダー、キーワード searchbox、検索ボタン、初期状態の「キーワードを入力してください」案内が正常表示
- **スクリーンショット:** `screenshots/public-search-page.png`
- **判定:** PASS

### 5. 検索クエリ submission（既存機能 regression）

- **URL:** `http://localhost:3000/search?q=test&limit=20`
- **手順:** searchbox に "test" を入力 → 検索ボタンクリック
- **結果:** URL クエリパラメータが正しく更新され、「test」の検索結果 0 件と表示（DB に public なノートがないだけで `SearchPublicNotes` usecase の経路は破綻していない）
- **スクリーンショット:** `screenshots/public-search-empty-result.png`
- **判定:** PASS（**Issue #145 の最大の懸念だった既存検索経路に regression がないことを確認**）

## スキップしたテストとその理由

### A. ログイン必須のテストケース（確認項目 1〜5・6 の一部）

testing.md の確認項目 1〜5 は「ユーザーがノートを作成 → 編集 → trash → 公開設定変更 → 検索」の動線で IndexJob enqueue + drainer 反映を確認するもの。これらはすべて **Google OAuth ログインが必須**。

- agent-browser からの Google OAuth フロー自動化は技術的に困難（外部ドメインの login.google.com への遷移、ユーザー名 / パスワード手動入力が必要）
- ユーザーがインタラクティブに手動アシストする方針も検討したが、対象ケースが多くコスト対効果が低い
- **代替担保:** これらの経路は integration テスト（`app/worker/cloudflare/__tests__/handlers.integration.test.ts` 内の `consumer Worker — note.* / publication.* dispatch (#145)` describe block）でカバー済み。3 シナリオ（note.created → IndexJob upsert + drainer → search_documents、note.trashed → IndexJob delete + publication state、note.publish_changed × trashed seed → IndexJob 不発のステータスガード E2E）。実行結果 **375/375 PASS**

### B. cron トリガー / D1 直接覗きが必要なケース（確認項目 6・エッジケース 1〜4）

- `indexer` worker の cron tick は workerd の `pnpm dev` では自動発火しない（手動 `--test-scheduled` または `wrangler dev --env indexer` が必要）
- DLQ 行の確認は `wrangler d1 execute ... SELECT * FROM index_jobs` 等のコマンド経路で、agent-browser の範疇外
- **代替担保:** `processIndexJobs` の unit テスト（`app/core/application/workers/__tests__/processIndexJobs.test.ts`、空 batch / 複数 batch / maxBatches 打ち切り / per-row failure tolerance / transient retry 分類 / batchSize ≤ 0 no-op）と、`indexJobRepository.test.ts` の `nextBatch` attempts フィルタテスト、`dispatchDomainEvent.test.ts` の trashed status guard / fan-out partial retry / regression guard すべて PASS

## 既存機能 regression まとめ

- `SearchPublicNotes` 経路: PASS（クエリ送信 → 結果 0 件のレンダリング正常）
- ルーティング: PASS（/explore は意図された 404、/search は意図された検索ページ）
- TanStack Start RSC + workerd 起動: PASS（サーバー起動 + ランディング表示 OK）

## 起票した Issue

なし。failure / regression は検出されなかった。

## クリーンアップ

- agent-browser session `verify-145` close 済み
- `pnpm dev` バックグラウンドプロセス stop 済み
- `/tmp/manual-test-145-server.pid` 削除済み

## 成果物

- レポート: `.issue/145/manual-test/report.md`（本ファイル）
- スクリーンショット: `.issue/145/manual-test/screenshots/`（top-page / explore-page / public-search-page / public-search-empty-result の 4 枚）
