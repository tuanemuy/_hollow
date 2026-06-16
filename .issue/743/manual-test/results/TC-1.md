# TC-1: 末尾（現在ディレクトリ）が非リンク（AC-1）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | open `/?directoryId=...742` → wait networkidle | OK |
| 2 | snapshot で `navigation "現在のディレクトリ"` を確認 | OK |

## 判定根拠（snapshot 抜粋）

```
- main
  - navigation "現在のディレクトリ" [ref=e5]
    - link "Documents" [ref=e14]
    - StaticText "Research"
  - heading "すべてのノート — ビューを切り替え" [level=1, ref=e48]
```

- パンくず nav 内: `Documents` は `link`（祖先＝リンク）。
- 末尾 `Research` は `StaticText`（= 非リンク。a11y tree 上 link role を持たない。`aria-current="page"` の span）。

期待どおり、末尾セグメントは非リンク、祖先 Documents はリンク。
