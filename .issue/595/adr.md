# ADR — Issue #595: P40 ダッシュボード（24h チャート + 最近のアクティビティ）の backend 新設

## ADR-001: 活動ログは event-sourced projection（consumer ハンドラ）で構築する

### Status
Proposed

### Context
「最近のアクティビティ」フィードは、複数 subsystem（identity / ingestion / export / adminSettings）で発生する事象を 1 つの read-model に集約する。実装方式の選択肢:

1. **直接書き込み**: 各 usecase が活動ログテーブルへ直接 insert。
2. **event-sourced projection**: 各 usecase は既存どおりドメインイベントを emit し、outbox → consumer ハンドラが活動ログテーブル（read-model）へ投影。

コードベースには既に event-sourced projection の先例が複数ある:
- `search/handleNoteSavedEvent.ts`（検索インデックス）
- `view/handleNotePurgedEvent.ts`（SavedView broken-link マーカー）
- `publication/handleUserDeletedEvent.ts`（公開状態取り消し）

これらは consumer 側で read-model テーブルを冪等更新するパターンを確立している。

### Decision
event-sourced projection（選択肢 2）を採用する。活動ログは管理ダッシュボードの read-model であり、ドメインの中核ではない。`dispatchDomainEvent` に活動ログハンドラを fan-out し、projection テーブルへ書く。配置は既存の `search/handleNoteSavedEvent.ts` 系統（`WorkerContainer` を取り UoW を開かず worker 専用リポジトリへ直接書く）に揃える（詳細は ADR-006）。

冪等性の責務分担を明確にする（P-001 / S-001 対応）:
- **consumer 側（主防御）**: `handleQueue` は dispatch の**前**に `idempotencyStore.hasProcessed(eventId)` を確認し、処理済み eventId は dispatch せず ack する（dispatch 成功後に `markProcessed`）。同一 eventId の二重配信は通常 dispatch に到達しない。
- **projection 側（二重防御）**: `markProcessed` 前に worker がクラッシュして同一 eventId が再 dispatch される窓が残るため、projection は eventId を自然キーに `insertIfAbsent`（`event_id` unique + `ON CONFLICT DO NOTHING`）で書く。**1 イベント → 1 行**の素直な投影なら、この自然キー UPSERT で二重行が原理的に起きない（加算をしないため再実行に耐える）。

この責務分担により、大量アップロード集約のような「複数 eventId を 1 行に加算」する方式は eventId 冪等と構造的に衝突する（ADR-005 で件数加算を廃し、自然キー insert ベースに再設計する）。

### Consequences
- 良い点: 確立パターンに整合。usecase に活動ログ書き込みが紛れ込まず関心が分離される。projection の追加・変更が consumer 側で完結。新規イベント源を足すたびにハンドラ case を追加するだけ。冪等の主防御は idempotencyStore、projection 側は自然キー UPSERT による二重防御で、`markProcessed` 前クラッシュ窓もカバーする。
- トレードオフ: 配信が at-least-once・順序保証なしのため、ハンドラは冪等必須。outbox → relay → queue の遅延ぶん、活動行の表示に最終的整合性のラグが出る（ダッシュボードでは許容範囲）。projection は「件数加算」のような非冪等操作を避け、1 イベント → 1 行の自然キー insert に限定する設計制約を負う。

---

## ADR-002: 24h チャートは専用集計テーブルを作らず `ingestion_jobs` の hourly クエリで導出し、`UsageMetricsProvider` を拡張する

### Status
Proposed

### Context
直近 24h の hourly 時系列をどう供給するか:

1. **専用集計テーブル**（`prompt_preview_counters` 方式の `window_start` バケット upsert）を新設し、書き込み時にインクリメント。
2. **既存テーブルの集計クエリ**で導出。`ingestion_jobs.created_at`（ISO8601, index `idx_ij_status_updated`）があり、`COALESCE(SUM/COUNT)` + `gte(createdAt, iso)` の集計先例（`sumByteSizeByOwnerSince` 等）が既にある。

また port は (a) 既存 `UsageMetricsProvider`（scalar snapshot）を拡張するか、(b) 時系列専用 port を新設するか。

