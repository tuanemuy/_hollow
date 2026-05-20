# TC-2 (retry): /admin/metrics (MetricsPage) が 200 で描画される

**結果**: PASS
**セッション**: verify-tc-2-retry

## 前提

- 前回 TC-2 は `Stored instance_settings violates invariants`（Issue #60 既知）で FAIL。
- 今回は事前に DB の `instance_settings` 行を削除し、`InstanceSettings.default()` を materialize させた状態で再実行。
  - 確認: `sqlite3 .wrangler/.../*.sqlite "SELECT COUNT(*) FROM instance_settings;"` → `0`
- Issue #59 の DI 修正（`createRequestContainer` に `usageMetricsProvider: NullUsageMetricsProvider` を追加）の検証ポイントは "Cannot read properties of undefined (reading 'collect')" が出ないこと。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` を開く | ログインフォーム表示 | ref=e5 (email) / e7 (password) / e9 (button) 取得 | PASS |
| 2 | admin@example.com / Password123! でログイン | 認証成功 | fill → fill → click 成功、`wait --load networkidle` 到達、URL=`/?page=1&limit=20` | PASS |
| 3 | `/admin/metrics` を直接開く | URL=`/admin/metrics` で 200 描画 | URL=`http://localhost:3000/admin/metrics`、`<MetricsPage>` 正常描画 | PASS |
| 4 | `wait --load networkidle` | アイドル到達 | ✓ Done | PASS |
| 5 | snapshot で要素確認 | 「利用状況」見出し / 4 カード / LimitsCard / 登録ポリシー | すべて描画。詳細は下記 | PASS |
| 6 | screenshot 保存 | 保存成功 | `.issue/59/manual-test/screenshots/tc-2/metrics-retry.png` | PASS |
| 7 | console エラー検査 | TypeError / 500 系 / "collect" / "invariants" 無 | error フィルタは Vite/React DevTools の info のみ。"collect" / "invariants" / "Cannot read" のヒット 0 件 | PASS |
| 8 | セッションクローズ | 成功 | ✓ Browser closed | PASS |

## snapshot 要点

期待要素はすべて存在:

- `heading "利用状況" [level=1]`
- `paragraph "インスタンス全体の利用量と、設定済みの上限値。"`
- `region "現在の利用量"` 配下に 4 カード:
  - `ユーザー数 / —`
  - `合計ストレージ / —`（`R2 — / DO—` の補足表示あり）
  - `本日アップロード / —`
  - `LLM 呼び出し (24h) / —`
- `heading "インスタンス上限" [level=2]` 配下の LimitsCard テーブルが値で埋まる:

| 項目 | 値 |
|---|---|
| 1 日あたりアップロード上限 | 1.0 GB |
| 1 取り込み最大サイズ | 32.0 MB |
| 1 ノート最大サイズ | 1.0 MB |
| エクスポート成果物上限 | 256 MB |
| ノートあたり共有リンク上限 | 16 件 |
| 編集ロック TTL | 300 秒 |
| ゴミ箱保持日数 | 30 日 |

- `heading "登録ポリシー" [level=2]` 配下に `公開中` バッジが表示。`/admin/registration` への案内文も描画。

CatchBoundary（「アクセスできません」「エラーが発生しました」）は今回 snapshot に存在しない。

## console

- `error` フィルタで返るのは `[vite] connecting...` / `[vite] connected.` / React DevTools 案内（いずれも `[debug]` / `[info]` レベル。`error` キーワード一致のみ）。
- 全 console から `error|warn|collect|invariants|cannot read` を grep してヒット 0。
- 特に Issue #59 で問題化していた `TypeError: Cannot read properties of undefined (reading 'collect')` は今回未発生 → DI 修正が機能していると判定。
- 前回出ていた `SystemError: Stored instance_settings violates invariants` も今回未発生（DB クリアにより `InstanceSettings.default()` が materialize されたため）。

## スクリーンショット

- `.issue/59/manual-test/screenshots/tc-2/metrics-retry.png`

## 結論

- TC-2 の合格条件すべて満たし PASS。
- Issue #59 の DI 修正（`usageMetricsProvider: NullUsageMetricsProvider`）は MetricsPage の SSR 経路で意図通り作用しており、`UsageMetricsProvider.collect()` 呼び出しが TypeError を起こさない。
- 別件で観測されていた `instance_settings violates invariants`（Issue #60）は本テストでは DB クリアにより回避。根本対処は Issue #60 側で別途必要。
