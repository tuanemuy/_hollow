# ブラウザ検証レポート — Issue #605

**実行日時**: 2026-06-09
**テストソース**: `.issue/605/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**結果**: 7 テストケース / **PASS 7・FAIL 0**・起票なし

## 確認できたこと（UI 配線の確証）

- **ソットグル（TC-01）**: デフォルト「公開日順」で published_at 降順（Apple, Banana, Cherry, Date）、「更新日順」へ切替で updatedAt 降順（Cherry, Date, Banana, Apple）に変化。並びが明確に異なり、「公開日順」が `publication_states.published_at` に裏打ちされていることを実証。
  - 補足: デフォルト URL に `?sort=publishedAt` は乗らない（`nextFilterSearch` がデフォルト値を意図的に省略するため）。実効デフォルトは publishedAt で、testing.md の文言が厳密でなかっただけ。defect ではない。
- **期間ファセット（TC-04・決定的）**: `published_at` と `date_for_calendar` を意図的に乖離させたノードで、ファセット件数（7d=1, 30d=3, 1y=5, all=6）とフィルタ結果が **published_at 基準**の窓と完全一致。Apple（公開1日前・カレンダー2年前）は「過去7日」に出現、Date（公開1年超前・カレンダー8日前）は「過去1年」から除外。ファセット件数＝結果件数。
- **username サジェスト（TC-06）**: 大文字 `AL`・小文字 `al` 双方が `@alice`/`@alicia` のみ返す（case-insensitive）。`bob`・公開ノート無しの `alfred` は除外。リテラル `a_` は 0 件（`_` がワイルドカードなら alice/alicia がヒットするので、空が範囲クエリの literal 扱いを証明）。`EXPLAIN QUERY PLAN` で `SEARCH ... USING INDEX uniq_users_username`（range scan）を確認。
- **trash/null 除外（TC-05）**: listing/total が trashed-but-public 行と published_at NULL 行を正しく除外。
- 全ページがエラーなく描画。既存ソート軸・カレンダーグルーピング・ノート詳細・キーワード検索に回帰なし（TC-07）。

## 副産物（#605 スコープ外・参考）

- **TC-05**: プロフィールのヒーロー件数が **5**（一覧は 4）。`getPublicProfile → findPublicByOwner` に active JOIN が無く、trashed-but-public 行を数えてしまう。#605 が listing 側で解消したのと同類だが**別経路・既存問題**。回帰ではないため起票せず記録（Phase 4 のスコープ外 Issue 起票で扱う）。

## 制約・備考

- TC-02 の深い多ページ keyset ページングは少件数 seed のため未実証（integration スイートで担保）。UI 配線目的は達成。
- testing.md 異常系2「stored username に LIKE 特殊文字」は seed として表現不能（username は `[a-z0-9-]` のみ）。代わりにリテラル `a_` 入力（query 側）で TC-06 にて検証。
- 補強として `countPublicSearchFacets` / `publicationStateRepository` の integration スイートを再実行（11 tests passed）。

## 成果物

- seed SQL: `.issue/605/manual-test/seed-605.sql`
- seed/サーバー記録: `seed-data.md` / `server-info.md`
- 各 TC 記録: `results/TC-01.md` 〜 `TC-07.md`、`results/summary.md`
- スクリーンショット: `screenshots/`（8 枚）

## クリーンアップ

ブラウザセッション close、dev サーバー停止（port 3000 解放）、一時ファイル削除済み。コード未変更・ローカル D1 のみ。
