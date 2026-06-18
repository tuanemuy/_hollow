# ADR — Issue #748: LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従

派生元 `.issue/595/adr.md`（特に ADR-002・ADR-005・ADR-006・ADR-007、A-1 LLM 記録源調査の結論）を前提とする。#595 は「LLM 記録源が無いので LLM 系列は描かない」と結論し別 Issue に切った。本 Issue がその別 Issue である。

---

## ADR-001: LLM 呼び出しの記録源は専用カウンタ集計ではなく「呼び出しイベントログ（call-log）read-model テーブル」にする

### Status
Proposed

### Context
LLM 呼び出しの永続記録源をどう持つか。要件は owner / provider / occurredAt を保持し、hourly 時系列（24h・UTC bucket・0 埋め）と scalar（24h 合計）の両方を導出できること。選択肢:

1. **専用集計カウンタ**（`prompt_preview_counters` / 旧 ADR-005 の「窓キー upsert + 件数加算」方式）: owner×hour-bucket で 1 行に件数を加算。
2. **呼び出しイベントログ**（1 呼び出し 1 行の append-only read-model）: `owner_id` / `provider` / `occurred_at`（と冪等キー）を 1 行ずつ insert。時系列・scalar はいずれも read-time に `COUNT(*)` / `GROUP BY substr(occurred_at,1,13)` で導出。

#595 の ADR-005 は「件数加算は at-least-once 配信下で二重計上を起こし冪等責務分担と構造的に衝突する」と結論し、件数加算を廃して自然キー insert ベース（`ingestion_burst_log`）に再設計済み。LLM 記録も同じ配信特性（後述 ADR-002 でイベント経由を採るなら at-least-once）を負う。

### Decision
**選択肢 2（呼び出しイベントログ read-model テーブル `llm_call_log`）を採用する。** カラムは `id` / `owner_id` / `provider`（"anthropic" | "openai" | "gemini"）/ `occurred_at`（**ISO8601 text**, ADR-007）/ `created_at`。`event_id` / unique 制約は持たない（ADR-008）。

- 時系列は `usageMetricsProvider` が `substr(occurred_at,1,13)` で UTC hour bucket 化して `COUNT(*)`、`ingestion_jobs` のアップロード系列と同一方式（ADR-002 #595 / ADR-007）で導出する。`occurred_at` を ISO8601 text にすることで `collectUploadsHourly` の bucket ロジックを流用できる。
- scalar `llmCallsToday` も同テーブルへの `COUNT(*) WHERE occurred_at >= now-24h` で導出できる（ADR-004 参照）。
- `provider` を持つことで将来 provider 別系列にも拡張可能だが、本 Issue では集約系列のみ描く。
- 記録は append insert（1 LLM API 呼び出し 1 行）。同期 best-effort で再配信窓が無いため冪等キー（event_id unique）は持たない（ADR-008）。加算をしないので二重計上は起きない。

### Consequences
- 良い点: #595 で確立した `ingestion_burst_log`（自然キー insert + read-time 集約）の実装・テスト・刈り込みパターンを再利用できる。ただし bucket 化は `ingestion_burst_log`（ts_ms + 別 hour_bucket text）ではなく `uploadsHourly`（ISO8601 text + substr）方式を採る（ADR-007）。件数加算の冪等問題を回避。scalar も同一テーブルから導出でき DTO が一貫。provider 別拡張の余地を残す。
- トレードオフ: 1 呼び出し 1 行で行が積もる（高頻度ではないが刈り込みが要る → ADR-005）。read-time に毎リクエスト 24h 集計クエリ（loader cache + 専用 index で緩和）。

---

## ADR-002: 記録タイミングはドメインイベント経由ではなく「呼び出し直後の直接記録（call-recorder ポート）」にする

### Status
Proposed

### Context
LLM 呼び出しを `llm_call_log` に書くタイミング/経路。#595 の activity_log は outbox → relay → consumer projection（ADR-001 #595）だが、LLM 呼び出しには重要な前提差がある:

