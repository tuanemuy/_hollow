# TC-3: プレビュー編集中の「キャンセル」アクション

**判定**: PASS
**実施日**: 2026-05-27

## 手順と結果

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | アップロードモーダルで `cancel.md` を選択 | preview編集フォーム表示 | OK |
| 2 | 「キャンセル」ボタンを押下 | モーダル閉じる | OK（URL から `#upload` hash 消失） |
| 3 | `/upload` に移動 | `cancel.md` が previewing として残存 | OK（取り込みキュー先頭に `cancel.md` 表示。DB 状態も `previewing`） |

## 確認できた完了条件①関連

- **キャンセルでモーダルを閉じてもジョブは破棄されない**: OK
- **キャンセル後 `/upload` でジョブ続行可能**: OK

## スクリーンショット

- `screenshots/tc-3/01-preview.png`
- `screenshots/tc-3/02-upload-queue.png`