LLM 呼び出しには専用ログテーブルが無く、hourly 時系列の源が存在しない可能性が高い。

### Decision
- 時系列は**専用集計テーブルを作らず**、`ingestion_jobs` の hourly クエリで導出する（選択肢 2）。直近 24h・hourly はカーディナリティが小さく、既存 index で十分高速。書き込みパスに集計負荷を持ち込まない。
- **hourly bucket の実現方式（S-001 対応）**: `created_at` は UTC ISO8601 文字列なので、**UTC で時バケット化**する。SQL で `substr(created_at, 1, 13)`（"YYYY-MM-DDTHH" 切り出し）を bucket キーに `GROUP BY` し、`COUNT(*)` を取る方式を第一候補とする（`strftime('%Y-%m-%dT%H', created_at)` も等価で可）。drizzle の `sql` テンプレートで記述。既存集計（`sumByteSizeByOwnerSince` 等）には GROUP BY による時バケット化の先例が無いため、実装時にこの方式を 1 つに確定する。欠損バケット（その時間帯に ingestion 0 件）は provider 側で **24 バケットを 0 埋め**して返す（チャート側で「実データ 0」を平坦に描けるように）。partial-failure の try/catch は provider 内に閉じ、失敗時は系列を `null` で返す。
- port は**既存 `UsageMetricsProvider` を拡張**する（選択肢 a）。同じ provider が scalar と時系列を同一の partial-failure 契約（throw せず `null` degrade）で供給でき、DTO・loader が 1 本化できる。
- **DI 差し替えの位置（P-003 対応）**: `usageMetricsProvider` は `createRequestContainer`（request 路、admin usecase が呼ぶ）に wire されており、consumer はこれを spread 継承するだけ。差し替えは `createRequestContainer` 内で `new D1UsageMetricsProvider(db, clock)` として行う（D1 ハンドル `db` を注入）。**既存 scalar metric（userCount/storage/uploadsToday/llmCallsToday）の挙動不変条件**: Null → D1 化で scalar が `null` → 実値に変わると「既存挙動不変」（#545 一致）と矛盾するため、`D1UsageMetricsProvider` の **scalar フィールドは引き続き `null` を返す**（時系列フィールドのみ実装）。これにより「既存 4 metric-card は触らない」が成立する。scalar も D1 で埋めるのは別 Issue。
- LLM 系列は実装前（Step 1）に記録源の有無を確定する。**記録源が無ければ LLM 系列はスコープ外**とし、アップロード系列のみ描く（虚偽表示禁止）。LLM 記録源が無いと確定した場合、既存 scalar「LLM 呼び出し (24h)」カードも同じデータ源不在で現状「取得失敗」表示のままだが、scalar の挙動は #545 一致のとおり変更しない（表示整合のみ確認、P-001-coverage）。

### Consequences
- 良い点: 新規テーブル・書き込みパス変更が不要でリスクが小さい。partial-failure 契約を既存と共有。バックフィル不要（過去 ingestion_jobs から導出されるため空状態が出ない）。
- トレードオフ: 毎リクエストで 24h 集計クエリが走る（loader cache で緩和）。将来「期間を変更」で長レンジ集計が必要になったら専用集計テーブルを再検討（本 Issue 範囲外）。LLM 系列が描けない可能性があり、その場合チャートは 1 系列に縮退する。scalar を `null` 固定にするため、「LLM 系列を描かない」判断と「scalar LLM カードが取得失敗のまま」が UI 上併存する（虚偽ではない＝両方ともデータ源不在を正直に表現）。

### A-1 確定結果（LLM 呼び出し記録源の調査・PR-A 実装時）

**結論: LLM 呼び出しの永続記録源は存在しない。LLM hourly 系列は実装しない（アップロード系列のみ実装した）。**

