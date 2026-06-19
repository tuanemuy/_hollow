# テスト実行サマリー — Issue #748

**実行日時**: 2026-06-18
**テストソース**: .issue/748/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | LLM hourly 系列が実データで描画される | 正常系 | PASS | - |
| TC-2 | scalar「LLM 呼び出し (24h)」が実数で表示 | 正常系 | PASS | - |
| TC-5 | 既存アップロード系列・他カードへの回帰 + 2カラム | 回帰 | PASS | - |
| Edge-2 | bucket 境界の一致（両系列24バケット構造） | エッジ | PASS | - |
| TC-3 | Stub/未設定時は記録されない | 正常系 | 自動テスト担保 | - |
| TC-4 | partial-failure 時の degrade | 異常系 | 自動テスト担保 | - |
| TC-6 | 刈り込み（保持窓48h） | 正常系 | 自動テスト担保 | - |

**ブラウザ観測分**: 4 件（PASS: 4 / FAIL: 0）

## ブラウザ観測の実測値

- scalar「LLM 呼び出し (24h)」= **7**（『取得失敗』でも 0 でもない。シード合計7と一致。48h超過の古い2行は24h窓外で不算入）
- 「直近24時間」LLM 系列合計 = 7 / アップロード系列合計 = 2
- 両 sparkline が SVG (role=img) で描画され aria-label を正しく出し分け:
  - 「LLM 呼び出し数の直近 24 時間の推移」
  - 「アップロード数の直近 24 時間の推移」
- 「直近24時間」セクションは `grid grid-cols-1 gap-4 max-sm:gap-3 md:grid-cols-2`（md以上で2カラム横並び）
- 他 scalar（userCount / storage / uploadsToday）は `—`（null固定、挙動不変, AC-7）

## ブラウザで直接観測できない TC の扱い

TC-3 / TC-4 / TC-6 は UI 上の表示確認では切り分けられない（コード経路・障害注入・スケジューラ発火が必要）ため、plan.md のテスト方針に従いユニット/integration テストで担保:

- **TC-3 Stub 非記録**: previewPrompt / runIngestionJob のユニットテストで、Stub provider 時に recordCall が呼ばれないこと（throw が記録地点より手前で発生し構造的に非記録）を検証。
- **TC-4 partial-failure / best-effort**: usageMetricsProvider が集計クエリ失敗時に当該系列を null degrade（throw しない）こと、recordCall throw が本処理（プレビュー結果・ジョブ遷移）に波及しないことを検証。
- **TC-6 刈り込み**: pruneLlmCallLog の境界テスト（48h cutoff 前後）と runPruneTick の独立 try/catch による failure isolation を検証。

`pnpm test:unit`: 全パス（4074 テスト）。integration テストはコード追加済み（ローカル D1 前提）。
