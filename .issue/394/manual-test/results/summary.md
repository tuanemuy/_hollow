# テスト実行サマリー — Issue #394

**実行日時**: 2026-06-01
**テストソース**: .issue/394/testing.md
**サーバー**: http://localhost:5175/
**ログイン**: `__Host-session` cookie 直接注入（owner: test-394）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | 一覧UIのスタイル表示 | 正常系 | PASS | ページヘッダ/セクション/view-row グリッド、カンプ準拠 |
| TC-002 | 適用導線（visibility=private） | 正常系 | PASS | `/?viewId=...` 遷移、3件（public除外） |
| TC-003 | 適用導線（タグ絞り込み） | 正常系 | PASS | essay→NoteEssay 1件、tagId→tagName 解決OK |
| TC-004 | 適用導線（ディレクトリ・表示モード） | 正常系 | PASS | Journal絞り込み、display=calendar 正規化 |
| TC-005 | brokenConditions 警告 + 適用可 | 異常系 | PASS | role=alert バナー1個、適用可、0件 |
| TC-006 | レスポンシブ（<1024px） | 正常系 | PASS | 2段組化・row-actions 折り返し |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## SKIP（既知制約・自動検証対象外）

- 名前変更 / 既定にする・解除 / 削除 — SKIP。理由: agent-browser からの server-function POST は cross-origin で 403 FORBIDDEN_CROSS_ORIGIN で弾かれる既知制約のため自動検証しない。integration テストで担保。

## 結論

実装バグなし。Issue #394 の要件（①適用導線 ②一覧UIスタイル整備 ③brokenConditions 取り扱い）はすべてブラウザ上で期待どおり動作。