- LLM 呼び出しは **2 経路**ある（A-1 調査時の call-site map）:
  - `previewPrompt`（**request 路**、`ServiceArgs`、**UoW を開かない**、outbox に enqueue する経路が無い）
  - `runIngestionJob` の `runPipeline`（**consumer/worker 路**、LLM 呼び出しは UoW 外で実行）
- LLM 呼び出し自体は現状ドメインイベントを一切 emit しない。`ingestion.created` は記録源だが「ジョブ作成」≠「LLM 呼び出し」であり、ジョブ作成後に LLM が rate-limit/quota で実行されないケースもある（呼び出し回数と乖離する）。preview 路は `ingestion.created` を一切出さない。

選択肢:

1. **ドメインイベント経由**（`llm.called` イベントを emit → outbox → consumer projection ハンドラが `llm_call_log` へ insert）。activity_log と同経路。
2. **直接記録**（`LlmCallLogRecorder` ポートを定義し、LLM 呼び出し直後に呼び出し側 usecase が `recordCall({id, ownerId, provider, occurredAt})` を直接呼ぶ）。

選択肢 1 は preview 路で破綻する。preview は UoW を開かず（アグリゲート変更が無い）`collectEvents` の入口が無く、outbox enqueue は UoW トランザクション内でのみ許される（CLAUDE.md UoW 原則）。preview のためだけに空 UoW を開いて outbox 行を作るのは UoW 原則（callback が触れるリポジトリを最小に保つ）に反し過剰。

### Decision
**選択肢 2（直接記録 / `LlmCallLogRecorder` ポート）を採用する。**

- `LlmCallLogRecorder` ポートを application 層（`app/core/application/llmCallLog/ports.ts`）に **write / prune のみ**で定義: `recordCall(entry: { id; ownerId; provider; occurredAt }): Promise<void>`（単純 insert, ADR-008）と `pruneOlderThan(cutoff)`。read 系（`countSince` / `collectLlmCallsHourly` 等）はポートに持たせず `D1UsageMetricsProvider` 内の read に閉じる（ADR-003）。
- LLM 呼び出しを**ラップする decorator アダプタ**は採らず、**呼び出し側 usecase（`previewPrompt` / `runIngestionJob`）が LLM 呼び出し成功直後に `recordCall(...)` を best-effort（try/catch で握り潰し、失敗はログのみ）で呼ぶ**。記録失敗が本処理（プレビュー結果・ジョブ実行）を壊さないこと。`previewPrompt` は `container` を直接持つので各分岐で 1 行記録。`runIngestionJob` の `runPipeline` は `container` を持たない free function なので、`PipelineDeps` に `recorder` / `clock` / `providerName` を追加し呼び出し元から渡す（plan ステップ 7 / 修正レビュー P-001）。記録粒度は「1 LLM API 呼び出し = 1 行」（structure 系は `structureToHtml` + `suggestMetadata` で 2 行）。
- `id` は `container.idGenerator.next()` で採番。`eventId` フィールドは持たず、unique 制約も設けない（同期 best-effort で再配信窓が無く冪等キー不要, ADR-008）。
- **Stub（LLM 未設定）の呼び出しは記録しない**（実 LLM 呼び出しではないため。記録すると scalar/系列が実態と乖離し虚偽表示禁止と衝突する）。**これは明示的な Stub 判定で実現せず、記録地点を「LLM 呼び出し成功直後（throw を抜けた後）」に置くことで構造的に保証する**: `StubLLMProvider` は両メソッドが必ず throw するため、request 路（catch で `llm_preview_unavailable` 化され成功路に到達しない）・consumer 路（throw でジョブ失敗、成功路に到達しない）のいずれも Stub は記録地点に到達しない。Stub 判定フラグを `PipelineDeps` 等に持ち回す実装は入れない（arch[S-001]）。
- `provider` は呼び出し時に**実際に構築された** provider の解決済み名（env 値そのままではない, ADR-006）。request 路は `buildLlmProvider` の解決名、consumer 路は `resolveConsumerLlmConfig`（env override > DB）の解決名。

