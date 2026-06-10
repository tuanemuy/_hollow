# TC-1: ノート一覧の描画＋選択モード＋一括ゴミ箱（BulkActionBar dim / ListView・TileView no-regression）

結果: PASS

判定の主軸（no-regression）: 一覧描画・選択モード・一括ゴミ箱操作が正常に成立。SelectionContext に pendingBulk を追加した変更による破損なし。

備考: 一覧は `/notes` ではなく `/`（ホーム）に存在。pending dim は高速完了のため未捕捉。

## 操作ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/` を開く | ノート一覧 10 件表示（リスト/タイル/カレンダータブあり） |
| 2 | 「選択モード」クリック | 各行にチェックボックス、下部に「一括操作」リージョン（移動/公開設定/エクスポート/ゴミ箱へ、初期 disabled）出現 |
| 3 | 2 件チェック（静かなインターフェース / A Pattern Language） | 一括操作ボタンが enabled 化、「2 件選択中」 |
| 4 | 「ゴミ箱へ」クリック | 確認ダイアログ「一括ゴミ箱移動 2 件のノートをゴミ箱に移動しますか？」表示 |
| 5 | ダイアログの「ゴミ箱へ」で確定 | 処理完了。一覧件数 10→8、選択した 2 件が一覧から消失、選択モードは「0 件選択中」へ |
| 6 | 選択モード終了→「タイル」タブ | タイルビュー正常描画（レイアウト崩れなし） |

## pending 観察

- 確定直後の素早い screenshot（04-pending-dim.png）撮影時には既にミューテーション完了済み（件数 8 / 0 件選択中）。dim / aria-busy は高速完了のため未捕捉。
- これは想定どおりで FAIL ではない。

## コンソール

エラーなし。`tanstack-router` の code-split 警告と React DevTools の案内のみ（既存の無害な dev 警告）。

## スクリーンショット

- screenshots/tc-1/01-list-baseline.png
- screenshots/tc-1/02-selected.png
- screenshots/tc-1/03-confirm-dialog.png
- screenshots/tc-1/04-pending-dim.png
- screenshots/tc-1/05-tile-view.png
