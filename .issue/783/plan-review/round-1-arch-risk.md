# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク

対象: `.issue/783/plan.md` / `.issue/783/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## 総評

計画は既存の確立された prune パターン（outbox / processed-events / activity-log / llm-call-log）に正しく整合しており、レイヤーの内側（ポート定義）から外側（D1 アダプタ・DI 配線・worker entry）へ依存方向順で組まれている。ADR-001（専用ポート）/ ADR-002（1ポート2メソッド）は既存前例（`LlmCallLogRecorder.pruneOlderThan` / `ActivityLogRepository` の 2テーブル prune）と完全一致しており妥当。技術前提（ISO8601 text の lexicographic 比較、`returning({id})` での件数化、`mapDbError` ラップ、`constructor(db)` のみのアダプタ）はすべて既存実装で実証済みで、実現可能性は高い。

調査で確認した実証事実:
- `exportJobRepository.ts:242` / `tagMergeJobRepository.ts:126` ともに `updatedAt: job.updatedAt.toISOString()` で UTC ISO8601 text 保存 → `lt(updatedAt, cutoff.toISOString())` の比較は正しく時刻順になる（`findExpired` が既に `lt(expiresAt, cutoff)` で同パターンを実証）。
- `createWorkerContainer` は `serverCloudflare.ts:1224` の1箇所のみ。DI 追加先は1箇所で済む。
- `ConsumerContainer` は `Pick<WorkerContainer, "outboxRepository"|"idempotencyStore"|"indexJobRepository">` なので `jobStatePruner` は波及しない（`createConsumerContainer` 改修不要）。計画の依存関係分析は正しい。

ただし ADR-003 の中心的前提に1点、事実誤認に近い穴がある（下記 P-001）。

#### 問題点（要修正）

- **[P-001]** ADR-003 の「`expired` 行は artifact 削除済みだから prune して安全」という前提が、既存 `purgeExpiredExports` の実装では保証されていない。
  - 理由: `purgeExpiredExports.ts:46` で `completed→expired` の DB 遷移を **先にコミット**し、その**後**に `objectStorage.delete(artifactKey)` を best-effort（`try/catch` で warn 握りつぶし、`:52-59`）で実行する。R2 削除が失敗しても行は `expired` のまま確定する。さらに `findExpired` は `status=completed` の行しか拾わない（`:355`）ため、一度 `expired` になった行の R2 削除は**二度と再試行されない**。つまり「`expired` ⇒ artifact 削除済み」は成立せず、R2 削除に失敗した `expired` 行が存在しうる。本 prune がその行を retention 経過後に削除すると、Issue AC が明示的に禁じる「まだ削除されていない artifact の orphan 化」を確定させてしまう（行が消えることで orphan の存在を辿る手段も失われる）。ADR-003 の Consequences は「ライブ artifact の orphan 化を構造的に排除」と述べるが、これは `completed` 除外については正しい一方、`expired` 経路の残存リスクを見落としている。
  - 提案: 次のいずれか。(a) ADR-003 の前提を訂正し「`expired` 行の prune は purge の R2 削除が成功した前提に依存する。R2 削除失敗時の orphan は purge 側の best-effort 弱点であり本 prune の責務外」と明記したうえで、`expired` を対象に含める判断は維持する（恒久蓄積防止という Issue 目的を満たすには `expired` 削除が必要なため、対象に残すこと自体は正しい）。(b) 加えてリスクセクションに、計画が現状 `completed` 経路の健全性しか触れていない点を補い、「`expired` + R2削除失敗」のエッジを明示する。実装変更（purge の順序入れ替え等）は本 Issue スコープ外で良いが、ADR の事実記述は訂正すべき。少なくとも前提の穴を silently 仮定したまま残さないこと。

#### 改善提案（検討推奨）

- **[S-001]** `WorkerContainer` 必須フィールド追加の波及先として、計画ステップ9が名指しするのは `pruneProcessedEvents.test.ts の makeContainer 等` のみだが、実際に **実 `WorkerContainer` を構築する共有 integration ヘルパー2本**が最重要の更新対象になる。
  - 理由: `app/core/application/__tests__/helpers.ts:169` と `app/core/adapters/d1/__tests__/helpers.ts:154` がいずれも `new D1LlmCallLogRecorder(db)` 等で実コンテナを組み立てており（`WorkerContainer & {...}` で型付け）、ここに `jobStatePruner: new D1JobStatePruner(db)` を追加しないと多数の integration テストがコンパイルエラーになる。これらは型付きなので `pnpm typecheck` で必ず検出されるが、計画の「等」に埋もれると見落とされやすい。逆に `pruneLlmCallLog.test.ts:39` は `as unknown as WorkerContainer` キャストのため型エラーは出ず追加不要（ただし観測されないので害もない）。ステップ9にこの2ヘルパーを明示的に列挙しておくと漏れがない。

- **[S-002]** `runPruneTick.test.ts` の `readPruneTuning` モック（`:37-41`）は現状 `retentionMs` / `processedEventsRetentionMs` の2フィールドしか返さない。新 prune を配線するなら、このモックにも `exportJobsRetentionMs` / `tagMergeJobsRetentionMs` を追加するのが忠実。
  - 理由: 新 prune 関数自体はモックされるため undefined retention でも実害はないが、`runPruneTick` が `tuning.exportJobsRetentionMs` を読んでモック関数へ渡す経路の fidelity を保つため。計画ステップ9は「mock 一覧に2関数を追加」とだけ記すので、`readPruneTuning` モックの拡張も明記しておくと安全。

- **[S-003]** アダプタの DELETE は `idx_*_updated_at`（`(desc(updatedAt), desc(id))`）が `updated_at < cutoff` のレンジ境界を支えるが、`status IN (...)` は索引に含まれないためレンジscan後の per-row フィルタになる点を正確に把握しておくとよい。
  - 理由: 計画の「`idx_*_updated_at` が述語の sort/scan を支える」は概ね正しいが、status 絞り込みは索引外。終端行は全体の一部なので「retention を過ぎた行」をレンジscanしてから status を弾く形になる。想定データ量では性能問題なく、相関の DESC 索引でも `<` レンジscanは機能する（SQLite は両方向scan可）。正確性・性能ともに問題ないが、認識として明記しておくと将来の索引議論で混乱しない。

#### 良い点

- ADR-001 の専用ポート判断が、`WorkerContainer` が UoW / `PendingBatch` を持たない前提（`di/types.ts:303` のコメントで明示）と既存 prune ポート群の設計に厳密に一致しており、ドメイン集約リポジトリ（OCC/UoW）を汚さない選択が正しい。
- 実装ステップが依存方向順（ポート → container 型 → usecase → アダプタ → tuning → 配線 → DI → doc）で、内側から外側へ正しく並んでいる。「ドメインモデルへの影響なし（非トランザクショナルな行 GC）」の判断も妥当で、Issue 範囲を超えてドメインに手を入れていない。
- ADR-003 の `export.completed` 除外は、`export/entity.ts` の不変条件（`completed` は `artifactKey: string` のライブ R2 を保持）に正しく基づき、artifact orphan を構造的に防ぐ最重要の判断。tag_merge は artifact を持たないので `completed` を対象に含める非対称も正しい。
- AC とステップのトレーサビリティ表、リスクの「非終端不可侵」「`updated_at` text 比較依存」の明示、integration テストで「古い completed/pending/processing が保持される」を固定する方針が、本変更で壊しやすい不変条件をピンポイントで押さえている。
- env var をテーブルごとに独立（ADR-004）させ `DEFAULT_*_RETENTION_MS` フォールバック + `wrangler.toml` コメント宣言という既存規約への一致もハードコード禁止原則に沿う。