### Consequences
- 良い点: request 路（preview）と consumer 路（ingestion）の両方を同一ポートで一貫して記録できる。UoW / outbox を preview のために歪めない。「ジョブ作成」ではなく「実際の LLM 呼び出し」を記録するので回数が正確（虚偽表示禁止に直結）。記録は best-effort で本処理から疎結合。
- トレードオフ: ドメインイベント経由でないため #595 の activity_log とは経路が異なる（projection ハンドラ・dispatcher case を増やさない）。記録は同期 I/O が 1 つ増える（best-effort・失敗握り潰しで本処理レイテンシ/成否への影響を限定）。at-least-once の冪等は不要なので unique 制約は持たない（ADR-008）。「記録 best-effort = 取りこぼし得る」ため、表示は「概算」であり厳密な課金カウントではない（ダッシュボード用途として許容）。Stub を記録しないため、LLM 未設定インスタンスでは scalar/系列が 0 のまま（『取得失敗』ではない）になり虚偽表示禁止と整合する。

---

## ADR-003: `usageMetricsProvider` を拡張して LLM 時系列を返す（時系列専用 port を新設しない）

### Status
Proposed

### Context
LLM hourly 時系列を presentation へどう供給するか。#595 ADR-002 は「アップロード系列は既存 `UsageMetricsProvider` を拡張（時系列専用 port を新設しない）」と決め、`uploadsHourly` フィールドを `UsageMetricsSnapshot` に足した。LLM 系列も同 snapshot に足すか、別 port にするか。

`D1UsageMetricsProvider` は現状 `ingestion_jobs` のみを参照する。LLM 系列は別テーブル `llm_call_log` から引く。

### Decision
**#595 と同様に `UsageMetricsProvider` を拡張する。** `UsageMetricsSnapshot` に `llmCallsHourly: ReadonlyArray<UsageMetricsHourlyPoint> | null` を追加し、`D1UsageMetricsProvider` に `collectLlmCallsHourly()` を `collectUploadsHourly()` と同型（UTC 24 bucket・0 埋め・try/catch で系列を `null` degrade）で実装する。**read は `D1UsageMetricsProvider` 内に閉じる**: provider は constructor で `db` を直接持つので（`ingestion_jobs` と同じく）`llm_call_log` を引く drizzle クエリを provider 内に直接書く。`LlmCallLogRecorder` ポートには read メソッドを生やさず write/prune に絞る（責務分離: recorder = write/prune、provider = read）。これにより同じ集計が 2 箇所に出る乖離リスクを避ける。

`NullUsageMetricsProvider` にも `llmCallsHourly: null` を追加（型の網羅性）。

### Consequences
- 良い点: scalar と 2 系列を同一 partial-failure 契約（throw せず `null` degrade）で 1 本の provider/DTO/loader が供給。#595 のアップロード系列と寸分違わぬパターン。
- トレードオフ: 毎リクエストで LLM 系列の 24h 集計クエリが追加で 1 本走る（`llm_call_log(occurred_at)` index + loader cache で緩和）。

---

## ADR-004: scalar `llmCallsToday` を `llm_call_log` から実装する（null 固定をやめる）

### Status
Proposed

### Context
#595 ADR-002 は「`D1UsageMetricsProvider` の scalar は全て `null` 固定（#545 一致・既存挙動不変）。scalar の D1 化は別 Issue」とした。本 Issue は LLM 記録源を新設するため、scalar `llmCallsToday`（24h 合計）を実データで埋められる状態になる。埋めるか、null 固定を維持するか。

懸念: #595 の「既存 scalar の挙動不変（#545 一致）」原則に抵触するか。

### Decision
**scalar `llmCallsToday` のみ `llm_call_log` から実装する（`COUNT(*)`、try/catch で `null` degrade）。** 他の scalar（`userCount` / `storage*` / `uploadsToday`）は引き続き `null` 固定のまま据え置く。

