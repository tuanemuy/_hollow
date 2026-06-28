# TC-2: 画像ボタンが enabled でクリック可能（AC-2 の検証可能部分）
**結果**: PASS（OSダイアログ起動部分は自動検証対象外）
**セッション**: verify-tc-798
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | WYSIWYG モードで `is enabled` で画像ボタン確認 | enabled | true | PASS |
| 2 | 画像ボタンを click | エラー無くクリック成功 | click 成功 | PASS |
| 3 | クリック後にツールバー・画像ボタンが残存し画面が壊れていないか確認 | 画面健在 | toolbarPresent=true, imageButtonPresent=true, body 内容あり | PASS |
| 4 | コンソールエラーの有無を確認 | 機能起因のエラー無し | vite/react-devtools/tanstack の dev 用 info/warning のみ。エラー無し | PASS |
| 5 | OSネイティブのファイル選択ダイアログ起動 | （観測不可） | agent-browser では観測できないため対象外 | 対象外 |

OSネイティブのファイル選択ダイアログ起動は agent-browser で観測できないため自動検証対象外。検証可能範囲（enabled・クリックで画面が壊れない・コンソールエラー無し）はすべて PASS。

## 失敗詳細（FAILの場合）
なし
