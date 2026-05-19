# TC-5: search 結果の各行から detail ページへ遷移できる

**実行日:** 2026-05-20
**手順:** `/?q=uniquekw` → 最初のタイトルリンクをクリック
**結果:** **PASS**

## 期待結果

- `/notes/<noteId>` の detail ページに遷移する
- 404 にならない

## 実測

- リスト先頭リンクの `href` = `/notes/019e4148-21df-71fc-9636-b95f5a679a3c`（N12 のフル UUID v7 と一致）
- クリック後の URL = `http://localhost:3000/notes/019e4148-21df-71fc-9636-b95f5a679a3c`
- detail ページの `h1` = `[private] uniquekw note 12 (2026-02-20)`（リスト行のタイトルと一致）
- 404 / 「見つかりません」表示なし

`directoryId` / `slug` の実値化により、search 経路でも detail へのリンクが正しく機能している。

## スクリーンショット

- `screenshots/tc-5/step-01-search.png`
- `screenshots/tc-5/step-02-detail.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| `/notes/<noteId>` へ遷移 | OK |
| 404 にならない | OK |
| タイトル一致 | OK |
