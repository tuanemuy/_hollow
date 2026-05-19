# TC-8: 存在しない jobId 直叩き

**結果**: PASS
**実行時間**: ~10 秒（最終リトライ）
**セッション**: verify-tc-final

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | TC-7 と同一セッションで `/exports/00000000-0000-0000-0000-000000000000` に遷移 | TC-7 と同じ中立メッセージ | TC-7 と完全に同一の DOM | PASS |
| 2 | h1 が「ジョブが見つかりません」 | 表示 | 表示 | PASS |
| 3 | 本文が「ジョブが見つからないか、アクセス権限がありません。」 | 表示 | 表示 | PASS |
| 4 | NotFound と Unauthorized の表示が外形的に区別不能 | 区別不能 | TC-7 と完全に同一の DOM 構造 | PASS |
| 5 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-8/final2.png` | 保存完了 | PASS |

## DOM 取得値

```
- main
  - alert
    - heading "ジョブが見つかりません" [level=1]
    - paragraph
      - StaticText "ジョブが見つからないか、アクセス権限がありません。"
```

TC-7 と完全に同一。

## スクリーンショット
- `.issue/12/manual-test/screenshots/tc-8/final2.png`

## オラクル攻撃耐性

NotFound (TC-8) と Unauthorized (TC-7) の表示が完全に区別できないため、攻撃者は任意の jobId についてその存在の有無を判別できない（ADR-004 の核心要件）。
