# テスト実行サマリー — Issue #29

**実行日時**: 2026-05-18
**テストソース**: `.issue/29/testing.md`
**サーバー**: http://localhost:3000/

## 結果

| TC | テスト名 | 種別 | testing.md 期待値判定 | Issue #29 観点 |
|----|---------|------|----------------------|----------------|
| TC-001 | search 経路で `?visibility=public` フィルタが効く | 正常系 | FAIL (CJK FTS) | **PASS** |
| TC-002 | search 経路で `?visibility=unlisted` フィルタが効く | 正常系 | FAIL (CJK FTS) | **PASS** |
| TC-003 | search 経路で `?visibility=private` フィルタが効く | 正常系 | PARTIAL (CJK FTS) | **PASS** |
| TC-004 | search 経路で visibility 未指定なら全件 | 正常系 | FAIL (CJK FTS) | **PASS** |
| TC-005 | filter 経路への影響なし (#8 リグレッション確認) | 正常系 | PASS | **PASS** |

**Issue #29 観点 合計**: 5/5 PASS

## Issue #29 実装の検証結果

検証中に発見した pre-existing バグ `searchIndex.ts:120` (`sd.note_id = fts.rowid` → `sd.rowid = fts.rowid`) を修正後、英語キーワードで visibility フィルタの完全動作を確認:

```
GET /?q=Project                     → 3 件 (N3, N4, N5)
GET /?q=Project&visibility=public   → 0 件 (Project 系に public 無し、正しく 0)
GET /?q=Project&visibility=unlisted → 1 件 (N4)
GET /?q=Project&visibility=private  → 2 件 (N3, N5)
```

すべて seed-data.md の期待値と一致。「search 経路で URL の visibility パラメータが transport → loader → usecase → SearchQuery → adapter → search_documents 列フィルタ まで一気通貫で伝達される」という Issue #29 の意図がエンドツーエンドで成立している。

## 検出した別 Issue 候補

### [Critical, pre-existing → 修正済み] FTS join 型不一致

`app/core/adapters/d1/searchIndex.ts:120` の `sd.note_id = fts.rowid` が text vs integer の型不一致で全 search クエリが常に 0 件を返していた。本 PR 内で修正済み（同じファイル・同じ動線の問題のため）。

### [Known, scope-out] CJK FTS トークナイズ問題

D1 (SQLite) FTS5 は `unicode61` デフォルトトークナイザを使用しており、連続する CJK 文字を単一トークン化する。このため `デザイン` は `デザイン原則` `デザインメモ` の一部としては MATCH しない:

```sql
SELECT COUNT(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'デザイン';  -- → 0
SELECT COUNT(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'design';    -- → 3
SELECT note_id FROM search_documents WHERE body_plain LIKE '%デザイン%';                -- → ヒット
```

→ Issue #29 のスコープ外（search index 設計の根本的な改善が必要）。Phase 4 でフォロー Issue 化検討。

## 関連ファイル

- 結果詳細: `.issue/29/.manual-test/results/TC-{001..005}.md`
- スクリーンショット: `.issue/29/.manual-test/screenshots/tc-{001..005}/step-01.png`
- シードデータ: `.issue/29/.manual-test/seed-data.md`
