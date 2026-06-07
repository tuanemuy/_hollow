# Edge-1: パスワード不一致のインラインエラー（ロックアウト前）

**結果**: PASS

## 実行ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/share/test-share-passworded-0001` を開く | STATE1 ゲート表示。「このノートはパスワードで保護されています」+ パスワード入力欄(e5) + 送信ボタン「閲覧する」(e6) |
| 2 | snapshot + スクショ（tc-edge1-gate.png） | パスワード入力欄と送信ボタンを確認 |
| 3 | `wrong-pass` を入力して送信（fill + Enter） | サーバが `share_link_password_invalid` を返却 |
| 4 | snapshot + スクショ（tc-edge1-error.png） | `role="alert"` の「パスワードが正しくありません。」がフォーム内に表示。フォームは残存 |

## 確認できた事実

- インラインエラー文言: **「パスワードが正しくありません。」**（`role="alert"`、フォーム内の `<p>`、`text-error` の赤系テキスト）。
- 案D の警告アラート（白地＋枠ボックス、`role="status"`）ではなく、従来どおりの**インラインのエラー文言**であることを確認。
- フォーム（入力欄 + 送信ボタン）はエラー後も残存。
- 送信が React 19 の useActionState に届いていることを確認（サーバが正しくエラー応答を返し、後続で正パスワード `test1234` 送信時は公開ノートへ遷移した）。

## スクショ

- `.issue/544/manual-test/screenshots/tc-edge1-gate.png`
- `.issue/544/manual-test/screenshots/tc-edge1-error.png`
