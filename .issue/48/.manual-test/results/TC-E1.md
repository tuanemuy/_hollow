# TC-E1: search 結果 0 件 — 空状態 UI

**実行日:** 2026-05-20
**URL:** `http://localhost:3000/?q=nonexistentterm-zzzz`
**結果:** **PASS**

## 期待結果

- 「該当するノートがありません」の空状態 UI が出る
- `findByIds` が空配列で呼ばれてもエラーにならない
- コンソールエラーなし

## 実測

- list items 数: **0**
- 空状態文言 `該当するノートがありません` を表示
- ヘッダに `0 件のノート` 表示
- フォローアップ案内: `条件を変更するか、新しいノートを作成してください。` + `最初のノートを作成` ボタン
- console ログ: vite / React DevTools の info メッセージのみ。**エラー (error / warning) なし**
- 500 エラー / クラッシュなし

`searchOwnNotes` が空 hit を `findByIds` に渡しても安全に空結果を返している（ADR-002 drop 動作とも整合）。

## スクリーンショット

- `screenshots/tc-e1/step-01-empty.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| 空状態 UI 表示 | OK |
| コンソールエラー | なし |
