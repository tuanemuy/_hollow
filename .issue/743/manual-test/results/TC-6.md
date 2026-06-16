# TC-6（エッジ）: 解決不能ディレクトリのフォールバックチップ（AC-6）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | open `/?directoryId=...09ff`（実在しない UUIDv7） → wait networkidle | OK |
| 2 | snapshot で nav「現在のディレクトリ」とフォールバックチップを確認 | OK |
| 3 | フォールバックチップ × (@e32) をクリック → get url | `http://localhost:3000/` |

## 判定根拠（snapshot 抜粋）

```
- main
  - heading "すべてのノート — ビューを切り替え" [level=1, ref=e49]   ← h1 が main 最上部
  ...
  - generic                                       ← フィルタ行
    - StaticText "ディレクトリ"                     ← フォールバックチップ ラベル
    - button "ディレクトリフィルタを解除" [ref=e32]
      - StaticText "×"
  - heading "該当するノートがありません" [level=2, ref=e7]
```

- ヘッダ上に `navigation "現在のディレクトリ"` は出ていない（パンくず無し）。
- 代わりにフィルタ行に「ディレクトリ」フォールバックチップ＋「ディレクトリフィルタを解除」× が表示。
- × クリックで directoryId が消え `/` に戻る。

location（パンくず）と filter（フォールバックチップ）の棲み分けが成立。