調査範囲と根拠（`app/core/adapters/` `app/core/application/` 全体）:
- D1 スキーマ（`app/core/adapters/d1/schema.ts` 全 27 テーブル）に LLM 呼び出し / completion / token / call-count を記録するテーブルは無い。マイグレーション（`0000`〜`0017`）にも無い。
- `0016_prompt_preview_counters.sql` / `prompt_preview_counters` は**プロンプトプレビューのレート制限カウンタ**であり、固定窓内のプレビュー回数を上限制御するためのもの。LLM 呼び出しの恒久記録ではなく（古い窓行は機会的に削除される）、hourly 時系列の源にはならない。
- LLM アダプタ層（`app/core/adapters/{anthropic,openai,gemini}/`）は呼び出しのログ・カウント・永続化を一切行わない（メモリ内で API を叩いて応答/エラーを返すのみ）。
- `UsageMetricsProvider.llmCallsToday` は実装が `NullUsageMetricsProvider` のみで常に `null`。実データ源を持つ実装は存在しない。

判断: 虚偽表示禁止（AC-2）に従い、LLM hourly 系列はデータ源が無いため描かない。`D1UsageMetricsProvider` は `uploadsHourly`（`ingestion_jobs` 由来）のみを返し、LLM 時系列フィールドは port に追加していない。既存 scalar「LLM 呼び出し (24h)」カードは同じデータ源不在で『取得失敗』のまま（`D1UsageMetricsProvider.llmCallsToday` も `null` 固定、#545 一致で挙動不変）。LLM 記録源の新設まで踏み込むとスコープ膨張のため別 Issue とする。

---

## ADR-003: 設定変更は単一 `instance_settings.updated` イベント、バックアップ種別は実在の `export.job.completed` に寄せる

### Status
Proposed

### Context
- **設定変更**: `adminSettings` には登録制御 / LLM / プロンプト / 限度 / トークン / 音声 など複数の更新 usecase があるが、ドメインイベントが皆無。活動行に「設定変更」を出すには書き込み側（イベント emit）の新設が要る。イベントを (a) 種別ごとに分割するか、(b) 種別を payload で区別する単一イベントにするか。
- **バックアップ**: モックは「バックアップ完了 D1 / nightly」を描くが、コードに D1 nightly backup という subsystem は無い。`export.job.completed` は per-owner エクスポートを指す。

### Decision
- 設定変更は**単一 `instance_settings.updated` イベント**を定義し、`settingKind`（"registration_policy" | "llm_config" | "prompt_template" | "instance_limits" | "design_tokens" | ...）と要約を payload に持たせる（選択肢 b）。活動ログ projection は payload から「設定変更」行の対象・詳細を組み立てる。
- バックアップ種別は**実在の `export.job.completed`** に意味を寄せて記録する。存在しない「D1 / nightly」行はモックから写さない（虚偽表示禁止）。ラベル文言は実態（インスタンスエクスポート完了）に合わせる。

### Consequences
- 良い点: イベント定義・decoder・dispatcher case が 1 つで済み、設定種別の増減に強い。バックアップ行が実イベントに一致し虚偽表示を避けられる。
- トレードオフ: 単一イベントの payload が種別ユニオンになり、decoder の zod が分岐を持つ。モックの「D1 / nightly」表現とは乖離する（実態優先）。将来システムバックアップ subsystem が新設されたら別イベントを足す。

---

## ADR-004: 「期間を変更」「すべて見る」導線は遷移先が無ければ描かない

### Status
Proposed

### Context
モックは「期間を変更」（チャートの期間切替）と「すべて見る」（活動全件一覧）の導線リンクを持つ。本 Issue のスコープは「直近 24h hourly」「直近 N 件の活動」のみで、任意レンジ集計・全件一覧ページは含まない。

### Decision
遷移先（期間切替 UI / 全件一覧ルート）を本 Issue で実装しない限り、その導線リンクは**描かない**。#540〜545 で確立した「機能しない導線・虚偽の導線を出さない」鉄則に従う。

### Consequences
- 良い点: クリックしても何も起きない / 404 になるリンクを出さない。虚偽表示禁止に整合。
- トレードオフ: モックの導線が一部欠ける。期間切替・全件一覧は別 Issue で追従する。

---

## ADR-005: 大量アップロードは `ingestion.created` を同 owner・短窓で集約して 1 行化する

### Status
Proposed

### Context
モックの「大量アップロード」行は「128 ファイル / 2.4 GB を 5 分間で受信」のように**複数ファイルの集約**を表す。一方 `ingestion.created` は 1 ファイル 1 イベント。1 イベント 1 行で投影すると活動テーブルが個別アップロードで溢れ、「大量アップロード」の意味（バースト検知）を表現できない。

