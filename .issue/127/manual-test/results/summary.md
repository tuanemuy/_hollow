# テスト実行サマリー — Issue #127

**実行日**: 2026-05-29
**テストソース**: `.issue/127/testing.md`
**サーバー**: http://localhost:5180/
**ローカル D1**: `hollow-local-d1`

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | タイトル完全一致で解決 | 正常系 | PASS | `[[My First Note]]` → resolved_note_id NOT NULL |
| TC-002 | 日本語・大小違いで解決 | 正常系 | PASS | `無題メモ` / `hello`→`Hello` ともに解決 |
| TC-003 | バックリンク表示 | 正常系 | PASS | ノートAに `Linker Note` がバックリンク表示 |
| TC-004 | 存在しないリンクは未解決のまま | エッジ | PASS | broken link 維持・保存成功 |
| TC-005 | UUID 直書き（kind=id）も解決 | エッジ | PASS | 修正後（ADR-007）に解決。存在しない UUID は null 維持・FK 違反なし |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 経緯
- 初回検証で TC-005 が FAIL（`kind=id` の resolved_note_id が NULL）。これは VO doc の不変条件「id-keyed references always carry the matching id」に対する既存実装の違反で、Issue #127 の原因候補「ref.target と resolvedNoteId の関係性の検証漏れ」そのもの。同じ関数・同じ機能のため Phase 2 に戻り修正（ADR-007）。
- 修正後に再検証し TC-005 PASS。存在しない UUID は null 維持で FK 違反による保存失敗も起きないことを確認。

## 備考
- agent-browser の `click` がフォーム送信ボタンに届かないケースがあり、`form.requestSubmit()` で送信した。経由する server function（`createNote`）は本番と同一でありテスト妥当性に影響なし。テスト手法上の留意点。
