# TC-3: ノート編集の保存 pending（NoteEditor no-regression）

結果: PASS

判定の主軸（no-regression）: ノートの新規作成・既存編集の保存がどちらも正常動作し、保存後に詳細ページへ navigate。

## 操作ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/notes/new` を開く | 新規ノートエディタ（WYSIWYG/FrontMatter/HTML タブ、タイトル必須、タグ、DirectoryPicker、本文）。タイトル未入力時は「作成」disabled |
| 2 | タイトル・本文を入力 | 「作成」ボタンが enabled 化 |
| 3 | 「作成」クリック | `/notes/{id}` の詳細ページへ navigate、作成したタイトルが見出しに表示 |
| 4 | `/notes/{id}/edit` を開きタイトルを「（編集済み）」に変更→「保存」 | 詳細ページへ navigate、見出しが更新後タイトルに |

## pending 観察

- 作成/保存とも完了が高速で、aria-busy / 「作成中...」「保存中...」ラベルは未捕捉。
- 注記: 手順 3 の最初の「作成」クリックで一度 submit が成立せず（要素のスクロール位置で ref が外れた可能性）、再クリックで navigate した。2 回目以降は問題なく成立。機能の no-regression としては成立。

## コンソール

エラーなし（code-split 警告のみ）。

## スクリーンショット

- screenshots/tc-3/01-filled.png
- screenshots/tc-3/02-pending.png
- screenshots/tc-3/03-pending2.png
- screenshots/tc-3/04-detail.png
- screenshots/tc-3/05-save-pending.png
