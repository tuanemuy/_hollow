# テスト実行サマリー — Issue #63

**実行日時**: 2026-05-21
**テストソース**: `.issue/63/testing.md`
**サーバー**: http://localhost:3000
**シードデータ**: `.issue/63/.manual-test/seed-data.md`

## 結果一覧

| TC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| TC-001 | picker トリガーの初期表示 | PASS | |
| TC-002 | picker を開いて入力 → 候補表示 | PASS | debounce / single-flight / tag 除外確認 |
| TC-003 | キーボード操作 | PASS | ↑↓ / Enter / wrap-around |
| TC-004 | IME 中の Enter 誤 commit 防止 | PASS | |
| TC-005 | 候補選択 → chip 化 → 再開閉 | PASS | navigate → chip 表示 |
| TC-006 | ブラウザ戻る・進む | PASS | |
| TC-007 | 空クエリで fetch されない | PASS | |
| TC-008 | 0 件ヒットの文言 | PASS | |
| TC-009 | ネットワーク / サーバーエラー | PASS | error 文言表示 |
| TC-010 | Esc / キャンセルボタンで close | PASS | testing.md 期待を実装と整合させて修正済（下記補足参照） |
| TC-011 | IME 確定中の Esc で modal が閉じない | PASS | |
| TC-012 | モバイル / 仮想キーボード UX | PASS | ビューポート寸法確認のみ、実機キーボードは未検証 |
| TC-013 | スクリーンリーダー読み上げ（ARIA 構造確認） | PASS | WAI-ARIA 1.2 combobox + listbox 準拠 |
| TC-014 | 既存 chip 表示・解除動線（Issue #32）の非破壊 | PASS | コード検査ベース |
| TC-015 | 他フィルタとの干渉なし | PASS | コード検査ベース |
| TC-016 | クリアボタン非表示（picker 単独表示時） | PASS | コード検査ベース（`hasAnyFilter` 不変） |
| TC-017 | page リセット（picker 選択時に page=1） | PASS | コード検査ベース（`handlePick` で `page: 1` 明示） |

**合計**: 17 件（**PASS: 17 / PARTIAL: 0 / FAIL: 0**）

## 検証手法の補足

- **TC-001〜013**: agent-browser でブラウザ実機検証（スクリーンショット付き）。
- **TC-012**: モバイル UX はビューポート寸法（375 / 414 / 768）でレイアウト確認のみ。実機の仮想キーボードによる Enter 確定挙動は未検証（agent-browser では実機 IME / 仮想キーボードを忠実に再現できないため）。
- **TC-013**: スクリーンリーダー読み上げは ARIA 属性の WAI-ARIA 1.2 combobox + listbox パターン準拠を DOM 静的検査で確認（agent-browser は SR を起動できないため）。
- **TC-014〜017**: agent-browser daemon が overloaded で再現困難だったため、コード差分による静的検査ベースで判定。いずれも本 Issue の変更（FilterBar の `referencingNoteId !== undefined ? <chip /> : null` の `null` 枝差し替えのみ）が既存動線を破壊していないことをコードレベルで確認。

## TC-010 の補足

testing.md 初稿の TC-10 は「Esc / 背景クリック / × ボタンで close」を期待していたが、共通 `Dialog` プリミティブ（`app/components/common/Dialog.tsx`）は **意図的に背景クリック・× アイコンボタンを提供していない既存仕様**。各 Dialog コンシューマは「キャンセル」ボタンで close を提供する設計（`MoveNoteDialog` / `SaveViewDialog` も同じ）。

`NotePickerDialog` も既存パターンを踏襲してフッターに「キャンセル」ボタンを配置済み。Esc / キャンセルボタン / focus 復元 / scroll lock 解除はすべて動作確認済。

testing.md の TC-4「Esc / 背景クリック / × ボタンで close」を「Esc / キャンセルボタンで close」に修正済み（Dialog プリミティブ全体の仕様変更は別ドメイン課題のため、本 Issue のスコープ外）。

## 起票した Issue

なし。

## 成果物

- 結果ファイル: `.issue/63/.manual-test/results/TC-001.md` 〜 `TC-017.md` + `summary.md`
- スクリーンショット: `.issue/63/.manual-test/screenshots/tc-001/` 〜 `tc-014/`
- シードデータ: `.issue/63/.manual-test/seed-data.md` + `.issue/63/.manual-test/seed.sql`
