# 動作確認レポート — Issue #30

**実行日**: 2026-05-18
**ブランチ**: `issue/30/count-by-owner-filters`
**テストソース**: `.issue/30/testing.md`
**サーバー**: http://localhost:3000 (Vite + Cloudflare Workers, `pnpm dev`)
**ユーザー**: `test-user-001@example.com`

## 結論

**Issue #30 の修正は意図通りに機能している。**

修正の核は「`countByOwner(ownerId)` がフィルタを無視していた」点にあり、その結果ホーム画面の `<p class="page-subtitle">{count} 件のノート</p>` がフィルタ適用後の表示件数と乖離していた。本 PR の変更により `count` がフィルタ後の総件数と一致するようになり、検証ケース 5 件すべて PASS。

## 結果一覧

詳細は [results/summary.md](results/summary.md) を参照。

| TC | URL | 期待 | 実測 | 結果 |
|----|-----|------|------|------|
| TC-001 | `/` | 10 | 10 | PASS |
| TC-002 ★ | `?visibility=public` | 1 | 1 | PASS |
| TC-003 | `?visibility=unlisted` | 1 | 1 | PASS |
| TC-004 | `?visibility=private` | 8 | 8 | PASS |
| TC-005 | `?tagNames=["work"]` | 4 | 4 | PASS |

★ TC-002 が Issue #30 の症状を最も直接的に検証する重要ケース。修正前ならここで count=10 と出ていた。

## シードデータ

`seed.sql` (Issue #29 のシードを流用)。10 件のノートを 1 ユーザーに紐づけ。
- visibility 内訳: public=1, unlisted=1, private=8
- 主要タグの件数: work=4, todo=4, ideas=3, personal=2, project-a=2, review=2, design=2

## 検証中に発見した別件

ホームの `renderHome` サーバー関数が 500 エラーを返す事象。原因は seed の `saved_views` 行 `01938f00-0000-7000-8000-00000000d071` の `query_json` 構造（`{filters: {...}}` ネスト形式）と `savedViewRepository` のデコーダ（フラットなキー期待）の不整合。
- **Issue #30 とは独立した seed 側の不整合**で、修正対象のコードパスを通っていない。
- 検証中は当該 saved_views 行を `DELETE` してから再検証し PASS を確認。
- フォローアップ Issue は Phase 4 で要否を判断する。

## 成果物

- `seed.sql` — 投入したシードデータ（Issue #29 から流用）
- `results/TC-{001..005}.md` — 各テストケースの操作ログと結果
- `results/summary.md` — 結果一覧
- `screenshots/tc-{001..005}/` — 検証時のスクリーンショット
