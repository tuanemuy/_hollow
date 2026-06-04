# TC-3: source を持たないノートで「元ファイル」セクションが非表示・UI が壊れない

**結果:** PASS

## 目的
sourceFile===null のノートで「元ファイル」セクションが表示されず、他の表示も崩れないこと。

## 前提
- ノート: `019e8e80-65f3-7565-be06-52ab1a9b81d6`「No Source File Note TC3」, source_file_id=NULL

## 操作ログ

| # | 操作 | 期待 | 結果 |
|---|------|------|------|
| 1 | `/notes/019e8e80-65f3-7565-be06-52ab1a9b81d6` を開く | 詳細画面表示 | OK |
| 2 | 「元ファイル」セクションの有無 | 非表示 | OK（`元ファイル` 文字列が DOM に存在しない: `sourceFileSectionPresent:false`） |
| 3 | プロパティパネル表示 | 正常表示 | OK（`propertiesPresent:true`） |
| 4 | 見出し | タイトル表示 | OK（h1=「No Source File Note TC3」） |

## スクリーンショット
- `screenshots/TC3-no-source-file.png`

## 判定
`NoteMetaPanel` の `sourceFile !== null && sourceMediaId !== null` ガードにより「元ファイル」行が描画されず、プロパティパネルとタイトルは正常。**PASS**。
