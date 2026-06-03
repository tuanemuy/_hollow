# テスト実行サマリー — Issue #92

**実行日時**: 2026-06-03
**テストソース**: .issue/92/testing.md
**サーバー**: http://localhost:3100（dev / port 3100）
**ツール**: agent-browser 0.27.0

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ASCII短キーワード救済 `?q=AI` | 正常系 | PASS | - |
| TC-002 | CJK 1文字 `?q=本` | 正常系 | PASS | - |
| TC-003 | 3+ codepoint は MATCH 経路（回帰なし）`?q=デザイン` | 正常系 | PASS | - |
| TC-004 | 混在で短トークン無視 `?q=AI デザイン` | 正常系 | PASS | - |
| TC-005 | ヒットしない短語 `?q=zz` | 異常系 | PASS | - |
| TC-006 | LIKE エスケープ `?q=%` | 異常系 | PASS | - |
| TC-007 | LIKE ページネーション `?q=Go&limit=1` | 正常系 | PASS | - |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## 主要な所見

- LIKE フォールバックは 2 codepoint・CJK 1 文字・短キーワードで正しく発動。LIKE 経路ではスニペットに `<mark>` が付かない（仕様どおり）。
- 3 codepoint 以上は従来どおり MATCH 経路（`<mark>` ハイライト付き）で回帰なし。
- 混在クエリ `AI デザイン` では短トークン `AI` が捨てられ `デザイン` のみで MATCH（AI を含まないノートがヒット、AI を含むノートは非ヒット）。
- `%` がワイルドカードとして暴発せず正しくエスケープ（「セール情報」body "50%" の1件のみヒット）。
- LIKE 経路でも cursor ベースページャ（`cursor=offset:1`）が重複なく機能。

## 成果物

- 各 TC 結果: `.issue/92/manual-test/results/TC-001.md` 〜 `TC-007.md`
- スクリーンショット: `.issue/92/manual-test/screenshots/tc-00N/`
- シードSQL: `.issue/92/manual-test-seed.sql`
