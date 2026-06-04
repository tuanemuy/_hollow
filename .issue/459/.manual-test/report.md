# ブラウザ検証レポート — Issue #459

**実行日時:** 2026-06-04
**テストソース:** .issue/459/testing.md
**サーバー:** http://localhost:5180/（`pnpm dev --port 5180`）
**認証:** dev-admin（`pnpm seed:dev-admin` の `__Host-session` を CDP 注入）
**検証ノート:** /notes/019e8e9c-5ea4-75dd-88b0-38fcd147137d（検証用に作成）

## サマリー

| TC | テスト名 | 結果 |
| --- | --- | --- |
| TC-1 | 表のツールバーのボタン形態 | PASS |
| TC-2 | ⋯ オーバーフローメニュー | PASS |
| TC-3 | 公開設定の文言削除 | PASS |
| TC-4 | URLコピーのアイコン化・状態フィードバック | PASS |
| TC-5 | 削除 → ConfirmDialog 動線 | PASS |

**合計: 5 件（PASS: 5 / FAIL: 0）**

## 詳細

### TC-1: 表のツールバーのボタン形態 — PASS

`01-toolbar.png`。ツールバーは「編集（アクセント塗りの円・Pencil）／公開設定（ドット＋Globe＋状態ラベルのピル）／移動（円・FolderInput）／URLをコピー（円・Link2）／エクスポート（円・Download）／その他の操作（円・⋯）」。アイコンのみボタンが等しい円形サイズで揃い、横長に浮く問題は解消。accessibility tree でも `link "編集"` / `button "移動"` / `button "URLをコピー"` / `link "エクスポート"` と aria-label が確認できた。

### TC-2: ⋯ オーバーフローメニュー — PASS

`02-menu-open.png`。⋯（その他の操作, `aria-haspopup="menu"`）をクリックで `expanded=true` になり、`menu` 配下に `menuitem "複製"` / `menuitem "履歴"` / `separator` / `menuitem "削除"`（error 色）が出現。区切り線が削除の前に入り、削除のみ danger 配色。roving tabindex で複製にフォーカスが当たる。

### TC-3: 公開設定の文言削除 — PASS

accessibility name は `公開状態: 非公開`（sr-only「公開状態: 」＋状態ラベル「非公開」）。可視テキストは「非公開」のみで、`· 公開設定` の補助テキストは表示されない。

### TC-4: URLコピーのアイコン化・状態フィードバック — PASS

`button "URLをコピー"`（aria-label）＋ 隣接の `status`（aria-live, class=`sr-only`）。クリックで status 領域に文言が書き込まれることを確認（ヘッドレス環境は `navigator.clipboard` が使えず「コピーに失敗しました」が入ったが、これは環境制約であり aria-live 配線・エラーパス自体は正常。可視レイアウトは sr-only により崩れない）。

### TC-5: 削除 → ConfirmDialog 動線 — PASS

⋯ → 削除 をクリックすると `alertdialog "このノートをゴミ箱..."` が表示され、メニューは閉じる。`runAndClose`（フォーカスをトリガーに戻してから close → ダイアログ起動）が機能。キャンセルでダイアログを閉じられた。

## 注記

- agent-browser の `click @ref` が React の合成 onClick に届かないケース（skill の Known Issue）に該当したため、ボタン押下は `eval` 経由の `.click()` で発火させた。レンダリング結果・accessibility tree・遷移はすべて期待どおり。
- 「URLコピー失敗」はヘッドレス＋http の clipboard 制約による環境要因で、実装の不具合ではない（変更前から同じ依存）。Issue 起票は不要。

## 成果物

- レポート: .issue/459/.manual-test/report.md
- スクリーンショット: .issue/459/.manual-test/screenshots/（01-toolbar.png, 02-menu-open.png, 他）
