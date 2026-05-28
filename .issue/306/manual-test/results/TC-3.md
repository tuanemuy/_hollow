# TC-3: 既存ディレクトリ選択 commit パスでの挙動

検証日: 2026-05-29
ブランチ: `issue/306/ingestion-commit-invalidate`
session: `verify-tc-3`

## 結果

**PASS**

既存ディレクトリ ID を指定した commit パスでは Sidebar tree が変化せず、
不要な再描画やエラーは観測されなかった。`router.invalidate()` が条件付きで呼ばれない
ことの間接確認（`willCreateDirectory === false` ブランチ）も達成。

## 手順

1. `existing@example.com` / `Password123!` でログイン → `/upload` を開く
2. シード済みの `tc3-source.md` ジョブ（`suggestedDirectoryId="019e6fc9-008b-..."`,
   `suggestedDirectoryName=null`）の「ノートとして保存」をクリック
3. ノート詳細ページへ遷移後、Sidebar / DB を確認

### スクリーンショット

- `screenshots/tc-3/step-01-upload-before.png`: commit 前
- `screenshots/tc-3/step-02-after-commit.png`: commit 後のノート詳細

## 確認事項

| 項目 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| commit ハンドラ実行 | 成功 | DB で job.status `previewing → saved`、`saved_as_note_id=019e6fcd-dd57-75e6-ad7a-498f35545d77` | OK |
| ノート遷移 | `/notes/{noteId}` | `http://localhost:3000/notes/019e6fcd-dd57-75e6-ad7a-498f35545d77` | OK |
| 作成されたノートのディレクトリ | 既存の `existing-dir-1779991904395` 配下 | ノート詳細ヘッダで `/existing-dir-1779991904395` 表示 | OK |
| Sidebar tree の変化 | 変化なし | `existing-dir-1779991904395` のみ表示で変化なし | OK |
| 不要なフリッカー・エラー | なし | なし | OK |

## 補足

`IngestionJobRow.onCommit` の条件分岐は

```ts
const willCreateDirectory =
  job.preview !== null &&
  job.preview.suggestedDirectoryId === null &&
  job.preview.suggestedDirectoryName !== null;
```

TC-3 ジョブは `suggestedDirectoryId !== null` なので `willCreateDirectory === false`、
`router.invalidate()` は呼ばれない経路。Sidebar は loader 既存キャッシュのまま使われ、
遷移時のフラッシュなし。
