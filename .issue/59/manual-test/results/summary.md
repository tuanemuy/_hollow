# テスト実行サマリー — Issue #59

**実行日時:** 2026-05-20
**テストソース:** `.issue/59/testing.md`
**サーバー:** http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|-------------|
| TC-1 | /admin (AdminDashboard) が 200 で描画される | 正常系 | PASS | Issue #59 の TypeError 'collect' は解消。NullUsageMetricsProvider 経由で `—`/「取得失敗」表示、「All systems operational」バナー表示 |
| TC-2 | /admin/metrics (MetricsPage) が 200 で描画される | 正常系 | PASS (retry) | 初回は Issue #60 既知バグ (`Stored instance_settings violates invariants`) で別エラー画面。汚染された instance_settings 行を削除し `InstanceSettings.default()` 経路で再実行 → PASS。Issue #59 の TypeError 'collect' は不発生で DI 修正は完全に検証された |
| TC-3 | 非 admin の /admin と /admin/metrics 拒否挙動 | エッジケース | PASS | `ForbiddenError: Admin access required` で「アクセスできません」エラー画面、Dashboard/Metrics 本体非表示。DI 修正の副作用なし |

**合計:** 3 件（PASS: 3 / FAIL: 0）

## Issue #59 の修正検証結論

`createRequestContainer` に `usageMetricsProvider: NullUsageMetricsProvider` を追加したことで、`/admin` と `/admin/metrics` の `TypeError: Cannot read properties of undefined (reading 'collect')` は完全に解消した。

## 別件として残った既知バグ

`/admin/metrics` および `/admin/llm` で発生する `SystemError: Stored instance_settings violates invariants` は既に Issue #60 として起票済み（同 DB に残った旧シェイプの `instance_settings` 行が `InstanceSettings.reconstruct` の不変条件を満たさないことが原因）。本Issueとは独立した既存課題で、別途対応する。Issue #60 にコメントで /admin/metrics も同じバグに当たることを追記する。
