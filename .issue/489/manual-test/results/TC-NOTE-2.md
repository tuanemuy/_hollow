# TC-NOTE-2: ノート一覧フィルタの graceful fallback（ADR-002）

**結果: PASS**

不正な URL パラメータでも 500 / エラーページにならず、ノート一覧ページが正常描画されることを確認した。不正 id は黙って無視され「フィルタなし（全件）」相当で表示される（DB が空のため 0 件表示）。

## 実行ログ

| Step | URL | 結果 | 観察 |
|------|-----|------|------|
| 1 | `/?directoryId=not-a-valid-uuid` | PASS | 一覧ページ正常描画。heading「すべてのノート」「0 件のノート」。500/エラーページではない |
| 2 | `/?referencingNoteId=invalid-xyz` | PASS | 同上。正常描画 |
| 3 | `/?directoryId=`（空） | PASS | `/` へ正規化され正常描画 |

## スクリーンショット

- `screenshots/tc2-step1-directoryId-invalid.png`
- `screenshots/tc2-step2-referencingNoteId-invalid.png`
- `screenshots/tc2-step3-directoryId-empty.png`

## 備考

- DB にノートが存在しないため全件が 0 件だが、エラーページではなく一覧 UI（フィルタチップ含む）が正常に描画されており、graceful fallback の温存を確認できた。
- transport-boundary（validateSearch）での不正 id の黙殺挙動が維持されている。
