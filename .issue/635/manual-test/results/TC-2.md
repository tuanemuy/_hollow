# TC-2: タグ作成の pending（CreateTagForm / TagList no-regression）

結果: PASS

判定の主軸（no-regression）: タグ作成が正常に成立し一覧に反映。isPending prop 追加による破損なし。楽観追加が機能。

## 操作ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/tags` を開く | タグ管理画面。既存 3 タグ（design / アイデア / 日記）表示、追加フォーム・並び替えタブ・各行のリネーム/統合/削除あり |
| 2 | 「新しいタグ」に `verify635タグ` 入力→「追加」 | 新規タグ `#verify635タグ`（0 件のノート / 未使用）が一覧に追加、件数 3→4 |
| 3 | 一覧確認 | design / verify635タグ / アイデア / 日記 の 4 件、追加ボタンは通常状態へ復帰 |

## pending 観察

- 送信直後の素早い screenshot（02-pending.png）で既に楽観追加済みの `#verify635タグ` 行が表示され、「追加」ボタンも通常状態。「追加中...」/disabled は高速完了のため未捕捉。
- 楽観追加の挙動自体は確認できた（送信直後に行が出現）。FAIL ではない。

## コンソール

エラーなし（code-split 警告のみ）。

## スクリーンショット

- screenshots/tc-2/01-baseline.png
- screenshots/tc-2/02-pending.png
- screenshots/tc-2/03-added.png
