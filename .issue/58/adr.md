# ADR — Issue #58: P46 自動パージジョブの失敗アラート（H4 異常系）

## ADR-001: 自動パージ失敗はログで可視化し、アプリ内の履歴永続化・即時アラートは行わない

### Status
Accepted

### Context
spec `scenario/trash.md` H4 異常系は「自動パージジョブの失敗: 管理者画面にアラートを表示」を要求していたが、これは実行履歴のアプリ内永続化を前提とする。一方コードベースには:

- `purgeOrphans` / `purgeTrashOlderThan` / `purgeExpiredExports` は cron 駆動で件数を返すのみ
- 実行結果を永続化するテーブル（D1 / KV）が無い
- 取得用ポート（`JobMonitorProvider` 相当）も無い（`.issue/3` で YAGNI として意図的に見送り済み）

Issue #3（P46 監視画面）は ADR-003 でこのセクションを説明文表示に留め、H4 異常系を残課題として本 Issue #58 に切り出していた。

選択肢:
1. 実行履歴テーブル / KV を新設し、`JobMonitorProvider` 経由で `/admin/jobs` に最新結果・失敗を表示する
2. 失敗を実行ログ（Cloudflare Workers ログ / Logpush / tail）で可視化し、アプリ内の永続化・画面アラートは行わない
3. 失敗時に Outbox event を発行し、能動的な ops 通知（メール / Slack）へ流す

### Decision
選択肢 2。パージは best-effort な GC であり、その実行結果は業務データではなく運用テレメトリ。どのアグリゲートにも属さない履歴テーブルを新設し、pruner 自身がそれを prune する構図は過剰（YAGNI）。失敗可視化は Cloudflare の実行ログで満たす方針とし、spec を実態に合わせて修正する。

能動的な push 通知（メール / Slack / Webhook）は purge に限らずジョブ全般に共通する横断課題のため、別 Issue #848 に分離する。

### Consequences
- 良い点:
  - スキーマ追加ゼロ。pruner の GC 責務と矛盾しない
  - `runPruneTick` は既に各失敗を `logger.error("[prune] ... failed")` に出しており、追加実装なしで方針が成立
  - spec と実装の乖離（spec-sync）が解消する
- トレードオフ:
  - 失敗検知はログを見に行く pull 型で、運用者への push はできない → #848 で補完
  - `/admin/jobs` のクリーンアップセクションは説明文どまりのまま（最終実行時刻・件数・失敗は非表示）

### 影響を反映した成果物
- `spec/scenario/trash.md` H4 異常系
- `spec/pages/index.md` P46 補足
- `spec/manual-tests/trash.md` TC-H4-02
- `spec/design/pages/P46-admin-jobs.html` / `spec/design/pages/mobile/P46-admin-jobs.html`
- `app/components/admin/Jobs/index.tsx` `CleanupSection`
