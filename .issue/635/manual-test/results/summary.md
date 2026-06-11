# テスト実行サマリー — Issue #635

**実行日時**: 2026-06-11
**テストソース**: .issue/635/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**認証**: dev-admin（cookie `__Host-session`=`dev-admin-session-token`）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | ノート一覧＋選択モード＋一括ゴミ箱（BulkActionBar dim / ListView・TileView） | 正常系 | PASS | 一覧10件描画・選択モード・一括ゴミ箱(10→8)成立。list/tile両ビュー正常。dim/aria-busyは高速完了で未捕捉 |
| TC-2 | タグ作成 pending（CreateTagForm / TagList） | 正常系 | PASS | 既存3タグ表示、新規追加（楽観→確定）成立。「追加中...」未捕捉 |
| TC-3 | ノート保存 pending（NoteEditor） | 正常系 | PASS | 新規作成・既存編集保存とも成立し navigate。pending未捕捉 |
| TC-4 | DirectoryPicker インライン作成（NoteEditor） | 正常系 | PASS | 新規ディレクトリ名指定保存成立、ツリーに反映 |
| TC-5 | ゴミ箱復元 pending（TrashRowActions） | 正常系 | PASS | 復元成立。**「復元中...」pending を捕捉**。「完全に削除」従来どおり |
| TC-6 | アップロードダイアログのスケルトン（共通 Skeleton 置換） | 正常系 | PASS | **WaitingViewスケルトン（バー3本＋キャプション）を捕捉**、レイアウト崩れなし |

**合計**: 6 件（PASS: 6 / FAIL: 0 / SKIP: 0）

## no-regression 総合判定

変更対象（ListView / TileView / SelectionContext / listSelectors / BulkActionBar / CreateTagForm / TagList / NoteEditor / UploadDialog / TrashRowActions）はいずれも seed データで正しく描画され操作が成立。**機能上の破損は検出されず。**

## pending / skeleton 観察

- 捕捉できた: TC-5（「復元中...」＋disabled、`tc-5/02-pending.png`）、TC-6（WaitingViewスケルトン: surface色バー3本・中央寄せ・幅~75/50/66%・パルス＋キャプション、`tc-6/06-modalskel-2.png`）。いずれも testing.md の期待と一致。
- 未捕捉（localhost高速完了のため・FAILではない）: TC-1（dim/aria-busy）、TC-2（追加中…）、TC-3（作成中/保存中…）、TC-4（ディレクトリ作成中…）。これらは unit test ＋ コードレビューで担保。

## 注意・所見

- ノート一覧の実URLは `/`（ホーム）。`/notes` は `/notes/new`・`/notes/$id` のみ。
- アップロードダイアログのスケルトンはモーダル（`/#upload`）でのみ表示。
- dev サーバーが TC-4/TC-5 間で一度クラッシュ（#635 無関係、再起動で回復）。
- TC-6 で TanStack Start dev の一般的なハイドレーション警告を観測。#635起因と断定できないが要監視。
- 検証データがローカル D1 に残存（必要なら初期化）。