脅威モデルの正確化（P-001-arch 対応）: consumer は dispatch **前**に `idempotencyStore.hasProcessed(eventId)` で再配信を弾くため、同一 eventId の二重 dispatch は通常起きない。例外は `markProcessed` 前のクラッシュ → 再配信の窓だけ。したがって「窓キー unique + 件数加算（`ON CONFLICT DO UPDATE`）」方式は、この再配信窓で同一 `ingestion.created` が 2 回 dispatch されると **count が二重計上**される（idempotencyStore は eventId 単位で弾くが、加算の冪等単位は窓キーであり eventId ではない）。AC-7「同一 eventId で二重行が出ない」は満たせても「二重**計上**しない」は満たせない。**当初案（件数加算）は ADR-001 の冪等責務分担と構造的に衝突するため採用しない**。

### Decision
**件数加算を廃し、自然キー insert ベースに再設計する**。次の 2 方式から選ぶ:

- **方式A（採用）**: 個々の `ingestion.created` を中間テーブル `ingestion_burst_log`（カラム: `owner_id`, `hour_bucket`（UTC 時バケット, ADR-002 と同方式の `substr`）, `event_id` unique, `occurred_at`）に `insertIfAbsent`（`ON CONFLICT(event_id) DO NOTHING`）で蓄積する。加算をしないので再配信で二重計上が原理的に起きない。「大量アップロード」行は表示時（`getRecentActivity`）に `owner_id` + 窓で `COUNT(DISTINCT event_id)` を集約し、閾値以上の窓のみ 1 行として導出する（read-time 集約）。閾値・窓幅は**定数化**（`LARGE_UPLOAD_THRESHOLD` / `LARGE_UPLOAD_WINDOW_MINUTES`、暫定: 5 分・N 件）し、その値での境界テスト（閾値前後で行が出る/出ない）を置く（S-003-coverage）。閾値自体のチューニングは別途。
- **方式B（フォールバック）**: 本 Issue ではバースト集約をせず `ingestion.created` を直接 1 行投影（既存ハンドラ同様 eventId 一意で冪等）し、バースト集約は別 Issue に切る。ノイズが許容できないなら方式 A を採る。

いずれも「複数 eventId を 1 行に加算」する非冪等操作を含まない。

**fan-out の冪等性（S-002-arch 対応）**: `ingestion.created` は dispatcher で既存 `runIngestionJob` case への fan-out として activity ハンドラを足す（B-7 / ADR-001 参照）。fan-out の片方 `runIngestionJob` が transient error → `retry` を返すと `markProcessed` 未到達で再 dispatch されるが、その時点で先に走った `ingestion_burst_log` への insert は `ON CONFLICT(event_id) DO NOTHING` で二重行を作らない。**fan-out の片方が retry してももう片方の自然キー insert は冪等**なので、activity 書き込みと `runIngestionJob` の順序に依存しない（実装者は順序で迷わなくてよい）。

### 保持・刈り込み（retention / pruning — P-001-arch 対応）

`ingestion_burst_log` は `ingestion.created`（= アップロード 1 ファイル 1 件、**高頻度イベント**）ごとに 1 行を蓄積する。再設計前の「窓キー 1 行へ加算」方式は owner×窓で 1 行に潰れていたため増加率が低かったが、自然キー insert ベースの再設計では行が 1:1 で積もり、**刈り込み経路が無いと無限増大する**（再設計が新たに生んだ副作用）。

実態確認: 既存 pruner（`outboxPrune.ts` → `outboxRepository.pruneProcessed`）は `DELETE FROM outbox_events WHERE processed_at < cutoff` のみを実行し、`processed_events`（idempotency store）も read-model テーブルも一切刈らない。**「新規テーブルも pruner が自動で拾う」は成り立たない**ため、本 Issue で専用の刈り込みを足す。

