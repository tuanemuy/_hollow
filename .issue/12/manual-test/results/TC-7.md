# TC-7: 認可エラーの情報リーク防止 (ADR-004 / 最重要)

**結果**: PASS
**実行時間**: ~30 秒（最終リトライ）
**セッション**: verify-tc-final

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` を開く | ログインフォーム表示 | 表示 | PASS |
| 2 | test-b@example.com / Test1234! でログイン | ログイン成功、`/?page=1&limit=20` に遷移 | 遷移確認 | PASS |
| 3 | `/exports/01938f12-0000-7000-8000-000000000301`（test-a 所有 pending ジョブ）に遷移 | 中立メッセージ表示 | h1「ジョブが見つかりません」+ 本文「ジョブが見つからないか、アクセス権限がありません。」 | PASS |
| 4a | "is not owned by" が表示されない | 表示なし | 出現 0 件 | PASS |
| 4b | userId `0000a1` が表示されない | 表示なし | 出現 0 件 | PASS |
| 4c | target jobId がエラー本文に出ない | 表示なし | エラー本文に 0 件 | PASS |
| 4d | "BusinessRuleError" が表示されない | 表示なし | 出現 0 件 | PASS |
| 4e | "export_unauthorized" が表示されない | 表示なし | 出現 0 件 | PASS |
| 5 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-7/final2.png` | 保存完了 | PASS |

## DOM 取得値

```
- main
  - alert
    - heading "ジョブが見つかりません" [level=1]
    - paragraph
      - StaticText "ジョブが見つからないか、アクセス権限がありません。"
```

## スクリーンショット
- `.issue/12/manual-test/screenshots/tc-7/final2.png`

## 修正反映の判定

ADR-004 のセキュリティ要件 + UX 文言要件の **両方を達成**。

実装の最終形: `app/components/export/ExportJobDetail/Page.tsx` の RSC コンポーネント内で `getExportJob` 呼び出しを `try/catch` でラップし、`isNotFoundError` または `isBusinessRuleError + ExportErrorCode.Unauthorized` の場合に中立メッセージ JSX を直接返す。`renderServerComponent` 内で発生するエラーは `errorResponseMiddleware` を通らないため、エラーが投げられる位置（server component 内、`instanceof` チェックが効く範囲）で処理する必要があった。
