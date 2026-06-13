# TC-tags-2: タグの追加・削除・保存・autosave・IME（AC-2）
**結果**: PASS
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 「新規タグ」textbox に `newtag1` 入力 + Enter | チップ `#newtag1` が増える | `#newtag1` チップが追加された（test/guide/design/newtag1） | PASS |
| 2 | textbox に `aaa,bbb` 入力 + Enter | カンマで分割され `#aaa` `#bbb` の2チップ | `#aaa` と `#bbb` の2チップに分割された | PASS |
| 3 | 既存チップ「guide を削除」ボタンをクリック | `#guide` チップが消える | `#guide` チップが消えた（test/design/newtag1/aaa/bbb） | PASS |
| 4 | textbox 空欄フォーカス時に Backspace | 末尾チップ（bbb）が削除される | `#bbb` チップが削除された（test/design/newtag1/aaa） | PASS |
| 5 | textbox に `draftsave` を入力したまま Enter を押さず「保存」クリック → 再度編集画面を reload | 未確定 draft が保存に含まれ、reload でチップとして復元される | 保存成功しノート詳細へ遷移。reload 後 `#draftsave` チップが復元された | PASS |
| 6 | 既存と同じ `test` を入力 + Enter | 重複追加されない（チップ数不変） | チップ数は 4 のまま、重複追加されなかった | PASS |
| 7 | 空文字 / スペースのみで Enter | タグが追加されない | 空・スペースのみとも追加されず（チップ数不変） | PASS |
| - | IME 変換確定の Enter 抑止 | （手動確認） | agent-browser では IME 変換確定 Enter を再現困難なため未検証（手動確認推奨）。PASS 判定には含めない | 未検証 |

## 失敗詳細（FAILの場合）
なし

## 備考
- Step 5 の reload 後のタグ復元では、テスト操作で追加した test / design / newtag1 / aaa / draftsave に加え、元ノートのタグ `622` も表示された。これは保存処理が draft（未確定入力 draftsave）を取り込んだうえで既存タグを保持していることを示しており、未確定 draft の保存反映が正しく機能していることを確認できた。
