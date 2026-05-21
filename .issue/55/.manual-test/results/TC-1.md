# TC-1: マージダイアログに「対象ノート: N 件」が事前提示される（noteCount > 0）

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-merge

## 手順実行

1. `/tags` にアクセス（ログイン後）
2. `#alpha`（4 件のノート紐付け）行の「統合」ボタンをクリック → ダイアログ表示
3. 統合先タグセレクトで `#beta` を選択

## 期待結果

説明文に「**対象ノート: 4 件**」を含む文言が表示される。

## 実測結果

ダイアログ内 paragraph に以下が表示された:

```
#alpha（対象ノート: 4 件） を #beta に統合します。
#alpha は削除され、参照ノートは #beta を持つよう更新されます。
```

`<strong>` でラップされた「対象ノート: 4 件」を accessibility tree で確認。
件数（4）は seed の `#alpha` の noteCount（4）と完全一致。

## エビデンス

- スクリーンショット: `screenshots/tc-001-step-1.png`
- accessibility tree:
  ```
  - paragraph
    - StaticText "#alpha（"
    - strong
      - StaticText "対象ノート: 4 件"
    - StaticText "） を #beta に統合します。#alpha は削除され、参照ノートは #beta を持つよう更新されます。"
  ```
