# TC-3: 末尾 × が無い（AC-3）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | `/?directoryId=...742` の snapshot を確認 | OK |

## 判定根拠（snapshot 抜粋）

```
- navigation "現在のディレクトリ" [ref=e5]
  - link "Documents" [ref=e14]
  - StaticText "Research"
```

パンくず nav 内には `Documents`(link) と `Research`(text) のみ。「ディレクトリフィルタを解除」ボタンや「×」は存在しない。末尾 × は廃止されている。