**窓定義の確定（PR #760 review-001 W-001 を受けた実装時確定）**: scalar の下限は exact `now-24h`（sliding window）ではなく、hourly 系列と同一の **hour-aligned 下限 `windowStartIso()`（= `floorToHourUtc(now) - 23h`、現在の部分時 + 過去 23 完全時間）** を使う。これにより `scalar === sum(hourly series)` が境界条件によらず常に成立し、ダッシュボードの「LLM 呼び出し (24h)」カードと時系列グラフの 2 表示が必ず一致する。当初記述の `WHERE occurred_at >= now-24h`（exact sliding）は系列と下限が最大 1 時間ずれて合計不一致を招くため撤回する。

理由: 本 Issue の主目的は「LLM 記録源新設」であり、その記録源があれば「LLM 呼び出し (24h)」カードを『取得失敗』から実数表示へ変えるのは虚偽表示禁止の鉄則にむしろ整合する（データ源ができたのに『取得失敗』を出し続ける方が不正直）。#595 が scalar を据え置いたのは「データ源が無いから」であり、データ源新設に伴い当該 scalar だけ実装するのは #595 の判断と矛盾しない（#595 ADR-002 自身が「scalar も D1 で埋めるのは別 Issue」と明示）。`uploadsToday` 等は本 Issue がデータ源を新設しないので触らない。

### Consequences
- 良い点: 「LLM 呼び出し (24h)」カードが実数表示になり、虚偽表示（データ源があるのに取得失敗表示）を避けられる。時系列と scalar が同一テーブル由来かつ同一の hour-aligned 窓で一致（`scalar === sum(series)` が常に成立）。
- トレードオフ: #545 で『取得失敗』だったカードの表示が変わる（が、これは正しい変化）。`llmCallsToday` は best-effort 記録由来なので「概算」であり、課金明細とは一致しない可能性がある（ADR-002 のトレードオフを継承）。他 3 scalar との「実装の不揃い」が残る（それらのデータ源は本 Issue 範囲外）。

---

## ADR-005: `llm_call_log` の保持・刈り込みを既存 pruner の daily tick に足す

### Status
Proposed

### Context
`llm_call_log` は 1 呼び出し 1 行で append され、刈り込み経路が無いと無限増大する（#595 ADR-007 と同じ問題）。既存 pruner（`pruneActivityLog`）は `activity_log`（90 日）と `ingestion_burst_log`（24h）を daily tick で刈る。表示で参照するのは「直近 24h」のみ。

### Decision
**`llm_call_log` の刈り込みを既存 pruner worker の daily tick に足す。** 保持期間は `LLM_CALL_LOG_RETENTION_HOURS = 48` に確定する（表示窓 24h < 保持窓 48h を満たし、daily tick のタイミングに依らず直近 24h の表示対象が刈られない。表示窓と同じ 24h にすると境界行が表示と刈り込みで競合し得るため避ける）。`LlmCallLogRecorder.pruneOlderThan(cutoff)` を生やす。**pruner への組み込みは `pruneActivityLog` への相乗りではなく、新規 `pruneLlmCallLog(container)` を `runPruneTick` 内の独立した try/catch ブロックで呼ぶ**（`pruneActivityLog` は逐次 await で前段 throw 時に後段に到達しないため、相乗りすると activity prune の失敗が LLM prune をスキップさせ得る。独立ブロックで failure isolation を確保し、双方向にブロックしない）。retention 定数は `app/core/application/llmCallLog/types.ts` に置く。

### Consequences
- 良い点: 無限増大に歯止め。#595 の刈り込みパターン（pruner daily tick・`pruneOlderThan`・失敗握り潰し）を再利用しつつ、独立 try/catch で failure isolation を確保。表示窓 < 保持窓で表示欠落リスクを排除。
- トレードオフ: pruner に独立した prune ブロックを 1 つ足す配線。保持期間は定数なので変更容易。

---

## ADR-006: 記録する provider 名の真実源は env 値ではなく「実際に構築された provider の解決済み名」にする

### Status
Proposed

