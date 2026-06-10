# TC-5: ゴミ箱の復元 pending（TrashRowActions no-regression）

結果: PASS（pending 状態を捕捉）

判定の主軸（no-regression）: ゴミ箱からの復元が正常動作。復元後に当該行がゴミ箱から消え、アクティブ一覧に出現。「完全に削除」側も従来どおり表示。

## 操作ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/trash` を開く | ゴミ箱に複数ノート。各行に「復元」「完全に削除」。`[test] ゴミ箱ノートA/B（復元対象）` を含む |
| 2 | `[test] ゴミ箱ノートA（復元対象）` の「復元」クリック | 当該行が「復元中...」ラベル＋ボタン disabled、隣接「完全に削除」も disabled に（pending 捕捉） |
| 3 | 完了後 | 当該行がゴミ箱一覧から消失 |
| 4 | `/`（アクティブ一覧）確認 | `[test] ゴミ箱ノートA（復元対象）` がアクティブ一覧に出現、件数 10→11 |

## pending 観察

- 捕捉できた。02-pending.png で復元対象行に「復元中...」表示・disabled、「完全に削除」も dim/disabled を確認。
- 「完全に削除」（ConfirmDialog 起動）ボタンも各行に従来どおり存在。

## コンソール

エラーなし（code-split 警告のみ）。

## 補足（環境イベント）

TC-4 と TC-5 の間で dev サーバーが一度クラッシュ（ERR_CONNECTION_REFUSED）。dev ログにアプリ由来のエラーは無く、#635 変更とは無関係の dev サーバー自体の落ち。再起動後、ブラウザの `__Host-session` cookie が失われたため `dev-admin-session-token` を再注入して認証を回復。ローカル D1 のデータは永続しており（TC-1 でゴミ箱に入れた 2 件・TC-4 で作った TC4新規ディレクトリも残存）、検証続行に支障なし。

## スクリーンショット

- screenshots/tc-5/01-baseline.png
- screenshots/tc-5/02-pending.png（「復元中...」捕捉）
