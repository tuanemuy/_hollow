# Plan Review — Issue #748（Round 1 / アーキテクチャ整合性・実現可能性・リスク）

レビュアー視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/748/plan.md` / `.issue/748/adr.md`
日付: 2026-06-18

実コードで検証した主要ファイル:
- `app/core/application/ingestion/previewPrompt.ts`（request 路・UoW 無し・`ownerId` 在）
- `app/core/application/ingestion/runIngestionJob.ts`（`runPipeline` は free function、`container` を受けない）
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts` / `activityLogRepository.ts`
- `app/core/adapters/d1/schema.ts`（`ingestion_burst_log` / `activity_log`）
- `app/core/application/di/serverCloudflare.ts`（`buildLlmProvider` / `resolveConsumerLlmConfig` / 各 container）
- `app/core/application/di/types.ts`（`RequestContainer` / `WorkerContainer` / `ConsumerContainer`）
- `app/core/application/workers/pruneActivityLog.ts` / `app/worker/cloudflare/handlers.ts`（`runPruneTick`）
- `app/components/admin/Dashboard/index.tsx` / `getUsageMetrics.ts` / `.issue/595/adr.md` ADR-002

総評: 全体方針（call-log read-model + 直接ポート記録 + usageMetricsProvider 拡張 + pruner daily tick）は #595 で確立したパターンと整合し、ヘキサゴナル/DDD の依存方向にも沿っている。ADR-002（直接ポート vs domain event）の判断は実コードで裏付けが取れた（後述）。ただし**実装地点の現実とプランの記述に乖離が複数あり**、特に consumer 路（runIngestionJob）の記録フック地点はプランが想定するほど単純ではない。下記 P-001〜P-004 を要修正とする。

---

#### 問題点（要修正）

- **[P-001]** consumer 路の記録フック地点（`runPipeline` 内の LLM 呼び出し直後）に recorder/provider/owner が届かない — プランの実装ステップ 7 が現状の関数構造と噛み合っていない
  - 理由: プランは「`structureToHtml` / `suggestMetadata` 呼び出し直後に `recordCall(...)` を best-effort」「`ownerId` は `runPipeline` で在」「`occurredAt` は `clock.now()`」と書く（plan.md L110-112）。だが実コードの `runPipeline` は **free function（`PipelineDeps` のみを受け取り、`container` も `clock` も `llmCallLogRecorder` も持たない）**（`runIngestionJob.ts` L273-）。`ownerId` は `deps.ownerId` で在るが、recorder / clock / provider 名は `PipelineDeps` に存在しない。さらに LLM 呼び出しは 2 箇所（`deps.llm.structureToHtml` L346、`deps.llm.suggestMetadata` L370）あり、両方とも `runPipeline` の try ブロック外（呼び出し元 `runIngestionJob` の L123-141 の try 内）で実行される。「呼び出し直後」に書こうとすると `runPipeline` のシグネチャ変更（`recorder` / `clock` / `provider` を `PipelineDeps` に追加）か、記録を `runPipeline` の外（`runPipeline` 成功後・preview 受領後に 1 回）に出す設計判断が要る。
  - 提案: ステップ 7 を「`runPipeline` の引数に `llmCallLogRecorder` / `clock` / `provider` を渡し、各 `deps.llm.*` 直後に記録する」か、「`runPipeline` 成功後（`runIngestionJob` 側）に 1 回記録する」のどちらかに**確定**する。後者なら 1 ジョブ 1 行になり「呼び出し回数」と乖離（structure と metadata で 2 回 LLM を叩くため）。AC-1 の「1 呼び出し 1 行」を厳密に満たすなら前者（2 回記録）が必要。どちらを採るか・1 行の意味（呼び出し回数 vs ジョブ回数）を ADR/plan に明記すること。なお `html`/`markdown` 分岐は `structureToHtml` を呼ばない（`suggestMetadata` のみ）ので、呼び出し直後記録なら分岐ごとの呼び出し有無を正しく辿る必要がある。

