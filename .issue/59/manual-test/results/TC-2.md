# TC-2: /admin/metrics (MetricsPage) が 200 で描画される

**結果**: FAIL
**セッション**: verify-tc-2

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` を開く | ログインフォーム表示 | メール `[ref=e5]` / パスワード `[ref=e7]` / ログインボタン `[ref=e9]` 取得 | PASS |
| 2 | admin@example.com / Password123! でログイン | 認証成功 | fill → fill → click 成功、`wait --load networkidle` 到達 | PASS |
| 3 | `/admin/metrics` を直接開く | URL = `/admin/metrics` で 200 描画 | URL は `http://localhost:3000/admin/metrics` のままだが、`<MetricsPage>` が CatchBoundary に落下 | FAIL |
| 4 | `wait --load networkidle` | アイドル到達 | ✓ Done | PASS |
| 5 | snapshot で要素確認 | 「利用状況」見出し / 4 カード / LimitsCard / 登録ポリシー | エラーページ表示。`heading "アクセスできません" [level=1]` / `paragraph "エラーが発生しました"` / `link "ホームへ戻る"` のみ | FAIL |
| 6 | screenshot 保存 | 保存成功 | `.issue/59/manual-test/screenshots/tc-2/metrics.png` に保存 | PASS |
| 7 | エラー検査 (console) | TypeError / 500 系がない | サーバー由来の `SystemError: Stored instance_settings violates invariants` を `<MetricsPage>` 内で検出（4 回連続発生）。CatchBoundaryImpl にフォールバック | FAIL |
| 8 | セッションクローズ | 成功 | ✓ Browser closed | PASS |

### snapshot 要点

メトリクスページではなく汎用エラー画面に置換されている:

- `heading "アクセスできません" [level=1]`
- `paragraph "エラーが発生しました"`
- `link "ホームへ戻る"`
- `banner` には `link "Hollow"` と `StaticText "管理者モード"`

期待していた以下の要素はいずれも snapshot に存在しない:

- 「利用状況」見出し
- 「インスタンス全体の利用量と、設定済みの上限値。」サブテキスト
- 「現在の利用量」セクションのカード4種（ユーザー数 / 合計ストレージ / 本日アップロード / LLM 呼び出し (24h)）
- 「インスタンス上限」セクションの `LimitsCard` テーブル
- 「登録ポリシー」セクションの「公開中」/「停止中」バッジ

### console エラー（抜粋）

```
[error] Route error: {
  name: "SystemError",
  environmentName: "Server",
  digest: "",
  message: "Stored instance_settings violates invariants",
  stack: "SystemError: Stored instance_settings violates inv…server-dom_client__browser.js?v=e808816b:2202:18)"
}
The above error occurred in the <MetricsPage> component.
React will try to recreate this component tree from scratch
using the error boundary you provided, CatchBoundaryImpl.

[warning] Warning: Error in route match: /admin/admin
```

同一の Route error が 4 回出力された後、CatchBoundary に切り替わっている。

## スクリーンショット

- `.issue/59/manual-test/screenshots/tc-2/metrics.png`

## 失敗詳細

- URL は `/admin/metrics` に到達しているが、サーバーサイドで `SystemError: Stored instance_settings violates invariants` がスローされ、`<MetricsPage>` がアンマウントして `CatchBoundaryImpl` の「アクセスできません」表示にフォールバックしている。
- ステータスコードは確認していないが、UI 上は完全にエラー画面（メトリクスの 1 つも描画されない）。
- TC-2 の合格条件「メトリクスカード4種が `—` で描画 / LimitsCard に数値 / 登録ポリシーのバッジ / 重大エラー無」のうち、最後の「重大エラー無」を満たさず、その結果として描画系の確認項目もすべて満たせない。

## 原因仮説

- メトリクスページの loader / server-fn が `instance_settings` を読み出し、`InstanceSettings` 値オブジェクト（あるいは関連 VO）の不変条件チェックで `BusinessRuleError` / `SystemError` を投げている。"Stored ... violates invariants" 文言から、**DB に永続化された `instance_settings` レコードが現行スキーマの不変条件を満たさない** 状態（例: 必須カラムの NULL / 不正な enum / シードと VO 仕様のズレ）が疑わしい。
- Issue #59 の対象だった「DI 不備による TypeError」は出ていないので、DI 修正自体は奏功している可能性がある。一方でメトリクスページが依存する instance_settings のシード or マイグレーションが、VO 側の不変条件と整合していない。
- 直近の `2462cfd fix(seed): align saved_views query_json/sort_json with ViewQuery (Issue #52)` のように、seed と VO のズレを別箇所で直した経緯があるため、`instance_settings` 周りでも同種のシード整合性問題が残っている可能性が高い。
- 次アクション候補: (1) `app/core/domain/.../instanceSettings` の不変条件と現行 seed/migration を突き合わせる、(2) `Stored instance_settings violates invariants` を grep して投げ元を特定、(3) DB の `instance_settings` 行を実際にダンプして VO に通してみる。

## 補足

- TC-1 と同様に手順書記載のログイン URL は `/login` を使用（`/auth/log-in` は 404）。
- DI 由来の `Cannot read properties of undefined` / `TypeError` は今回 console に出ていない（Issue #59 の本来の症状とは別種のエラーで落ちている）。
