# テスト実行サマリー — Issue #356

**実行日**: 2026-05-31
**テストソース**: .issue/356/testing.md
**サーバー**: http://localhost:3100（pnpm dev、ライブソース）
**シード**: .issue/356/manual-test/seed.sql（note-A〜D）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | 上部レイアウト整理（パンくず→タイトル→アクション） | 正常系 | PASS | メタ `<dl>` は本文下部に移動済み |
| TC-002 | パンくず表示・葉ディレクトリ絞り込みリンク | 正常系 | PASS | 中間=非リンク, 葉=`?directoryId=...` 遷移確認 |
| TC-003 | 公開状態チップ + P14 公開設定導線 | 正常系 | PASS | 公開/限定公開/非公開ラベル, `/publish` 遷移確認 |
| TC-004 | 下部プロパティ（作成日/更新日/公開日/タグ/バックリンク） | 正常系 | PASS | 公開日は publishedAt 有時のみ表示 |
| EC-001 | ルート直下ノートのパンくずフォールバック | 異常系 | PASS | 「すべてのノート › タイトル」のみ・葉リンクなし |
| EC-003 | 長いディレクトリ名・タイトルの折返し | 異常系 | PASS | overflow-wrap で破綻なし |
| EC-002 | ゴミ箱（trashed）ノート詳細 | 異常系 | FAIL | **既存バグ・スコープ外**（下記） |

**合計**: 7 件（PASS: 6 / FAIL: 1）

## FAIL 詳細（EC-002 / 既存バグ・本Issueスコープ外）

ゴミ箱（trashed）ノートの詳細ページ（`/notes/$noteId`）を開くと本文が描画されず
「エラーが発生しました」が表示される。

```
BusinessRuleError: Note <id> is trashed; share links are not listable
  at loadPublishStateForNote (app/components/note/loaders.ts) ← NoteDetail の Promise.all
```

`NoteDetail.tsx` は全ノートで `loadPublishStateForNote` を無条件に呼ぶが、
trashed ノートでは share links 列挙が `BusinessRuleError` を投げるため、
`NoteActions` の trashed 早期 return に到達する前にページ全体がエラー境界に落ちる。

**スコープ外・既存バグの判断根拠**: 当該 `Promise.all` + `loadPublishStateForNote` 呼び出しは
`main` の `NoteDetail.tsx` と同一（`git show main:...` で確認）。Issue #356 のレイアウト再構成
（presentation 層の組み立て順変更）とは無関係に main 時点から存在する。修正は loader/usecase 層に
波及するため本Issueでは扱わず、Phase 4 でフォローアップ Issue を起票する。
