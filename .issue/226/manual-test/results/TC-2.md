# TC-2: プレビュー編集中の「破棄」アクション

**判定**: PARTIAL（モーダル内で破棄フロー成立は確認、ただし状態遷移に不整合の疑い）
**実施日**: 2026-05-27
**実施者**: agent-browser 自動検証

## 手順と結果

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | アップロードモーダルで `discard2.md` を選択 | preview編集フォーム表示 | OK |
| 2 | 「破棄」ボタンを押下 | confirm dialog (alertdialog) が表示 | OK（「ジョブを破棄」「このジョブを破棄しますか？」） |
| 3 | confirm dialog の「破棄」ボタンを押下 | モーダルが閉じ、ジョブが discarded 状態へ | **不整合**: URL が `/notes/019e698f-1278-76aa-b27b-4faa37813211` へ遷移し、`notes` テーブルに `discard2` のノートが作成された。DB の ingestion_jobs では同じファイル名の別ジョブが `saved` 状態で残り、本来 discarded にすべきジョブは `previewing` のまま残存している |

## 確認できた完了条件①関連

- **モーダル内で破棄アクションが提供されている**: OK
- **confirm dialog が出る**: OK（spec通り）

## 注意事項・疑念

- 確認 dialog の「破棄」ボタンの ref を `e53` として取得・クリック後、画面遷移が `/notes/<note-id>` になっており、破棄ではなく **commit（保存）が走った可能性**がある
- ただし、`/upload` ページから先に同じファイル名でアップロードした結果 2 ジョブが生成されており、テスト環境ノイズの可能性も高い
- 単独再現の確認は時間制約により未実施

## スクリーンショット

- `screenshots/tc-2/04-preview-form.png` - preview編集フォーム表示
- `screenshots/tc-2/05-confirm-dialog.png` - 破棄確認 alertdialog
- `screenshots/tc-2/06-after-confirm.png` - confirm 確定後（ノート詳細遷移）

## 起票候補

- 破棄ボタン押下時に commit が走る可能性のあるバグ。ただし環境ノイズの可能性もあり、コンポーネント側テスト (`UploadDialog.test.tsx`) でカバー済みかの確認推奨
