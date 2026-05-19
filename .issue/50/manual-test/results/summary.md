# テスト実行サマリー — Issue #50

**実行日時**: 2026-05-20
**Issue**: #50（search index の CJK FTS トークナイズ対応、`unicode61` → `trigram`）
**サーバー**: http://localhost:3000/
**シード**: `.issue/29/.manual-test/seed.sql`

| TC | テスト名 | 結果 | 検証経路 | 備考 |
|----|---------|------|---------|------|
| TC-001 | CJK 部分一致検索（最重要） | PASS | ブラウザ `/search?q=デザイン` | 「公開デザインガイド」が `<mark>デザイン</mark>` ハイライト付きでヒット |
| TC-002 | ASCII 動作維持 | PASS | ブラウザ `/search?q=design` | 同じ件数でヒット、リグレッションなし |
| TC-003 | visibility フィルタとの組み合わせ | PASS | DB 直接 (`wrangler d1 execute`) | public=1 / unlisted=1 / private=0 (期待通り) |
| TC-004 | 混在検索 (CJK + ASCII) | PASS | ブラウザ | `Project デザイン` で「Project A デザインメモ」がマッチ |
| TC-005 | 短すぎるキーワード (`あ` / `AI` / `🎨`) | PASS | ブラウザ | いずれも 0 件、500 エラーなし |
| TC-006 | FTS5 メタ文字 (`"デザイン` / `デザイン:title`) | PASS | ブラウザ | パーサーエラーなし、サニタイズ機能維持 |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## Issue #50 のスコープ要件カバレッジ

- ✅ CJK 部分一致検索が機能（unicode61 時代の 0 件 → trigram で 1+ 件）
- ✅ ASCII 検索のリグレッションなし
- ✅ visibility フィルタ等の既存 search 経路機能が trigram 移行後も動作
- ✅ 短トークン（< 3 codepoint）が adapter ガードで明示的に 0 件として安全に返る（例外なし）
- ✅ FTS5 メタ文字サニタイズが trigram 移行後も機能

## 環境上の特記事項（Issue #50 スコープ外）

- ローカル dev サーバーの `loginFn` server function が認証フロー実行時に 500 を返す既存問題があり、`/`（owner home / `searchOwnNotes`）経由のブラウザ検証は実施不可だった。
- TC-001 / TC-002 / TC-004 / TC-005 / TC-006 は `/search` (public search) 経路で検証完了。
- TC-003 は `wrangler d1 execute --local` 経由の DB 直接クエリで等価検証（`MATCH 'デザイン' AND visibility=...`）。
- これらは Issue #50 のスコープ（FTS5 tokenizer の `unicode61` → `trigram` 移行）には影響しない既存問題。`loginFn` 500 は別途調査・起票が必要であれば Phase 4 のフォロー Issue で扱う。

## アーティファクト

- 各 TC 詳細: `results/TC-001.md` 〜 `TC-006.md`
- スクリーンショット: `screenshots/tc-001/` 〜 `tc-006/`、`screenshots/login/`
- シード情報: `seed-data.md`
- サーバー情報: `server-info.md`
