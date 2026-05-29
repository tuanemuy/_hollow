# テスト実行サマリー — Issue #298

**実行日時**: 2026-05-29
**テストソース**: .issue/298/testing.md
**サーバー**: http://localhost:5176（`pnpm dev --port 5176`）
**ログイン**: test-298@example.com / TestPass298!
**対象ノート**: /notes/019e7368-a581-743f-b10f-fc366c8e1f9e

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ノート詳細: NoteMetaPanel の境界 | 正常系 | PASS | - |
| TC-002 | ノート詳細: FrontMatterPanel の境界 | 正常系 | PASS | - |
| TC-003 | ノート編集: FrontMatterEditor パネル内ボタン・入力欄の境界 | 正常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 判定根拠（目視＋DOM 実測）

- 3 パネルとも DOM 上で `bg-surface-elevated`（#fbfbfd）が出力されていることを snapshot で確認。
- **TC-001**: NoteMetaPanel（elevated）がページ白背景から hairline 枠＋わずかな明度差で分離。内部のタグチップ・非公開チップ（`bg-surface` #f5f5f7）が一段暗く判別できる。
- **TC-002**: FrontMatterPanel（elevated）内で、tags/reviewers チップ（`bg-surface`）と meta ネストオブジェクトボックス（`bg-surface-hover` #ececef）が階調順（elevated > surface > surface-hover）に暗くなり破綻なし。
- **TC-003**: FrontMatterEditor パネル（elevated）上の `pillBtn`（「生編集（JSON）」「削除」「キーを追加」）と `fieldControl` 入力欄（`bg-surface`）が、マウス hover 前のデフォルト状態でパネル背景から判別できる。修正前は両者とも #f5f5f7 で同化していた境界が回復している。

## 回帰確認

- 共有定数（`pillBtn`/`chip`/`fieldControl`）は無改変。詳細画面下部の「編集」「公開設定」等の白ページ上ボタンは従来通り（`bg-surface`）。
- admin デザイントークン画面（白カード）は変更対象外で影響なし。
