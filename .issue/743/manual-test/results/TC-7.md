# TC-7（エッジ）: ディレクトリ未選択時はパンくず無し

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | open `/`（directoryId 無し） → wait networkidle | OK |
| 2 | snapshot で nav「現在のディレクトリ」の有無を確認 | OK |

## 判定根拠（snapshot 抜粋）

```
- main
  - heading "すべてのノート — ビューを切り替え" [level=1, ref=e45]   ← main 直下の先頭が h1
  - paragraph
```

- `navigation "現在のディレクトリ"` は存在しない。
- フォールバックチップ（ディレクトリフィルタを解除）も存在しない。
- main の先頭要素が h1。レイアウト崩れなし。
