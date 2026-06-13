# TC-EDGE-2（既存機能影響）: WYSIWYG装飾消失ゲート(#696)が機能

**結果**: PASS

## 操作ログ

| # | 操作 | 結果 |
|---|------|------|
| 1 | WYSIWYG非対応タグ入りノート `/notes/01950000-...-697/edit` を開く | OK。既定は「ビジュアル」選択。本文に section/table を含む旨の説明あり |
| 2 | モードタブ「WYSIWYG」をクリック | OK（`element.click()` を eval 実行。agent-browser の ref クリックでは反応せず） |
| 3 | 警告ダイアログ表示を確認 | OK。`role=alertdialog` 「WYSIWYG モードに切り替えますか？」が表示 |

## ダイアログ内容

- 見出し: 「WYSIWYG モードに切り替えますか？」
- 本文: 「次の要素は WYSIWYG モードでは保持されません:」 `<section>`, `<table>`, `<tbody>` ...
- ボタン: 「キャンセル」「切り替える」
- ダイアログ表示中はタブが「ビジュアル」選択のまま（切替はconfirm待ちで保留）= ゲート動作

## 判定

- WYSIWYG切替時に #696 の装飾消失警告ダイアログ（ConfirmDialog / alertdialog）が表示された。FrontMatter常設化はこのゲートを壊していない。期待どおり。
- 注記: このゲートはネイティブ window.confirm ではなく React の alertdialog コンポーネントで、snapshot 上に出現する（dialog status では検出されない）。
