# TC-4: パンくずが見出し(h1)の上に表示（AC-4）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | `/?directoryId=...742` の snapshot 全体で DOM 出現順を確認 | OK |

## 判定根拠（snapshot 抜粋・DOM 順）

```
- main
  - navigation "現在のディレクトリ" [ref=e5]       ← パンくず（最上部）
    - link "Documents" [ref=e14]
    - StaticText "Research"
  - heading "すべてのノート — ビューを切り替え" [level=1, ref=e48]   ← h1（その下）
  - paragraph "1 件のノート"
  ...
  - generic                                        ← フィルタ群（さらに下）
    - button "#622 1" ...
    - button "タグで絞り込み" / "期間" / "公開状態"
    - button "フィルタをすべてクリア" [ref=e31]
```

main 直下の DOM 順は nav（現在のディレクトリ）→ h1 → フィルタ群。パンくずは h1 より前（上）に出ており、フィルタ群の下には出ていない。