- **[P-002]** provider 名を usecase まで引き回す配線が「実装時に確定」のまま残され、request 路では現実的に取得困難
  - 理由: `buildLlmProvider`（`serverCloudflare.ts` L578-591）は `LLMProvider` インスタンスのみを返し、**解決した provider 名（文字列）を一切外に出さない**。request container では env の `adminLlmProvider`（undefined の可能性あり）が `buildLlmProvider` に渡されるが、`adminLlmApiKey`/`adminLlmModel` が無い場合は `provider` を無視して `StubLLMProvider` が返る（L584）。つまり「container に載っている `llmProvider` の実 provider 名」は env 変数からは確定できない（Stub のときは "anthropic" でも何でもない）。consumer 路は `resolved.provider`（`resolveConsumerLlmConfig` 由来）が `createConsumerContainer` 内に在るが、これも `null` 解決時は Stub にフォールバックし request 側 env 値が使われる（L932-934 のスプレッド継承）。プランはこの複雑さを「最小変更で実装時に確定」と先送りしているが、ADR-002 の核心（「呼び出しに使った実 provider を記録」）が成立するかは配線次第で、計画段階で方式を 1 つに決めないと AC-1 の provider 列の正確性が担保できない。
  - 提案: 「container に `llmProviderName: LLMProvider | "stub"` を載せ、`buildLlmProvider` がインスタンスと名前のペアを返す（または名前を別途算出する小関数を追加）」など、**provider 名の単一の真実源を決める**。Stub のときの扱い（P-003 と連動）も同時に決める。request/consumer で名前の解決経路が違う（env var vs resolved config）点を ADR-002 に追記すること。

- **[P-003]** Stub（LLM 未設定）時の記録方針が「要検討/推奨」のままで未確定 — 虚偽表示禁止に直結する判断を計画で確定すべき
  - 理由: plan.md L150 / ADR にも「StubLLMProvider の呼び出しは実 LLM 呼び出しではないため記録すべきか要検討（推奨: stub 時は記録しない、または provider='stub' を除外集計）」とある。だが request 路の `previewPrompt` では Stub は `unsupported_format` を投げて catch される（`previewPrompt.ts` L172-180 → `LLMPreviewUnavailable`）ため、そもそも成功路に到達せず記録されない（=自然に記録されない、整合）。一方 consumer 路 `runPipeline` でも Stub の `structureToHtml`/`suggestMetadata` がどう振る舞うか（throw か否か）で挙動が変わる。記録地点が「呼び出し直後（成功時）」なら Stub が throw する限り記録されないが、これは実装地点（P-001）と密結合。`llmCallsToday`（scalar）/系列が「実 LLM 呼び出し回数」を表すのか「成功した呼び出し回数」を表すのか、Stub を含むのかを**計画段階で定義**しないと、ダッシュボードの数値の意味が曖昧になる（虚偽表示禁止の観点で重要）。
  - 提案: 「記録するのは LLM 呼び出しが成功した場合のみ・Stub/未設定は記録しない」を方針として確定し、カードのラベル意味（「回 / 24h」が指す対象）を ADR に明記する。失敗時に記録しない（=成功カウント）なら ADR-002 の「実際の LLM 呼び出しを記録」の文言を「成功した実 LLM 呼び出し」に精緻化すること。

- **[P-004]** 「`ingestion_burst_log` が UTC substr bucket」という調査記述が誤り — `occurred_at` は `timestamp_ms`（integer）で substr 不可
  - 理由: plan.md L43 / L46 は先例として「`ingestion_burst_log`（自然キー insert + read-time 集約 + UTC substr bucket）」と書くが、実スキーマでは `ingestion_burst_log.occurred_at` は `integer(... { mode: "timestamp_ms" })`（`schema.ts` L857）で、**substr で bucket 化していない**。`hour_bucket` は別途 text カラムで保持し（L856）、read-time 集約は `occurred_at`（ms）に対する two-pointer sliding window（`activityLogRepository.ts` L219-257）で行っている。「UTC substr bucket」は `uploadsHourly` が引く **`ingestion_jobs.created_at`（ISO8601 text）**のみの特性（`usageMetricsProvider.ts` L72）。つまり「`ingestion_burst_log` と同型にすれば substr bucket が使える」は成立しない。plan.md L149 のリスク欄では「`occurred_at` を ts_ms にすると substr が使えない／ISO text で持つか実装時に確定」と正しく書けているので、**調査結果と設計の記述が内部で矛盾している**。
  - 提案: 設計（`schema.ts` 定義 L63、`collectLlmCallsHourly`）で `llm_call_log` の bucket 用カラムを 1 方式に確定する。選択肢は (a) `occurred_at` を ISO8601 text にして `uploadsHourly` と同じ `substr(...,1,13)` を再利用（時系列実装が最も流用しやすい）、(b) `ingestion_burst_log` 同様 ts_ms + 別 `hour_bucket` text、(c) ts_ms 単独 + `strftime('%Y-%m-%dT%H', occurred_at/1000, 'unixepoch')`。`uploadsHourly` のコードを最大限再利用し「両系列で bucket 境界が一致」（テスト方針 L159）を最も簡潔に満たすのは (a)。調査結果 L43/L46 の「同型・UTC substr」記述を実態に合わせて訂正すること。

