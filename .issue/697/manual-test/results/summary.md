# テスト実行サマリー — Issue #697

**実行日時**: 2026-06-13 23:40
**テストソース**: .issue/697/testing.md
**サーバー**: http://localhost:3001（ブランチ issue/697/frontmatter-bottom-permanent）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | 編集モードタブから FrontMatter が消えている（AC-1） | 正常系 | PASS | - |
| TC-2 | メタデータ編集領域が画面下部に常設（AC-2） | 正常系 | PASS | - |
| TC-3 | 構造編集 ⇔ 生編集（JSON）トグル（AC-3） | 正常系 | PASS | - |
| TC-4 | バリデーションと保存時シリアライズの維持（AC-4） | 正常系 | PASS | - |
| TC-5 | モード切り替えで FrontMatter 編集内容が失われない（AC-5） | 正常系 | PASS | - |
| TC-EDGE-1 | 生編集JSONが不正なら保存ブロック | 異常系 | PASS | - |
| TC-EDGE-2 | WYSIWYG 装飾消失ゲート(#696)が機能 | 既存機能影響 | PASS | - |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## 備考

- 認証はセッション cookie 注入（`__Host-session` = `dev-admin-session-token`）で成立。
- 本文モード切替の `window.confirm`（未保存変更の確認）は agent-browser のネイティブダイアログ自動処理だと dismiss 扱いになるため、`window.confirm=()=>true` 注入または `element.click()` を eval して受け入れさせた。confirm 自体は正常に発火しており、判定に影響なし（実ブラウザでは通常どおり動作）。
- `/notes` 一覧 URL が当環境で 404 だったが、テスト対象の編集/新規画面は正常動作。本 Issue のスコープ外。
