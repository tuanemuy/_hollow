# Plan Review — Issue #747 (Round 1 / アーキテクチャ整合性・実現可能性・リスク)

対象: `.issue/747/plan.md`, `.issue/747/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001]** retention 既定値 7日 の安全性根拠が Cloudflare Queues の実際の保持上限と矛盾している
  - 理由: plan.md「リスクと注意点」と AC-3 は「既定 7日 は Cloudflare Queues の最大メッセージ保持期間・リトライ猶予を十分に超える保守的な値」としているが、Cloudflare Queues の message retention は既定 4日・**最大 14日まで設定可能**。つまり 7日 は「Queues の最大保持期間を超える」値ではない。`max_retries` を消化しきれず Queue に最長 14日 滞留したメッセージが redeliver されたとき、その dedup 記録（`processed_events` 行）を 7日 cutoff で先に消してしまうと、`hasProcessed` が false を返して二重 dispatch 経路に入りうる。本Issue の中核要件（AC-3「冪等化の正しさを壊さない」）に直接抵触する論理的誤り。
  - 提案: (a) 根拠の文言を実際の Queues 仕様に合わせて修正する。具体的には「本プロジェクトの Queue 設定（`wrangler.toml` の `max_retries` / `retry_delay` / `message_retention_period`）から導かれる最大滞留時間」を SSOT として cutoff 下限を導出する。(b) `wrangler.toml` で `message_retention_period` を明示設定していない場合は既定 4日 が効くが、`max_retries` 到達後は DLQ へ送られ Queue から外れるため、実際の「再配信され得る窓」は `message_retention_period`（最大 14日）が上限。retention 既定を 14日 以上（例: 30日）に引き上げるか、少なくとも「なぜ 7日 で安全か」を Queue 設定値に紐づけて再論証すること。二重実行は aggregate 側の `isPending` + OCC で最終防御されるとはいえ、`processed_events` を消すと dedup の第一防御線が消えるので、保守側に倒すべき。`wrangler.toml [env.consumer]` / Queue 定義の `max_retries` と `message_retention_period` を確認した上で値を確定すること。

#### 改善提案（検討推奨）

- **[S-001]** `pruneProcessed` のシグネチャ記述がポート対称性の主張とズレている（戻り値キー名）
  - 理由: ADR-001・plan は「`OutboxRepository.pruneProcessed` と同一シグネチャで対称性を保つ」とするが、`OutboxRepository.pruneProcessed` の戻り値は `{ deleted: number }`、worker ログ規約も `deleted` キー。plan の各所も `{ deleted: number }` で揃っており実体は整合している。ただし `runPruneTick` の戻り値だけ `{ outboxDeleted, processedEventsDeleted }` にリネームするため、「ポート層は `deleted`、worker エントリ集約層で `*Deleted` に名前空間化」という二層の命名規約が混在する。実装時に worker (`pruneProcessedEvents.ts`) が返す `{ deleted }` と handler が集約する `{ processedEventsDeleted }` のマッピングを明示しておくと混乱がない。現状の plan でも追えるが、実装ステップ3 にマッピングの一行を足すと親切。

- **[S-002]** `runPruneTick` 戻り値型変更の波及先がテストに限定される前提を、型レベルで再確認すべき
  - 理由: plan は「`pruner.ts` は戻り値未使用なので無影響」とし、これは正しい（`ctx.waitUntil(runPruneTick(env))` は `Promise<void>` を期待し `Promise<{...}>` を受容できる）。ただし `runPruneTick` を import している箇所が `pruner.ts` と `handlers.integration.test.ts` 以外に無いことの確認が plan に明記されていない。実装前に `grep -rn "runPruneTick"` で参照箇所を網羅し、波及がテストのみであることを確定させるステップを入れると安全（調査では2ファイルのみ確認済みだが、plan に裏付けとして残すとよい）。

- **[S-003]** 初回刈り込みの大量 DELETE リスクへの言及はあるが、`processed_events` 固有の規模差が考慮されていない
  - 理由: plan は「`outboxRepository.pruneProcessed` も同じ単一 DELETE 方式で運用実績あり」としてバッチ分割をスコープ外にしている。これは妥当な判断。ただし Issue 本文が指摘する通り `processed_events` は `user.created` / `ingestion.*` / `note.*` など高頻度イベント**全件**を積むため、`outbox_events`（quarantine 除外・dispatch 済みのみ）より行数オーダーが大きくなりうる。初回 sweep が D1 の単一文 DELETE 制限・実行時間に当たる可能性は `outbox_events` より高い。スコープ外とする判断自体は支持するが、「初回は手動で段階的に流す運用」or「監視して問題が出たら別Issueでバッチ化」のどちらを取るかを docs かリスク節に一行残すと運用引き継ぎが楽。

- **[S-004]** `lt` / drizzle import の追加とテーブル所有境界の整合確認
  - 理由: plan は adapter 実装で `lt` を import するとしているが、現状 `idempotencyStore.ts` は `eq` のみ import。`outboxRepository.pruneProcessed` は `lt` に加え `and` / `isNotNull` も使う。`processed_events` には quarantine 列が無いため `and` / `isNotNull` 不要で `lt` 単体という plan の判断は schema（`processed_events` は `id` PK + `processed_at` notnull の2列のみ）と一致しており正しい。問題なし。確認済みである旨を明記したのみ。

#### 良い点

- **ポート配置の判断が既存パターンと完全に対称（ADR-001）。** `processed_events` を読み書きする唯一の経路が `IdempotencyStore` であり、`outbox_events` 側で既に「テーブル所有ポートが自テーブルの GC 能力（`pruneProcessed`）を持つ」確立パターンがある。新ポート新設や `OutboxRepository` 相乗りを退けた理由（DI 配線増・所有境界跨ぎ）が的確で、CLAUDE.md の「ドメイン/アプリのポート越しにクロスカッティング関心を扱う」原則に沿う。`WorkerContainer` が既に `idempotencyStore` を保持している（types.ts L241 で確認）ため DI 配線追加不要という指摘も正確。

- **ドメイン層への影響なしの判断が正しい。** `processed_events` の刈り込みは時間ベース GC でドメイン不変条件を持たないインフラ的記録という整理は妥当。worker を「cutoff 計算 + ログ」の薄いオーケストレータに留め、ドメインロジック漏出を避ける方針が CLAUDE.md のレイヤー規約に合致。

- **実装ステップが依存方向（内→外）に並んでいる。** ポート/worker（application）→ adapter（実装）→ worker エントリ配線（presentation/worker）→ 設定/docs の順序で、依存方向と整合。`outboxPrune.ts` / `outboxRepository.pruneProcessed` を手本にする方針は既存コードと一字一句揃えやすく実現性が高い。

- **retention を `outbox_events` と独立させる判断（ADR-002）が意味論的に正しい。** 「監査用の outbox 保持」と「冪等化のための dedup 保持」は本質的に別物で、Queue リトライ設定や監査要件が片方だけ変わりうる。既定値を揃えつつ定義を分離するトレードオフ整理は適切。env var 配線（`TuningEnv` / `pruneTuningSchema` / `readPruneTuning` / `ServerEnv` / `wrangler.toml`）の追記箇所が漏れなく列挙されており、調査でも全箇所の現状を確認した（`env.ts` L14-21/29-35/62-66、`serverCloudflare.ts` L296/L314）。

- **スコープ管理が適切。** スキーマ変更なし（`processed_events.processed_at` は既存・notnull で削除条件に十分）、新 cron 追加なし（既存 pruner daily tick 相乗り）、quarantine 除外条件不要（成功 dispatch 後のみ書かれる）という線引きが Issue 範囲と一致し、理想形の追求にも過小実装にも振れていない。stamp ordering（`markProcessed` は dispatch 成功直後 = ack 直前）の理解も handlers.ts のコメント（L117-142）と整合。

- **テスト方針が3層に分かれ AC を網羅。** unit（cutoff 計算・件数転送・ログ・0件）/ adapter integration（境界での削除・保持）/ handler integration（両テーブル刈り込み + 既存 outbox テストの `outboxDeleted` 更新）。既存 `handlers.integration.test.ts` の pruner ブロック（L256-295）が `result.deleted` を参照しているため戻り値型変更で更新が必要、という波及を正しく捕捉している。
