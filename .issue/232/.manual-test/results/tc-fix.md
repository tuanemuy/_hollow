# Re-Test TC Fix Verification (Issue #232)

実行日: 2026-05-28
実行者: agent-browser 0.27.0 (session: verify-tc-fix)
dev server: http://localhost:3000

## Summary

| TC | 内容 | 判定 |
|---|---|---|
| Re-TC-008 | DirectoryPicker Rename (form-in-form stopPropagation) | **PASS** |
| Re-TC-010 | F2 ターゲット (onKeyDown stopPropagation) | **PASS** |

---

## Re-TC-008: DirectoryPicker Rename 修正後

### 操作と結果

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | `/notes/01938f02-0000-7000-8000-000000000101` を開き、「編集」をクリック | `/notes/{id}/edit` に遷移、NoteEditor 表示、DirectoryPicker で FooRenamed が選択済み | URL: `http://localhost:3000/notes/01938f02-0000-7000-8000-000000000101/edit`、combobox 既存ディレクトリ = FooRenamed (selected) | OK |
| 2 | 「リネーム」ボタンクリック | RenameDirectoryDialog が開く、textbox に FooRenamed | dialog "ディレクトリをリネーム" が出現、textbox "新しい名前" = FooRenamed | OK |
| 3 | 名前を `FooRenamed2` に変更し「保存」クリック | ダイアログが閉じる、URL が `/notes/{id}/edit` で変わらない（外側 NoteEditor form の submit が発火しない） | **URL は `http://localhost:3000/notes/01938f02-0000-7000-8000-000000000101/edit` のまま不変**、ダイアログ消失、サイドバー/combobox 表示が FooRenamed2 に更新 | **PASS** |

### 判定根拠

- 修正前: 「保存」クリックで外側 NoteEditor の form submit が発火 → URL 遷移 + `#232` タグ追加が発生していた。
- 修正後: form submit は発火せず、URL は `/notes/{id}/edit` のまま。RenameDirectoryDialog 内 form の submit は外側 form に伝播していないことを実機で確認。

### スクリーンショット

- `screenshots/tc-fix/tc008-1-dialog-open.png` — ダイアログ表示状態
- `screenshots/tc-fix/tc008-2-after-save.png` — 保存後（ダイアログ閉じ、URL 不変、サイドバーが FooRenamed2 に更新）

---

## Re-TC-010: F2 ターゲット修正後

### 操作と結果

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | ホーム（`/`）に遷移 | サイドバーツリーに Bar > Child1Renamed が表示 | tree: Bar (level=1, expanded) > Child1Renamed (level=2) | OK |
| 2 | `Child1Renamed` のリンクに focus | リンクがフォーカス状態に | focus 成功 | OK |
| 3 | F2 押下 | `Child1Renamed` がインライン input（textbox）に変化、祖先 Bar は link のまま | `treeitem "Child1Renamed" [level=2] > textbox "ディレクトリ名": Child1Renamed`。Bar (level=1) は引き続き `link "Bar"`、textbox にならない | **PASS** |
| 4 | Esc でキャンセル | textbox が消えて link に戻る | `Child1Renamed` が link 表示に復帰 | OK |

### 判定根拠

- 修正前: F2 の keydown が bubbling して、treeitem のキーボードハンドラが祖先 Bar を rename ターゲットにしていた。
- 修正後: 子 (`Child1Renamed`) の onKeyDown が stopPropagation するため、F2 がフォーカスを持つ要素 (`Child1Renamed`) で消費され、その要素のみ rename input に切り替わる。実機の DOM 上、`Child1Renamed` のみが textbox 化し Bar は link のまま。

### スクリーンショット

- `screenshots/tc-fix/tc010-1-f2-on-child.png` — F2 押下後、Child1Renamed が textbox 化、Bar は link のまま

---

## 結論

両方の修正（DirectoryPicker Rename の form-in-form stopPropagation、ツリー rename の onKeyDown stopPropagation）はブラウザ上で期待どおり動作。Re-TC-008 / Re-TC-010 ともに **PASS**。
