# テスト実行サマリー — Issue #749

**実行日時**: 2026-06-18
**テストソース**: `.issue/749/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev` / workerd）
**認証**: `pnpm seed:dev-admin` の admin セッション（cookie `__Host-session=dev-admin-session-token`、CDP 注入）
**検証データ**: 既存ローカル D1（dev-admin: directories 7 / notes 37 / tags 12）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | フィルターチップ高さ（mobile 32px / desktop 28px・44px床なし） | 正常系 | PASS | - |
| TC-002 | 選択チェックボックス寸法（mobile 24px / desktop 20px・44px床なし） | 正常系 | PASS | - |
| TC-003 | 横スクロール・折り返し抑止・選択トグル維持 | 回帰 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 計測値

| 対象 | viewport 375px | viewport 1280px | mock 期待 |
|---|---|---|---|
| filter-chip-ghost（期間/公開状態/内部リンク参照）高さ | 32px | 28px | mobile 32 / desktop 28 |
| note-check（選択チェック）幅×高さ | 24×24px | 20×20px | mobile 24 / desktop 20 |

- いずれも 44px に膨張・潰れしておらず、mock の「タッチ床は pill/icon に限定」方針どおり。
- 選択モードで 20 個のチェックボックスが描画され、選択トグルは正常動作。