**保持方針を確定する**:
- `ingestion_burst_log`: read-time 集約は「直近 24h 窓」しか参照しない（実際の burst 判定窓は `LARGE_UPLOAD_WINDOW_MINUTES` = 暫定 5 分とさらに短い）。よって**保持期間は 24h（窓幅より十分長く、表示で参照する最大レンジ以上）で足り、それより古い行は刈ってよい**。刈り込み実装は既存 pruner worker（`pruneOutbox` と同じ daily tick）に `ingestion_burst_log` の `occurred_at < cutoff`（cutoff = now − 保持期間）を `DELETE` する 1 文を追加する（専用 prune クエリを `ActivityLogRepository` ないし専用 repo に生やし、pruner エントリ点から呼ぶ）。本 Issue のスコープに含める（B-9）。
- `processed_events` の無刈り問題は #595 のスコープ外（既存の運用課題）。本 Issue は `instance_settings.updated` という新規イベント type を恒常的に emit して `processed_events` 行を増やすが、設定変更は低頻度なので増分は軽微。**「pruner が拾う」という誤った含意は外す**（既存 pruner は `outbox_events` のみ対象）。

### Consequences
- 良い点: at-least-once 配信下でも二重計上が原理的に起きない（自然キー insert は再実行に耐える）。活動テーブル（または中間テーブル）が eventId 一意で冪等。「大量アップロード」がバースト実態に一致。閾値が定数化され境界テストで検証可能。`ingestion_burst_log` の保持期間が明示され、専用刈り込みで無限増大を防ぐ。
- トレードオフ: 中間テーブル（方式A）が増える。read-time 集約のクエリが必要。閾値はチューニング対象（定数なので変更容易）。pruner に新テーブル用の prune 文を 1 つ足す配線が必要（既存 outbox prune の定型に倣う）。

---

## ADR-006: 活動ログ projection ハンドラは `WorkerContainer` 経由で UoW を開かず書く（`UnitOfWorkContext` には足さない）

### Status
Proposed

### Context
projection ハンドラを置くレイヤーとリポジトリのコンテナ・UoW 利用方法を確定する必要がある（P-002-arch）。既存の projection ハンドラには 2 系統ある:

- (a) `search/handleNoteSavedEvent.ts`: `WorkerContainer` を取り、**UoW を開かず** worker 専用リポジトリ（`indexJobRepository`）へ直接 enqueue。read-model は派生投影で、正本は上流アグリゲートにある。
- (b) `publication/handleUserDeletedEvent.ts`: `container.unitOfWorkProvider.run(...)` で UoW を開き、アグリゲートを変更し `collectEvents` まで使う（複数 note をアトミックに変更する要件あり）。

`activity_log` への書き込みは「集約ではない read-model への 1 イベント → 1 行の単純 insert」であり、ドメインイベントを再 emit する必要も、複数行をアトミックに変更する要件も無い。

型の確認: `ConsumerContainer = RequestContainer & Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">`。`indexJobRepository` は `WorkerContainer` 由来で `createWorkerContainer` がインスタンス化し、`createConsumerContainer` が `ConsumerContainer` に載せている。

### Decision
活動ログ projection は **(a) 系統に揃える**:
- `ActivityLogRepository` port を `app/core/domain/activityLog/ports/`（または application 層 ports）に定義し、`WorkerContainer` に `activityLogRepository` フィールドを追加。`createWorkerContainer` でインスタンス化（`indexJobRepository` と同じ配線）。
- `ConsumerContainer` の `Pick<WorkerContainer, ...>` に `"activityLogRepository"` を追加して載せる。
- ハンドラは `WorkerContainer`（または `ServiceArgs` 経由の `ConsumerContainer`）を取り、**UoW を開かず** `activityLogRepository.insertIfAbsent(...)` を直接呼ぶ。
- **`UnitOfWorkContext`（request 路のトランザクション境界）には足さない**。activity_log は request 路で書かれず、UoW の「callback が触れるリポジトリ」を最小に保つ CLAUDE.md の UoW 原則に反するため。

### Consequences
- 良い点: 既存 search projection パターンと最も整合。UoW 境界の表面積を広げない。1 イベント → 1 行なのでアトミック複数 insert 不要 → UoW なしで問題ない。
- トレードオフ: `WorkerContainer` / `ConsumerContainer` の配線にフィールドを 1 つ追加する（既存 `indexJobRepository` の前例どおりで定型）。

