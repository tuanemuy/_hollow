# ブラウザ検証レポート — Issue #365: タグ利用件数 read-time 集計

**実行日:** 2026-05-31
**テストソース:** `.issue/365/testing.md`
**サーバー:** http://localhost:3100/
**テストアカウント:** `tag365@example.com`（シード: `.issue/365/manual-test/seed.sql`）

## サマリー

| TC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| TC-001 | FilterBar タグファセットの件数 | PASS | work=2, idea=1, archived-only=0, unused=0 |
| TC-002 | 件数とフィルタ結果の一致（active 基準） | PASS | work フィルタ→2件、ファセット件数と一致 |
| TC-003 | TagManager の件数 | PASS | FilterBar と完全一致 |
| TC-004 | noteCount ソート | SKIP | TagManager にソートUIが存在しない（名前昇順固定）。UI不在のため SKIP |

**合計:** 4件（PASS: 3 / FAIL: 0 / SKIP: 1）

## 読み取った件数

| タグ | 期待 | FilterBar | TagManager | note_count 列 |
|------|------|-----------|-----------|---------------|
| work | 2 | **2** | **2** | 0（無視されている） |
| idea | 1 | **1** | **1** | 0 |
| archived-only | 0 | **0** | **0** | 0（trashed のみ） |
| unused | 0 | **0** | **0** | 0（リンクなし） |

## バグ修正の確認

修正前は `tags.note_count` 列の配線漏れにより全タグが 0 件固定だった。本検証では
`work` の `note_count` 永続列を **0 のまま**にしてあるにもかかわらず、画面に **2** と表示された。
これにより「永続列ではなく read-time 集計（`note_tags` × active `notes`）が件数の真実源」という
修正が正しく機能していることを確認した。FilterBar と TagManager が同一件数を出している点は、
両者が同一 `listTags` → `findByOwner` 経路を通ることの裏付けでもある。

active 基準（ADR-001）も確認: `archived-only`（trashed ノートのみ）が 0 と表示され、
`work` のファセット件数（2）とフィルタ結果のノート数（2）が一致した。

## スクリーンショット

- `screenshots/tc-001-filterbar-facets.png`
- `screenshots/tc-002-work-filter-result.png`
- `screenshots/tc-003-tagmanager-counts.png`

## 結論

FAIL なし。Issue #365 の修正はブラウザ上で期待どおり動作している。起票した Issue なし。
TC-004 の SKIP は「タグのノート件数ソート用 UI が現状のタグ管理画面に存在しない」ためで、
集計ロジック自体のソート（`ORDER BY COUNT(...)`）は integration test（ケース6）でカバー済み。