---

#### 改善提案（検討推奨）

- **[S-001]** read 系ポート（`countSince` / `countHourlySince`）の所在を確定し、二重定義を避ける
  - 理由: plan.md L57 / ADR-003 L79 は「provider が直接 db を引くので read メソッドは不要にもできる」と両論併記のまま。`D1UsageMetricsProvider` は constructor で `db` を直接持つ（`usageMetricsProvider.ts` L37-41）ので、`collectUploadsHourly` と同じく provider 内で直接 drizzle クエリを書くのが既存パターンに最も忠実。`LlmCallLogRecorder` ポートは write（`recordCall`）+ prune（`pruneOlderThan`）の最小に絞り、read は provider 内に閉じる、と確定すれば責務が綺麗に分かれる（recorder=write/prune、provider=read）。両方に read を生やすと同じ集計が 2 箇所に出て乖離リスク。

- **[S-002]** `eventId` の必要性を再検討（unique 制約の費用対効果）
  - 理由: ADR-002 L59/L64 自身が「再配信窓が無い同期記録なので二重行リスクは元々低い」「unique 制約は余剰だが無害」と認めている。`ingestion_burst_log` との「スキーマ対称性」が唯一の理由。`idGenerator.next()` を `id` と `eventId` の両方に同値で入れるだけなら無害だが、unique index 1 本ぶんの書き込みコストと「同期記録に冪等キーがある」という誤読リスクがある。残すなら JSDoc に「同期 best-effort 記録なので冪等は不要、スキーマ対称性のためだけの余剰制約」と明記し、将来の読み手が「再配信冪等のため」と誤解しないようにすること（消すのも一案だが、対称性維持なら残置で可）。

- **[S-003]** pruner 配線は `pruneActivityLog` への相乗りと新規 `pruneLlmCallLog` のどちらかを確定
  - 理由: plan.md L124-125 が「`pruneActivityLog.ts`（または新規 `pruneLlmCallLog.ts`）」と両論併記。`runPruneTick`（`handlers.ts` L104-110）は `pruneActivityLog` を 1 つの try/catch で包んでいる。`llm_call_log` の prune を `pruneActivityLog` 内に足すと、activity prune の失敗と LLM prune の失敗が同じ catch で握り潰され、片方の失敗がもう片方をスキップさせ得る（`pruneActivityLog` L36-39 は逐次 await で、前段が throw すると後段に到達しない）。LLM prune を独立 try/catch にしたいなら `runPruneTick` に別ブロックで足す方が tolerance が綺麗。どちらでも AC-6 は満たすが、failure isolation の観点で「`runPruneTick` に独立ブロック追加」を推奨。retention 定数の所在（`activityLog/types.ts` か新 `llmCallLog/types.ts` か）も合わせて確定すること。