### 注記（見送り事項）
- **設定変更イベントの生成位置（S-003-arch）**: `InstanceSettings` の全 mutation を `{ entity, eventDrafts }` 化するか、usecase 層で `collectEvents` するかは、実装フェーズで既存のイベント収集パターン（usecase 層 `collectEvents` 等）に合わせて判断する。設計をここで固定しすぎない。AC-6 が要求するのは「設定変更が活動行として記録される」だけで、ドメインに不変条件を持たない純粋な「変更通知」イベントなら usecase 層 collect でも成立する。

---

## ADR-007: 活動ログ系テーブルの保持方針を本 Issue で確定し、専用刈り込み経路を足す

### Status
Proposed

### Context
ADR-005 の再設計（`ingestion_burst_log` への自然キー insert）と ADR-001 の `activity_log` projection は、いずれも**全イベントを 1 行ずつ恒久保持**する read-model テーブルを新設する。既存 pruner（`outboxPrune.ts` → `outboxRepository.pruneProcessed`）は `outbox_events` のみを `processed_at < cutoff` で削除し、`processed_events` や他の read-model テーブルは一切刈らない（grep で `processedEvents` の delete/prune は 0 件）。よって「新規テーブルも pruner が自動で拾う」という当初の S-004 注記の前提は実態と食い違う。本 Issue が新設するテーブルの保持方針を確定し、刈り込み経路をスコープに含める必要がある。

- `ingestion_burst_log`: 高頻度（`ingestion.created` 1:1）で積もる。詳細・保持方針は ADR-005「保持・刈り込み」節で確定済み（保持 24h・pruner に DELETE 1 文追加）。
- `activity_log` 本体: 全イベントを 1 行保持し、表示は `findRecent(limit)` で直近 N 件のみ。行は無限に積もるが表示は抑制されるため UI 上の問題は出にくい。ただし D1 ストレージと `occurred_at` index のサイズは増え続ける。

### Decision
活動ログ系テーブルの刈り込みを **1 箇所（既存 pruner worker の daily tick）に集約**して本 Issue のスコープに足す:

- `ingestion_burst_log`: 保持 24h（ADR-005）。`occurred_at < cutoff` を pruner で `DELETE`。
- `activity_log` 本体: 保持期間（暫定 90 日）を定数化し（`ACTIVITY_LOG_RETENTION_DAYS` 等）、`occurred_at < cutoff` を pruner で `DELETE`。直近 N 件しか表示しない設計なので、保持を切っても UI 機能に影響しない。保持期間自体のチューニングは別途（定数なので変更容易）。
- `processed_events` の無刈りは本 Issue スコープ外（既存運用課題）。本 Issue の `instance_settings.updated` 追加による増分は低頻度で軽微。

pruner エントリ点（`app/worker/cloudflare/pruner.ts` / `pruneOutbox` 相当）から、新設テーブル用の prune 関数を順に呼ぶ。prune クエリは各テーブルの repository（`ActivityLogRepository.pruneOlderThan(cutoff)` 等）に生やし、既存 `outboxRepository.pruneProcessed` の定型に倣う。

### Consequences
- 良い点: 両テーブルの無限増大に歯止め。刈り込みが既存 pruner の daily tick に集約され運用が一元化。保持期間が定数化され調整容易。「直近 N 件表示」と保持上限が独立に決まり、表示要件を壊さない。
- トレードオフ: pruner に prune 文を 2 つ足す配線が増える。保持期間（24h / 90 日）は暫定値でチューニング対象。`processed_events` の無刈りは残課題として別 Issue 化が望ましい（本 Issue では正確化のみ）。

---

## 実装メモ（PR-B 実装時に確定した事項）

### B-6: adminSettings 変更系 usecase の棚卸しと emit/非 emit 仕分け

`app/core/application/adminSettings/` の全変更系 usecase を棚卸しし、`instance_settings.updated` を emit する/しないを以下に確定した。`settingKind` ユニオンの最終形は emit 対象から導出される 6 値。

**emit する（→ `settingKind`）**:

