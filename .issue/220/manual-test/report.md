# Manual Test Report — Issue #220

**実行日時:** 2026-05-27
**テストソース:** `.issue/220/testing.md`
**サーバー:** http://localhost:3000/
**ブランチ:** issue/220/upload-modal

## 結果サマリ

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-01 | ヘッダー「アップロード」ボタンでモーダル開 | PASS |
| TC-02 | サイドバー「アップロード」項目でモーダル開 | PASS |
| TC-03 | ノート一覧ツールバー「アップロード」でモーダル開 | PASS |
| TC-04 | ファイルアップロード → 元画面に反映 | PASS |
| TC-05 | URL hash 直リンク + リロード復元 | PASS |
| TC-06 | Esc / × / backdrop / 履歴ポリシー | PASS |
| TC-07 | /upload フォールバックページ + モーダル抑止 | PASS |
| TC-08 | モーダルフッター「取り込みキューを見る」リンク | PASS |

**合計:** 8 件（PASS: 8 / FAIL: 0）

## 主要な検証ポイント

- ヘッダー／サイドバー／ノート一覧ツールバーの 3 つの導線すべてが、ページ遷移せずアップロードモーダルを開く
- モーダル開閉が URL hash (`#upload`) に正しく反映され、直リンクとリロードで復元される
- Esc / × / backdrop の 3 経路すべてでモーダルが閉じ、hash も消える
- `/upload` ページでは UploadDialogMount がモーダル open を抑止し、フォールバックページと UI が重ならない
- 実ファイルアップロード（test-upload.md）が ingestion キューに追加されることを確認

## 補足

- `agent-browser upload` を `LabelText` ref に対して実行するとエラー（"Node is not a file input element"）。CSS セレクタ `input[type=file]` で代替。
- backdrop click の自動化は agent-browser の標準 click だとパネル中央ヒットになるため、`eval` で mousedown→mouseup→click を順次 dispatch して検証。Dialog の origin-guard 仕様（`Dialog.tsx`）に従った正しい挙動を確認。

## 成果物

- 各 TC 詳細: `.issue/220/manual-test/results/TC-01.md` 〜 `TC-08.md`
- スクリーンショット: `.issue/220/manual-test/screenshots/`
- シードデータ: `.issue/220/manual-test/seed-data.md`
- サーバー情報: `.issue/220/manual-test/server-info.md`

## 起票した Issue

なし（全 PASS）