- **[S-004]** DI: `usageMetricsProvider` は `createRequestContainer` でのみ生成され consumer は spread 継承する（types.ts L249 は RequestContainer 側）。LLM 系列の read は request 路でしか使われないので、recorder（write）と provider（read）の container 配置を明示
  - 理由: plan.md L67 / L131 は「recorder を RequestContainer（preview write + provider read）と WorkerContainer（ingestion write + pruner）両方に」と書く。だが `D1UsageMetricsProvider` は read 専用で request 側のみ（`serverCloudflare.ts` L741）。recorder の write は preview（request）と ingestion（consumer=request spread + worker）両方で要る。WorkerContainer に recorder を載せれば pruner から使え、`createConsumerContainer` は RequestContainer を spread するので consumer 路の write も賄える（`activityLogRepository` と同じ継承構造、L939-941）。「RequestContainer に recorder を載せ、WorkerContainer にも載せ、ConsumerContainer は両方を継承」という具体的配置を `D1ActivityLogRepository` の前例どおり明記すれば実装時の迷いが減る。

- **[S-005]** Dashboard の `UploadsSparkline` は `aria-label` ハードコード（index.tsx L80）。LLM カード追加時は aria-label を prop 化して汎用 `Sparkline` にする必要がある（plan.md L71 が「必要なら命名一般化」と書く点を確定推奨）。scalar カード（L273-283）は既に `metrics.llmCallsToday` を参照し null→「取得失敗」に degrade 済みなので、プランどおりコンポーネント変更不要（正しい）。

---

#### 良い点

- **ADR-002 の判断（直接ポート記録、domain event 経由を採らない）は実コードで裏付けが取れた。** `previewPrompt` は `unitOfWorkProvider.run` を一切呼ばず（`previewPrompt.ts` 全体）UoW/outbox を持たない。`collectEvents` の入口が無く、preview のために空 UoW を開いて outbox 行を作るのは UoW 原則（callback が触れるリポジトリを最小に保つ）に反する、という ADR の論拠は正確。activity_log の outbox→relay→projection 経路を preview に流用できないのは事実で、直接ポート（best-effort）は妥当な設計判断。
- **best-effort 記録が本処理を壊さない設計は既存の確立パターンと整合。** `runIngestionJob` は随所で best-effort（directoryTree fetch 失敗を warn して継続、L116-121）、`runPruneTick` は activity prune を try/catch で握り潰す（L104-110）という前例があり、「記録失敗は logger.warn のみ・本処理に影響させない」は一貫している（AC-5 の実現可能性は高い）。
- **scalar `llmCallsToday` のみ実装し他 scalar は null 固定維持（ADR-004）は #595 ADR-002 と矛盾しない。** #595 ADR-002 自身が「scalar も D1 で埋めるのは別 Issue」「データ源が無いから null 固定」と明示しており、データ源新設に伴い当該 scalar だけ実装するのは「データ源があるのに取得失敗を出し続ける方が不正直」という虚偽表示禁止の鉄則に整合。AC-7（他 scalar 不変）の維持も `usageMetricsProvider.ts` L47-53 の現状を崩さず追加するだけで成立する。
- **実装ステップが依存方向（内側→外側: ポート/型 → schema → adapter → provider port → provider 実装 → usecase → UI → DTO → pruner → DI → test）に概ね並んでおり**、ヘキサゴナルの依存方向に沿っている。ドメインに新概念/不変条件を増やさず read-model として位置づける判断（plan.md L52-53）も #595 の activity_log と同格で妥当。
- **関連ファイルの特定が（P-004 の bucket 記述を除き）正確。** call-site map（previewPrompt=request/UoW無、runIngestionJob=consumer）、migration 最新番号（0019→0020 採番）、`LLMProvider` VO の所在（`adminSettings/valueObject.ts` L127-130）、pruner/DI の前例（`D1ActivityLogRepository` の RequestContainer/WorkerContainer 両載せ）はいずれも実コードと一致。

---

## 結論

方針レベルは健全で実現可能。ただし**実装地点の現実（runPipeline が free function で recorder/provider/clock を持たない: P-001、provider 名の真実源が未確定: P-002、Stub 時の記録方針未確定: P-003、bucket 方式の調査記述矛盾: P-004）**が計画段階で詰め切れていない。これらは「実装時に確定」と先送りされているが、AC-1（owner/provider/1呼び出し1行）と虚偽表示禁止（数値の意味）に直結するため、Round 2 までに 4 点を確定すべき。S-001〜S-005 は実装の迷いを減らす確定事項。