| usecase | settingKind | 備考 |
|---|---|---|
| `toggleRegistrationPolicy` | `registration_policy` | 常に save → 常に emit |
| `updateLLMConfig` | `llm_config` | 常に save → 常に emit |
| `updateSpeechConfig` | `speech_config` | 常に save → 常に emit |
| `updatePromptTemplate` | `prompt_template` | `next === current` の no-op 時は emit しない |
| `resetPromptTemplate` | `prompt_template` | 同上（no-op ガードあり） |
| `resetAllPromptTemplates` | `prompt_template` | 同上 |
| `updateInstanceLimits` | `instance_limits` | 常に save → 常に emit |
| `updateDesignTokens` | `design_tokens` | `next === current` の no-op 時は emit しない |
| `resetDesignTokens` | `design_tokens` | 実変化時のみ emit（`next !== current` ガードを追加） |

**emit しない（理由）**:

- `reencryptApiKey`: マスターキーローテーションの保守操作であり「設定変更」ではない。3 フェーズ構成で `already-new-key` スキップパスもあり、ローテーションのたびに活動行を出すのはノイズ。AC-6 の対象は運用者向けインスタンス設定変更。
- `updateUserPromptOverride`: per-user override（member スコープ、admin チェックなし）。AC-6 はインスタンス全体設定が対象であり、ユーザー個別 override は範囲外。`settingKind` ユニオンにも含めない。
- `rebuildSearchIndex`: 設定変更ではなく運用操作（search_documents の再構築）。
- 読み取り専用 usecase（`getInstanceSettings` / `getInstancePromptDefaults` / `getUserPromptOverride` / `getUsageMetrics` / `testLLMConnection` / `testSpeechConnection`）: mutation でないため対象外。

**イベント生成位置**: ADR-006 注記のとおり、`InstanceSettings` エンティティの mutation メソッドは plain entity を返す（events を返さない）既存パターンを維持し、`instance_settings.updated` は **usecase 層の `ctx.collectEvents([...])`** で収集した。設定変更は「ドメイン不変条件を持たない純粋な変更通知」であり、ドメインを `{entity, eventDrafts}` 化して重くする必要がないため（S-003-arch 見送り判断と整合）。

### バックアップ種別の扱い（ADR-003 の確定）

`export.job.completed` に意味を寄せて記録する方針を採用（**縮退はしない**）。`kind: "export_completed"`、ラベルは実態の「エクスポート完了」、対象は `${format} エクスポート`。存在しない D1 nightly backup 行は描かない（虚偽表示禁止）。運用上 export 完了は実際に発生しうるため種別縮退の必要はないと判断した。

### AC-5: 「対象」「詳細」列を各イベント payload でどう満たしたか

各イベント payload は必要フィールドを直接は持たないため、projection ハンドラが**読み取り専用 UoW で別 repo を引いて**埋めた（空文字/ID 直書きを回避）。ADR-006 の「UoW を開かず書く」は **activity_log への書き込み**に関する制約であり、対象解決のための read-only lookup は dispatcher 既存の `buildSnapshotByNoteId`（read UoW）と同じ確立パターンに沿う。

| kind | 対象（target） | 詳細（detail） | 解決方法 |
|---|---|---|---|
| `user_created` | ユーザーハンドル | 「新規ユーザーが登録しました」 | `userRepository.findById` でハンドル解決 |
| `large_upload` | owner ハンドル | 「N 件のアップロード」 | burst 集約時に `users` を join して解決（read-time） |
| `job_failed` | 元ファイル名 | `errorReason || errorCode` | `ingestionJobRepository.findById` |
| `settings_changed` | 設定種別ラベル | usecase が組んだ summary | payload に同梱（lookup 不要） |
| `export_completed` | `${format} エクスポート` | 「エクスポート完了」 | `exportJobRepository.findById` |

job/user 行が既に消えている場合は raw id にフォールバック（イベント自体は実在するため honest）。

### コンテナ配線（ADR-006 の補足）

`activityLogRepository` は **WorkerContainer に加えて RequestContainer にも**載せた。ADR-006 が禁じるのは `UnitOfWorkContext` への追加（request 路で書かないため）であり、read usecase `getRecentActivity` は request 路（Dashboard loader）から呼ばれるため、read のために RequestContainer に repo が必要。`searchIndex` が両コンテナに載るのと同じ扱い。`ConsumerContainer` は RequestContainer 由来で `activityLogRepository` を継承するため `Pick` には追加していない。