### Context
`llm_call_log.provider` 列に何を書くか。`buildLlmProvider`（`serverCloudflare.ts` L578-591）は `LLMProvider` インスタンスのみを返し、解決済み provider 名を一切外に出さない。さらに `adminLlmApiKey` / `adminLlmModel` のいずれかが欠落すると `provider` 引数を無視して `StubLLMProvider` を返す。よって env の `ADMIN_LLM_PROVIDER` 値は「実際に container に載った provider」と一致しない（Stub のときは特に "anthropic" でも何でもない）。env 値をそのまま記録すると、虚偽表示禁止（呼び出しに使った実 provider を記録する）が成立しない。

選択肢:
1. env 値（`ADMIN_LLM_PROVIDER`）をそのまま記録する。
2. 実際に構築された provider の名前を真実源とし、`buildLlmProvider` が名前を返す形に変更して container に載せる。

### Decision
**選択肢 2 を採用する。** `buildLlmProvider` を `{ provider: LLMProvider; providerName: string }` を返す形に変更し、`createRequestContainer` が `llmProviderName`（解決済み provider 名）を container に載せる。consumer 路は `resolveConsumerLlmConfig`（env override > DB）の解決結果由来の provider 名を同経路で container（および `runPipeline` 引数）へ届ける。記録時はこの解決済み名を `recordCall` の `provider` に渡す。

- request 路と consumer 路で名前の解決経路が異なる（request = env var の解決、consumer = resolved config）点を考慮し、いずれも「実際に構築された provider」を真実源とする。
- consumer 路で `resolveConsumerLlmConfig` が `null` を返す場合（DB 設定・env override ともに無い）、`ConsumerContainer` は RequestContainer の LLM provider（env-only `buildLlmProvider`、Stub の可能性あり）を spread 継承するため、`llmProviderName` も同様に **request 側で解決済みの値を継承する**（resolved config 由来の名前は存在しないので request 側継承が出所, arch[S-002]）。この経路は実 provider が Stub になりがちで、Stub は throw して記録に到達しないため実害は限定的。
- Stub のときは記録しない（ADR-002）ため、Stub フォールバック時の `providerName` 値は記録に使われない。

### Consequences
- 良い点: ダッシュボードの provider 列が実態と一致（虚偽表示禁止整合）。env と実構築のズレ（Stub フォールバック）に起因する誤記録を防ぐ。
- トレードオフ: `buildLlmProvider` の戻り値型変更と呼び出し元・テストの追従が要る（既存は `LLMProvider` を直接返す前提のため）。

---

## ADR-007: `llm_call_log.occurred_at` は ISO8601 text にし `uploadsHourly` と同じ substr bucket を流用する

### Status
Proposed

### Context
hourly 系列の bucket 化方式。当初の調査は「`ingestion_burst_log` と同型（UTC substr bucket）」としていたが、これは誤り: `ingestion_burst_log.occurred_at` は `integer(... { mode: "timestamp_ms" })`（`schema.ts` L857）で substr 不可。hour bucket は別途 `hour_bucket` text カラム（L856）に保持し、read-time 集約は `occurred_at`（ms）の sliding window で行う。一方「UTC substr bucket」は `uploadsHourly` が引く `ingestion_jobs.created_at`（ISO8601 text）の特性。よって `occurred_at` の格納型と bucket 方式を 1 つに確定する必要がある。

選択肢:
- (a) `occurred_at` を ISO8601 text にして `uploadsHourly` と同じ `substr(occurred_at,1,13)` を再利用。
- (b) `ingestion_burst_log` 同様 ts_ms + 別 `hour_bucket` text。
- (c) ts_ms 単独 + `strftime('%Y-%m-%dT%H', occurred_at/1000, 'unixepoch')`。

### Decision
**選択肢 (a) を採用する。** `llm_call_log.occurred_at` を ISO8601 text（UTC）で格納し、`collectLlmCallsHourly()` は `collectUploadsHourly()` と同一の `substr(occurred_at,1,13)` bucket を流用する。`llmCallsToday` scalar も `occurred_at >= (now-24h の ISO8601)` で比較する。

