# TC-2: マージダイアログに「対象ノート: 0 件」が表示されない（noteCount === 0）

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-merge

## 手順実行

1. `/tags` で `#empty`（0 件のノート）行の「統合」ボタンをクリック
2. 統合先タグセレクトで `#target` を選択

## 期待結果

説明文に件数フレーズが含まれず、既存文言「#empty を #target に統合します。…」のみが表示される。

## 実測結果

ダイアログ内 paragraph の textContent は以下:

```
#empty を #target に統合します。#empty は削除され、参照ノートは #target を持つよう更新されます。
```

ダイアログ全体の textContent を JS で取得しても "対象ノート" の文字列は含まれていなかった:

```
タグを統合統合先タグ— 選択してください —#beta#delete-me#design#ideas#personal#project-a#review#target#todo#work#empty を #target に統合します。#empty は削除され、参照ノートは #target を持つよう更新されます。キャンセル統合
```

件数フレーズ "対象ノート: 0 件" は描画されないことを確認。

## エビデンス

- スクリーンショット: `screenshots/tc-002-step-1.png`
- accessibility tree:
  ```
  - paragraph
    - StaticText "#empty を #target に統合します。#empty は削除され、参照ノートは #target を持つよう更新されます。"
  ```
- dialog textContent: 「対象ノート」を含まないことを `eval` で確認
