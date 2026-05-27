# TC-1: 単一ファイルでの新フロー（選択 → 推論待ち → プレビュー編集 → 登録）

**判定**: PASS
**実施日**: 2026-05-27
**実施者**: agent-browser 自動検証

## 手順と結果

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | ヘッダー「アップロード」をクリック | モーダルが開き URL hash `#upload` | OK（hash `#upload` 確認） |
| 2 | dropzone 内 `input[type=file]` に `sample.md` をアップロード | スケルトン → preview編集フォーム | OK（preview編集フォームが表示。タイトル `sample` / タグ `テスト, アップロード, issue226` が抽出） |
| 3 | タイトル `Issue 226 Test Note (Edited)`、新規ディレクトリ `issue226-test`、FrontMatter `{"source":"tc-1","verified":true}` を入力 | 各フィールド編集可 | OK |
| 4 | 「登録」を押下 | モーダル閉じてノート詳細へ遷移 | OK（`/notes/019e698c-4842-702c-8324-f16061da5531` へ遷移） |
| 5 | ノート詳細でタイトル・ディレクトリ・タグが反映 | 反映済 | OK（タイトル / `/issue226-test` / `#テスト` 等） |

## 確認できた完了条件①関連

- **ファイル選択 → 推論待ち → 提案表示 → 登録 が同一モーダル内で完結**: OK
- モーダル右上に「閉じる」ボタンあり（離脱可能）
- スケルトン→preview の遷移は短時間で完了（数秒以内）
- preview にはキャンセル / 破棄 / 登録 の3アクション

## スクリーンショット

- `screenshots/tc-1/01-after-upload-click.png` - モーダル初期状態（dropzone）
- `screenshots/tc-1/02-after-upload.png` - ファイル選択後（preview編集フォーム）
- `screenshots/tc-1/03-edited-fields.png` - フィールド編集後
- `screenshots/tc-1/04-after-register.png` - ノート詳細遷移