### Consequences
- 良い点: `collectUploadsHourly` のロジックを最大限流用でき、「両系列で bucket 境界が一致」をテストで簡潔に満たせる。実装・テストが最小。
- トレードオフ: text 比較ベースになる（ISO8601 は辞書順 = 時刻順なので範囲比較は正しく働く）。`ingestion_burst_log` とは型が異なる（が同型維持より bucket 流用を優先）。

---

## ADR-008: `event_id` unique 制約を撤廃する（同期 best-effort 記録に冪等キーを持たせない）

### Status
Proposed

### Context
当初設計は `ingestion_burst_log` とのスキーマ対称性のため `event_id` unique + `ON CONFLICT(event_id) DO NOTHING` を維持していた。しかし ADR-002 の記録経路は同期 best-effort（at-least-once 再配信窓が無い）で、二重行リスクは原理的に存在しない。unique 制約は「同期記録に冪等キーがある」という誤読を招き、unique index 1 本ぶんの書き込みコストも生む。

選択肢:
1. スキーマ対称性のため `event_id` unique を残す（余剰だが無害、誤読防止 JSDoc を付ける）。
2. `event_id` 自体を撤廃し `recordCall` を単純 insert にする。

### Decision
**選択肢 2 を採用する。** `LlmCallLogEntry` から `eventId` を除去し、`recordCall` は `onConflict` なしの単純 insert にする。テーブルにも `event_id` カラム・unique index を設けない。`id`（`idGenerator.next()`）のみを主キーとして持つ。

### Consequences
- 良い点: 「同期 best-effort 記録に冪等キーがある」誤読を排除。unique index 1 本ぶんの書き込みコストを削減。記録経路（冪等不要）とスキーマが正しく対応。
- トレードオフ: `ingestion_burst_log` とのスキーマ対称性は失う（が、両者の記録特性が異なる以上、対称性維持の意味は薄い）。万一 best-effort 記録が二重に走っても重複行が残るが、ダッシュボードは「概算」表示なので許容範囲（ADR-002 のトレードオフ内）。

---

## ADR-009: `llmProviderName` の型は `string` ではなくドメインの `LLMProvider` union にする（実装時判断）

### Status
Accepted（実装時に確定）

### Context
plan / ADR-006 は `buildLlmProvider` の戻り値 `providerName` と container の `llmProviderName` を一部「`string`」と記述していた。一方 `LlmCallLogEntry.provider` は `LLMProvider`（`"anthropic" | "openai" | "gemini"`、`adminSettings/valueObject`）で型付けされている。`providerName` を `string` にすると `recordCall` 呼び出し地点で `string → LLMProvider` の暗黙の不整合が生じ、型レベルで「記録される provider は VO の取りうる値」という不変条件が崩れる。

`buildLlmProvider` の override 経路は `createLLMProvider` がレジストリ未登録 provider を throw するため、戻り値 `provider` 構築に成功した時点で provider 名は登録済み = `LLMProvider` のメンバーである。Stub フォールバック経路の `providerName` は記録に使われない（Stub は throw して記録地点に到達しない, ADR-002）。

### Decision
**`buildLlmProvider` の戻り値型を `{ provider: LLMProvider; providerName: LLMProviderName }` とし、container の `llmProviderName` も `LLMProvider`（domain union）で型付けする。** 解決名は `(provider ?? "anthropic") as LLMProvider` で得る（env 由来の `string` を境界で 1 度だけ union へ寄せる）。これにより `LlmCallLogEntry.provider` への受け渡しがキャスト無しで通り、「記録される provider は VO の取りうる値」が型レベルで保証される。

### Consequences
- 良い点: 記録経路全体が `LLMProvider` 型で一貫し、`recordCall` 地点での暗黙キャストが消える。`event` 値そのままでなく「実構築 provider 名」という ADR-006 の真実源と型が一致。
- トレードオフ: env / resolved-config 由来の `string` を `buildLlmProvider` 内で 1 度 `as LLMProvider` する（境界での妥当な narrowing。未登録 provider は override 経路で `createLLMProvider` が throw、Stub 経路は記録されないため実害なし）。

---

## ADR-010: `D1UsageMetricsProvider` の bucket 化ロジックは `fillBuckets` ヘルパーに集約する（実装時判断）

