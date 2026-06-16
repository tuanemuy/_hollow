# TC-2: 祖先セグメントはリンクとして機能（AC-2）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | `/?directoryId=...742` 表示済み | OK |
| 2 | パンくずの `Documents` (@e14) をクリック | OK |
| 3 | wait networkidle → get url | `http://localhost:3000/?directoryId=01950000-0000-7000-8000-000000000741` |

## 判定根拠

クリック後の URL が `directoryId=...741`（Documents）に遷移。祖先リンクが機能している。
