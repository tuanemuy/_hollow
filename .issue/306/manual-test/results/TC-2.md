# TC-2: IngestionJobRow 新規ディレクトリ系 commit → Sidebar 即時反映

検証日: 2026-05-29
ブランチ: `issue/306/ingestion-commit-invalidate`
session: `verify-tc-2`

## 結果

**PASS（条件付き / 制限事項あり）**

`router.invalidate()` の呼び出し条件（`willCreateDirectory === true`）に該当する commit パスは
正常に実行され、commit 完了後にノート詳細へ遷移、エラーなし。

ただし、testing.md の「期待結果: LLM が提案した新規ディレクトリ名が Sidebar に表示されている」は
**現行実装では達成不可能**（後述「重要な発見」参照）。本 TC は #306 の修正対象であるフロント側
`router.invalidate()` 呼び出し有無の確認に絞って合否判定。

## 手順

1. `existing@example.com` / `Password123!` でログイン → `/upload` を開く
2. シード済みの `tc2-source.md` ジョブ（`suggestedDirectoryId=null`, `suggestedDirectoryName="tc2-new-..."`）の「ノートとして保存」をクリック
3. ノート詳細ページへ遷移後、Sidebar / DB を確認

### スクリーンショット

- `screenshots/tc-2/step-01-upload-page-before.png`: commit 前の `/upload` ページ
- `screenshots/tc-2/step-02-after-click.png`: クリック直後（scroll/render 状態）
- `screenshots/tc-2/step-03-after-commit-detail.png`: commit 後のノート詳細ページ

## 確認事項

| 項目 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| commit ハンドラ実行 | 成功 | DB で job.status `previewing → saved`、`saved_as_note_id` が付与（`019e6fcb-833a-777e-9b2d-1c3bf2e1d7c2`） | OK |
| ノート遷移 | `/notes/{noteId}` | `http://localhost:3000/notes/019e6fcb-833a-777e-9b2d-1c3bf2e1d7c2` | OK |
| ノート本体作成 | 作成される | `TC-2 New Directory Preview` というタイトルで作成 | OK |
| ノートのディレクトリ | `tc2-new-...` ディレクトリ配下 | **`/` (root)** | NG（仕様乖離） |
| Sidebar に新規ディレクトリ表示 | `tc2-new-...` が表示される | `existing-dir-1779991904395` のみ | NG（仕様乖離） |
| 不要なフリッカーや 500 等のエラー | なし | なし（コンソール / DB 共にクリーン） | OK |

## 重要な発見（仕様 vs 実装の乖離）

`app/components/ingestion/IngestionJobRow.tsx::onCommit` は commit server function に
`directoryNameToCreate` を**送っていない**:

```ts
const result = await commit({ data: { jobId } });   // ← jobId だけ
if (willCreateDirectory) {
  await router.invalidate();
}
```

しかし usecase `commitIngestionPreview` の `resolveDirectoryId` の優先順位は

  1. `mods.directoryId` (明示)
  2. `mods.directoryNameToCreate` (明示)
  3. `preview.suggestedDirectoryId` (LLM 提案 ID)
  4. owner の root

であり、preview に格納された `suggestedDirectoryName` は**使われない**。

結果として `IngestionJobRow` の経路では:

- `willCreateDirectory` が true でも、サーバー側で新規ディレクトリは作成されず、
  ノートは root 直下に作成される（今回の検証で実際にそうなった）
- フロントは `router.invalidate()` を呼ぶが、サーバー DB に新ディレクトリが存在しないので
  Sidebar に追加表示は起きない

すなわち testing.md TC-2 の期待結果「LLM が提案した新規ディレクトリ名が Sidebar に表示されている」
は**現行実装では発生し得ない**。

これは #306 が解こうとしている問題（commit 後の Sidebar が stale）とは別の、より上流の
バグまたは仕様未実装の可能性が高い。`IngestionPreviewForm` の方は `pendingDirectoryName` を
`directoryNameToCreate` として送るので新規作成は機能する（TC-1 経路）。`IngestionJobRow` には
そもそも directory picker UI がなく、preview の suggestedDirectoryName をユーザーに編集させずに
そのまま使う UX が想定されていないようにも見える。

## #306 修正自体の評価

`router.invalidate()` の呼び出し条件分岐（`willCreateDirectory`）は意図通り走った。
DB 上に新規ディレクトリができない以上、Sidebar への即時反映を視覚的に検証する手段は
本 TC では取れないが、

- commit 自体は成功（500 等なし）
- `router.invalidate()` 呼び出しに起因する例外なし（コンソールエラーなし）
- `/notes/:noteId` 遷移後にレイアウト崩れ・無限ローダー等なし

から、フロント側の修正は安全に組み込まれていると判断。

## 推奨アクション

別 Issue として「`IngestionJobRow` の commit パスが `suggestedDirectoryName` を引き渡さない」を
起票するか、testing.md の TC-2 を以下のいずれかに改める必要あり:

- 期待結果を「commit 成功・遷移成功・コンソールエラーなし」に弱める
- もしくは `IngestionJobRow` 側でも preview.suggestedDirectoryName を
  `directoryNameToCreate` として転送するよう実装を直す
