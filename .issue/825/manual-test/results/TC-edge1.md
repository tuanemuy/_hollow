# TC-edge1: リンクダイアログ送信の親フォーム波及

**結果**: PASS

環境: 390x844, http://localhost:3000/notes/new, WYSIWYG モード

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | リンクダイアログで `https://example.com` を入力し「挿入」 | リンク挿入のみ実行、ノート保存 submit は発火しない | リンクが選択テキストに付与された後も URL は `http://localhost:3000/notes/new` のまま。編集画面へのリダイレクトや保存完了トーストは発生せず | PASS |
| 2 | 既存リンクの「更新」/エラー後の再送信を複数回試行 | 親フォームへ波及しない | いずれの submit でも URL は /notes/new のまま、トースト・ナビゲーションなし（`location.href` = "http://localhost:3000/notes/new" を確認） | PASS |

## 補足

- リンクダイアログの form submit が親 NoteEditor form へ伝播していれば、新規ノート作成の submit が発火し URL 遷移かバリデーション反応が起きるはずだが、複数回の挿入/更新でも一切発生しなかった。`stopPropagation` が効いていることを確認。
