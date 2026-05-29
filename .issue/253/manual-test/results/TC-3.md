# TC-3: 再生成カウントの上限（MAX_REGENERATIONS = 5）

**結果**: PASS
**セッション**: verify-253
**確認項目**: testing.md 確認項目 3

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 同一ジョブで再生成を繰り返し（count 2→5） | 各回 previewing 復帰、count 増加 | 3,4,5 と段階的に増加、毎回 previewing 復帰を DB で確認 | PASS |
| 2 | 6 回目（上限超過）の再生成を試行 | `regeneration_limit_exceeded` 相当のエラー表示 | インライン表示「再生成の回数上限に達しました。一度破棄して再アップロードしてください」 | PASS |
| 3 | ジョブ状態・既存 preview の保全確認 | 壊れず previewing 維持、count は増えない | DB: `status=previewing, regeneration_count=5`（5 のまま、+1 されない） | PASS |

## 観察

- **段階的カウント増加**: D1 の `regeneration_count` が 2→3→4→5 と再生成ごとに +1 されることを確認。
- **上限ガード**: 6 回目（count=5 の状態からの再生成）で `regeneration_count` は 5 のまま据え置き。
  cap バイパスは発生せず、上限で正しく停止。
- **エラー表示**: 「再生成の回数上限に達しました。一度破棄して再アップロードしてください」が
  `IngestionJobRow` 内にインライン表示。これは `regeneration_limit_exceeded`（`MAX_REGENERATIONS=5` 超過）の
  ユーザー向け文言。
- **ジョブの健全性**: ステータスは `previewing` を維持し、既存 preview は保持（破損なし）。

## スクリーンショット

- 上限超過エラー表示: `screenshots/08-tc3-limit-exceeded.png`

## 結論

`regeneration_count` が回ごとに増加し、上限 5 で正しく停止、超過時に `regeneration_limit_exceeded` 相当の
エラーがインライン表示され、ジョブも壊れないことを DB レベルで確認。PASS。
