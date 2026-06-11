# テスト実行サマリー

**実行日時**: 2026-06-11
**テストソース**: .issue/631/testing.md
**サーバー**: http://localhost:8930（`npx serve spec/design/pages`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 受け入れ grep（機械判定） | 正常系 | PASS | - |
| TC-002 | ロゴの視覚一致（desktop/landing footer） | 正常系 | PASS | - |
| TC-002b | mobile admin ロゴ・sidebar-brand | 正常系 | PASS | - |
| TC-003 | desktop ヘッダー sweep（P11/P15/P18/P21） | 正常系 | PASS | - |
| TC-004 | mobile ヘッダー sweep＋cta-bar 廃止 | 正常系 | PASS | - |
| TC-005 | レスポンシブ維持（360px） | 正常系 | PASS | - |
| TC-006 | 非対象領域の保全（admin/drafts/public/auth） | 異常系 | PASS | - |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## TC-001 詳細（メインで実行）

- `grep -rn 'class="logo">Hollow' spec/design/pages/` → 0件
- `grep -rn '>Hollow<' spec/design/pages/` → 0件（補助 grep で発見した mobile admin 3ファイル＋mobile/P20 sidebar-brand の4箇所はテスト前に置換済み、adr.md ADR-009）
- `grep -rln 'cta-bar' spec/design/pages/mobile/` → 0件

## テスト中に対処した軽微事項

- mobile/P43/P44/P45 の `.logo` に残っていた旧テキストロゴ用 inline style（font-size 等のデッドコード）を除去し、`.logo { display:flex; align-items:center }` を追加。置換後の表示をスクリーンショットで再確認済み。

## 注記（FAIL ではない）

- mobile/P11-note-detail の下部固定バー `.bottom-cta`（編集＋公開設定）は #536 由来のページ局所 CTA で、#628 が廃止した `.cta-bar`（グローバル）とは別物。スコープ外として残置。
- サイドバーのユーザー行でメール末尾が右端に詰まり気味／アバターイニシャル YK と氏名の不一致は確定形 P10-home 由来の既存事項（本Issueの変更起因ではない）。