### Status
Accepted（実装時に確定）

### Context
plan は LLM hourly 系列を `collectUploadsHourly` と「同型」で追加するとした。素朴には両メソッドへ 24 本 0 埋めロジックを複製するが、複製すると bucket 境界・ウィンドウ計算がドリフトし得る（ADR-007 の「両系列で bucket 境界一致」をテストで担保したい意図と逆行）。drizzle のカラム/テーブル型を引数に取る汎用化は `any` を要し lint 規約と衝突する。

### Decision
**bucket 列挙・0 埋めを `fillBuckets(rows)` private ヘルパーに、ウィンドウ下限 ISO 文字列を `windowStartIso()` ヘルパーに切り出し、`collectUploadsHourly` / `collectLlmCallsHourly` はそれぞれ具体的な drizzle クエリ（`substr(...,1,13)` + `gte`）だけを書いて結果を `fillBuckets` に渡す形にする。** クエリは型安全な具体カラムで書き、共通化は型に依存しない後処理（行配列 → 24 本）のみに限定する。

### Consequences
- 良い点: 24 本 0 埋め・ウィンドウ計算が 1 箇所になり両系列で必ず一致（`any` を使わず lint 規約遵守）。テストで「両系列の hourStart 列が一致」を簡潔に検証できる。
- トレードオフ: クエリ本体は 2 メソッドに残る（カラムが異なるため）。これは型安全と引き換えの許容範囲。

---

## ADR-011: `collect()` で clock を1度だけ読み全集計に注入（hour 境界 TOCTOU 回避）

### Status
Accepted（PR #760 Round 2 レビュー W-001 対応）

### Context
`D1UsageMetricsProvider.collect()` は hourly 系列・scalar の各集計メソッドがそれぞれ `this.clock.now()` を呼んでいた。ADR-004 で scalar と hourly series は同じ `windowStartIso()` 窓を共有し `scalar === sum(series)` を保証する設計にしたが、各集計が別々に now を読むと、集計の合間に hour 境界をまたいだ場合に窓下限が 1 時間ずれ、不変条件が崩れうる（TOCTOU）。

### Decision
`collect()` 冒頭で `const now = this.clock.now()` を1度だけ確定し、`collectUploadsHourly(now)` / `collectLlmCallsHourly(now)` / `collectLlmCallsToday(now)` / `windowStartIso(now)` / `fillBuckets(rows, now)` へ引数として注入する。各メソッドは ambient な clock 読み出しをやめる。

### Consequences
- 良い点: 1回の `collect()` 内で全系列・scalar が同一の now・同一窓を共有し、hour 境界でも `scalar === sum(series)` が構造的に成立する。
- トレードオフ: メソッドシグネチャに `now: Date` が増えるが、決定論性が上がりテストも fixedClock 1点で全経路を固定できる。

---

## ADR-012: integration テストの `llm_call_log` クリーンを共有 setup の SSOT に集約

### Status
Accepted（PR #760 Round 2 レビュー W-001 対応）

### Context
新テーブル `llm_call_log` を共有 D1（`env.DB`）の integration テスト群のクリーン対象（`__tests__/setup.ts` の `CLEAN_STATEMENTS`）に登録し忘れていた。Round 1 では暫定的に provider / recorder の各テストファイルに per-file `beforeEach(delete)` を足して凌いだが、`ingestion_burst_log` 等の先例が SSOT 登録済みなのと非対称で、クリーン責務が二重化し将来 flaky 化のリスクがあった。

### Decision
`setup.ts` の `CLEAN_STATEMENTS` に `["llm_call_log", "DELETE FROM llm_call_log"]` を追加し、Round 1 で入れた per-file `beforeEach` を撤去する。クリーン責務を共有 setup に一本化する。

### Consequences
- 良い点: 全 integration テストが毎回 `llm_call_log` をクリーンな状態で開始し、テスト分離が規約どおり SSOT に集約される。integration 全体（64 ファイル / 786 テスト）パス。
- トレードオフ: なし（先例パターンへの整合）。
