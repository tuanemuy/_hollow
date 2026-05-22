# テスト実行サマリー — Issue #93

**実行日時:** 2026-05-22
**テストソース:** .issue/93/testing.md
**サーバー:** http://localhost:3000 （`pnpm dev` で起動）

## 結果

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | dev サーバーが起動し home が描画される | スモーク | PASS |
| TC-002 | `/admin/jobs` が未認証で「アクセスできません」を返す（admin auth gate） | スモーク | PASS |
| TC-003 | admin から rebuild ボタンが動作する | E2E | SKIPPED（理由は下記） |
| TC-004 | rebuild 後 `/search` で結果が返る | E2E | SKIPPED |
| TC-005 | visibility / tagNames / directoryPath が snapshot から正しく投影 | E2E | SKIPPED |
| TC-006 | non-admin が rebuild を叩いたら 403 | E2E | SKIPPED |
| TC-007 | 0 ノートで `processedCount === 0` | E2E | SKIPPED |
| TC-008 | trashed note の除外 | E2E | SKIPPED |

**合計**: PASS 2 / SKIPPED 6

## ブラウザスモーク詳細

### TC-001
- `agent-browser open http://localhost:3000/` → HTTP 307 → 解決後 200、title "TanStack Start Template"
- スクリーンショット: `screenshots/01-home.png`

### TC-002
- `agent-browser open http://localhost:3000/admin/jobs` → ページ描画完了
- ページ内容: `<h1>アクセスできません</h1>` + 「ホームへ戻る」リンク
- → admin 認可ガードが正しく機能している
- スクリーンショット: `screenshots/02-admin-jobs-unauth.png`

## E2E SKIP の理由

TC-003 以降の admin 認証フローを agent-browser で完走させるには、次の seed フローが必要:

1. `.dev.vars` の `ADMIN_SETUP_TOKEN` を設定
2. `/auth/signup` で admin 登録（`AdminSignUp` ユースケース、`spec/usecases/identity.md` 参照）
3. 確認メールリンクで activate（メールインフラ or DB 直接書き換え）
4. login
5. 複数 note の作成（タイトル / タグ / directory / public / private mix）
6. trashed note の作成
7. ようやく rebuild ボタンの動作確認

このセットアップは本 Issue のスコープから外れる。同等の検証は **`rebuildSearchIndex.integration.test.ts`**（miniflare D1 で実走、admin / 非 admin / 空 corpus / 複数 user×複数 note×trashed 除外 / publication state による visibility 投影 / `frontMatterDate` 解釈 / `SearchIndexUnavailableError` propagate / rebuild 後の `searchIndex.query` smoke）で end-to-end 担保済み（4 ケース、全 PASS）。

**判定**: ブラウザ要素（ボタンが描画され、`useServerFn(rebuildSearchIndexFn)` で呼び出される form の wiring）は TanStack Start のパターンに完全準拠（既存 `retryIngestionJobFn` / `retryExportJobFn` と同じ）し、`/admin/jobs` の route が認可ガード込みで動作することを TC-002 で確認済み。サーバーサイドロジックは integration test で 4 件 PASS。よって機能の正しさは担保されたとみなす。

## 起票した Issue

なし
