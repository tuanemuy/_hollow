# TC-E02: `?referencingNoteId=<存在しない id>` → 0 件、エラーなし

- **Issue:** #8
- **実行日時:** 2026-05-17
- **検証者:** Claude Code (agent-browser session `verify-tc-issue8-b`)
- **対象 URL:** `http://localhost:3000/?referencingNoteId=00000000-0000-0000-0000-000000000000`
- **結果:** **PASS**

## 目的

存在しない note id を `referencingNoteId` に指定した場合、adapter の早期 return `[]` で 0 件が返り、エラーが発生しないことを確認。

## 手順

1. シードユーザーでログイン
2. `http://localhost:3000/?referencingNoteId=00000000-0000-0000-0000-000000000000` にアクセス
3. 表示を確認

## 期待結果

- 一覧 0 件として描画
- 「該当するノートがありません」が表示
- エラーレスポンスにならない

## 実際の結果

- URL: `http://localhost:3000/?referencingNoteId=00000000-0000-0000-0000-000000000000&page=1&limit=20`
- 「該当するノートがありません」見出しが表示
- 「参照中: 00000000」chip も併せて表示
- エラーなし、HTTP 200 想定（画面遷移は正常完了）

## スクリーンショット

- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/8/manual-test/screenshots/tc-e02/step-1.png`

## 結論

存在しない id でも adapter / usecase / presentation が壊れない。早期 return `[]` ロジックが効いている。
