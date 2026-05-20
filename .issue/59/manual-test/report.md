# Manual Test Report — Issue #59

**実行日時:** 2026-05-20
**テストソース:** `.issue/59/testing.md`
**サーバー:** http://localhost:3000
**Issue:** [#59 /admin Dashboard と /admin/metrics が "Cannot read properties of undefined (reading 'collect')" で 500](https://github.com/tuanemuy/hollow/issues/59)

## 修正内容（被検証物）

`app/core/application/di/serverCloudflare.ts` の `createRequestContainer` に `usageMetricsProvider: NullUsageMetricsProvider` を配線（+ 対応 import を追加）。

これにより、`getUsageMetrics` usecase が `container.usageMetricsProvider.collect()` を呼んだ際に発生していた `TypeError: Cannot read properties of undefined (reading 'collect')` が解消する。

## テスト結果

| TC | テスト名 | 結果 | 詳細リンク |
|----|---------|------|-----------|
| TC-1 | /admin (AdminDashboard) が 200 で描画される | PASS | [TC-1.md](results/TC-1.md) |
| TC-2 | /admin/metrics (MetricsPage) が 200 で描画される | PASS (retry) | [TC-2.md](results/TC-2.md) / [TC-2-retry.md](results/TC-2-retry.md) |
| TC-3 | 非 admin の /admin と /admin/metrics 拒否挙動 | PASS | [TC-3.md](results/TC-3.md) |

**合計:** 3 件（PASS: 3 / FAIL: 0）

## 主要観測

- `/admin` でメトリクスカード4種が `—` / 「取得失敗」表示で正しく描画される。NullUsageMetricsProvider が全フィールド `null` を返す仕様どおり。
- `/admin/metrics` で「現在の利用量」4カード（`—`）と「インスタンス上限」`LimitsCard` テーブル（マテリアライズ済みデフォルト値）と「登録ポリシー」が正しく描画される。
- 非 admin アクセスは `ForbiddenError` で「アクセスできません」エラー画面を表示。Dashboard/Metrics 本体は非表示。DI 修正は認可経路に副作用を与えていない。

## 既知の別件バグ（Issue #59 範囲外）

- **Issue #60**: `/admin/llm` および `/admin/metrics` で `SystemError: Stored instance_settings violates invariants` が発生する。原因は DB 上の `instance_settings` 行のシェイプ（`limits_json` のキー名等）が現行ドメイン `InstanceSettings.reconstruct` の不変条件と整合していないこと。本Issueとは独立した seed/migration 由来の課題で、Issue #60 で別途対応する。
- TC-2 retry を成立させるため、検証用に DB の `instance_settings` 行を削除し `InstanceSettings.default()` 経路で再起動した。これはテスト環境のクリーンアップであって本番修正ではない。
- Issue #60 にコメントで「/admin/metrics も同じバグに当たる」ことを追記する（Phase 4 で実施）。

## 成果物

- レポート: `.issue/59/manual-test/report.md`
- テスト結果: `.issue/59/manual-test/results/`
- スクリーンショット: `.issue/59/manual-test/screenshots/`
- シードデータ記録: `.issue/59/manual-test/seed-data.md`
- サーバ情報: `.issue/59/manual-test/server-info.md`

## 結論

Issue #59 の修正対象である `TypeError: Cannot read properties of undefined (reading 'collect')` は `/admin` および `/admin/metrics` の両方で解消が確認された。Issue #59 はクローズ可能。`/admin/metrics` および `/admin/llm` で別途発生する `instance_settings` invariants バグは Issue #60 でトラッキング。
