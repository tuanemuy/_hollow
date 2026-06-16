# Plan Review — Issue #595 (Round 1: アーキテクチャ整合性・実現可能性・リスク)

レビュー対象:
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/plan.md`
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/adr.md`

視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク。

総評: 計画は CLAUDE.md のレイヤー規約（依存方向 domain → application → adapter → presentation）・outbox/projection パターン・partial-failure 契約・虚偽表示禁止の鉄則をよく踏まえており、ADR-001（event-sourced projection 採用）は既存先例（search / SavedView / publication）に正しく整合している。スコープの切り方（LLM 系列・nightly backup・期間切替/全件導線を範囲外に落とす判断）も妥当。実コード調査の精度も高い。一方で、**ADR-005（大量アップロード集約）が consumer のディスパッチ前冪等化（idempotencyStore）と構造的に衝突する**点、および**ハンドラを置くレイヤー（application vs worker）と UoW 利用方法**に踏み込み不足があり、要修正の指摘がある。

---

#### 問題点（要修正）

- **[P-001]** ADR-005 の「大量アップロード集約 = `ON CONFLICT DO UPDATE` で件数加算」が、consumer のディスパッチ前冪等化（`idempotencyStore.hasProcessed(eventId)` → ack）と構造的に矛盾し、冪等化が機能しない。
  - 理由: `app/worker/cloudflare/handlers.ts` は dispatch を呼ぶ**前**に `idempotencyStore.hasProcessed(eventId)` を確認し、処理済み eventId は dispatch せず ack する（dispatch 後に `markProcessed`）。つまり「同一 eventId の二重配信」はそもそも dispatch に到達しない。この仕組み下では、他の projection ハンドラ（search / publication 等）は eventId 単位の `insertIfAbsent` を**冪等の主防御にしていない**（ディスパッチ前で弾かれる前提。ハンドラ側は再実行に耐える=natural idempotent な操作のみ）。ところが ADR-005 の集約は「窓キー(owner+窓開始) を unique キーにして**別々の eventId** を 1 行に加算」する設計であり、冪等の単位が eventId ではなく窓キーになる。`ingestion.created` ごとに `count + 1` する加算は、**at-least-once の同一 eventId 再配信で二重計上を防げない**（idempotencyStore は eventId 単位で弾くが、worker が `markProcessed` 前にクラッシュ→再配信されると同じ eventId が再 dispatch され、加算が 2 回走る）。AC-7「同一 eventId で二重行が出ない」は満たせても、「同一 eventId で二重**計上**しない」は満たせない。plan.md L240・L242 と ADR-005 L101 は「窓キー or 代表 eventId」「処理済み event_id 記録で冪等化」と両論併記のまま未決で、この核心リスクが解決されていない。
  - 提案: 集約の冪等を「件数加算」ではなく「event_id 集合の冪等 insert」に再設計する。例: 個々の `ingestion.created` を `activity_log` ではなく中間テーブル（owner, hourBucket, event_id unique）に `insertIfAbsent` で蓄積し、表示時に窓集約して count を導出する（加算しないので二重計上が原理的に起きない）。あるいは、本 Issue では「大量アップロード」をバースト集約せず `ingestion.created` を直接 1 行投影し（既存ハンドラ同様 eventId 一意で冪等）、バースト集約は別 Issue に切る。後者ならノイズ懸念が残るので、`getRecentActivity` 側で同 owner 連続 upload をグルーピング表示する read-time 集約に寄せる手もある。いずれにせよ「dispatch 前 idempotencyStore があるため eventId 単位の再実行は基本起きないが、`markProcessed` 前クラッシュ時のみ再 dispatch されうる」という正確な脅威モデルに基づき、加算系を避ける方針を ADR-005 に確定すべき。

- **[P-002]** projection ハンドラを `app/core/application/activityLog/` に置く一方で、UoW へのアクセス方法・実行コンテキスト（`ServiceArgs` の `ConsumerContainer`）が plan に明示されておらず、書き込みを「UoW 内で activityLogRepository へ insert」とする設計に矛盾の芽がある。
  - 理由: 既存の projection ハンドラには 2 系統ある。(a) `search/handleNoteSavedEvent.ts` は `WorkerContainer` を取り、**UoW を開かず** worker 専用リポジトリ（`indexJobRepository`）へ直接 enqueue する。(b) `publication/handleUserDeletedEvent.ts` は `container.unitOfWorkProvider.run(...)` で UoW を開き `collectEvents` まで使う。activity_log は「集約ではない read-model への単純 insert」であり、ドメインイベントを再 emit する必要はない。plan.md L119/L135 は「UoW 内で activityLogRepository へ projection 行を insert」「`UnitOfWorkContext` に activityLogRepository を追加」とするが、調査では `activityLogRepository` は worker 専用（`WorkerContainer`/`ConsumerContainer` への追加）で足り、`UnitOfWorkContext`（=request 路のトランザクション境界）に足す必要はない。両方に足すと「アグリゲート変更でもないのに UoW 境界の表面積を広げる」ことになり、CLAUDE.md の UoW 概念（「the repositories the callback may touch」を最小に保つ）から外れる。
  - 提案: ハンドラの配置とコンテナを確定する。activity_log への insert は (a) 型（`WorkerContainer`/`ConsumerContainer` に `activityLogRepository` を追加、UoW を開かず直接 `insertIfAbsent`）に揃えるのが既存パターンと最も整合的。`UnitOfWorkContext` には**足さない**。plan.md L135「`UnitOfWorkContext` … に追加」と L185-186 を、`WorkerContainer` 経由（`createWorkerContainer` でインスタンス化 → `Pick<WorkerContainer>` で `ConsumerContainer` に載せる、`indexJobRepository` と同じ配線）に修正する。なお search/publication と異なり、複数 insert を 1 イベントでアトミックにしたい要件は無い（1 イベント → 1 行）ので UoW なしで問題ない。

- **[P-003]** `usageMetricsProvider` の DI 差し替え対象が「request 路」であることが plan に反映されておらず、「consumer container に差し替え」を含意する記述（L130）が誤解を招く。
  - 理由: 調査の結果、`usageMetricsProvider: NullUsageMetricsProvider` は `createRequestContainer`（request 路）に wire されており、consumer は request container を spread で継承しているだけ。チャートの hourly 集計は `getUsageMetrics`（request 路の admin usecase）から呼ばれるので、差し替えは **request container 側**で行えばよい。plan.md L130/L163 は「`serverCloudflare.ts` の `usageMetricsProvider` を差し替え」と書くのみで、どのコンテナか・D1 ハンドル（`db`）をどう注入するかが曖昧。`D1UsageMetricsProvider` は D1 接続を要するので、`createRequestContainer` 内で `db` を渡してインスタンス化する必要がある。
  - 提案: Step 3 を「`createRequestContainer` 内の `usageMetricsProvider` を `NullUsageMetricsProvider` から `new D1UsageMetricsProvider(db, clock)` に差し替え（既存 scalar metric は引き続き `null` で degrade させるか、この機会に D1 から埋めるかを明記）」に具体化する。**注意**: 既存 4 metric-card（userCount/storage/uploadsToday/llmCallsToday）はスコープ外（挙動不変）と宣言している（plan L36）。Null から D1 実装に差し替えると、これら scalar も `null` → 実値に変わりうる。D1UsageMetricsProvider が scalar をどう扱うか（`null` のまま返すのか）を明記しないと「既存挙動不変」と矛盾する。**この相互作用は見落としリスクが高い**ので Step 2/3 で scalar フィールドの扱いを固定すること。

---

#### 改善提案（検討推奨）

- **[S-001]** hourly bucket 集計クエリの「実現方式」が未確定（plan L129「`strftime` または app 側で ISO8601 をパースして時バケット化」）。既存コードに hourly GROUP BY の先例が無く、ここは実現性検証が必要。
  - 理由: 既存集計（`sumByteSizeByOwnerSince` 等）は `gte(createdAt, iso)` の単純 WHERE + `COALESCE(SUM/COUNT)` で、**GROUP BY による時間バケット化は前例が無い**。ISO8601 TEXT を 24 バケットに割るには (1) SQL の `substr(created_at, 1, 13)`（"YYYY-MM-DDTHH" 切り出し）で GROUP BY、(2) `strftime('%Y-%m-%dT%H', created_at)`、(3) 24 本の範囲クエリ、(4) 全件取得して app 側バケット、のいずれか。`created_at` は UTC ISO8601 文字列なので substr/strftime はタイムゾーン UTC 固定（plan L244 と整合）。drizzle で `sql` テンプレートを使う必要があり、partial-failure 契約（throw せず `null`）の try/catch を provider 内に閉じる点も明示したい。実装前に方式を 1 つに決め、空テーブル時に「24 バケットすべて 0」を返す（欠損バケットの 0 埋め）ことをテストで固定するとよい。
- **[S-002]** plan.md の実装ステップ番号が PR-A / PR-B で「1〜4, 12」「5〜11, 13」と飛び番・交錯しており、依存順の可読性が落ちている。
  - 理由: 受け入れ基準表の「対応ステップ」列との対応は取れているが、ステップ番号自体が PR 内で連番でないため、実装時に順序を追いにくい。PR 単位で 1 から振り直すか、AC 表の参照を PR 接頭辞付き（A-1, B-5 等）にすると追従しやすい。設計の正しさには影響しないので軽微。
- **[S-003]** `InstanceSettings` mutation メソッドの戻り値変更（plan L107/L201: `{ entity, eventDrafts }` 形へ拡張）は、adminSettings ドメインを「イベントを emit しない設定 CRUD」から「イベント駆動アグリゲート」へ性質変更する波及がある。9 個の static mutation factory（`updateLLM`/`setRegistrationOpen` 等）すべての戻り値型と全呼び出し側が変わる。
  - 理由: 調査では `InstanceSettings` の mutation は plain entity を返す static factory で、現状イベント皆無。`{ entity, eventDrafts }` 形へ全面変更すると影響範囲が広い（21 usecase のうち書き込み系）。AC-6 が要求するのは「設定変更が活動行として記録される」だけなので、ドメインの全 mutation を `WithEventDrafts` 化するより、**usecase 層で `InstanceSettingsEvents.updated(settingKind, ...)` を `collectEvents` する**（エンティティ戻り値は不変のまま）方が波及が小さく、ADR-003 の「単一 `instance_settings.updated`」とも整合しやすい。ドメインに不変条件が無いイベント（純粋な「変更があった」通知）なら、entity に eventDrafts を持たせる必然性は薄い。ADR-003 で「イベント生成をドメインに置くか usecase に置くか」を一段掘り下げて判断するとよい（CLAUDE.md「ドメインに置くべきロジックが usecase に漏れていないか」の逆向き=不要にドメインを重くしていないか、の観点）。
- **[S-004]** `instance_settings.updated` を新規 emit すると、その eventId が outbox → relay → queue → consumer を必ず一巡し、activity 以外の全 dispatch case で `default: skipped` になるが、`idempotencyStore.markProcessed` までは走る（処理コスト・`processed_events` 行増）。plan L241 は「relay/consumer 負荷は軽微想定」と触れているが、設定変更は低頻度なので妥当。記載は適切だが、`processed_events` の肥大化（pruner の対象か）を ADR か注記で一言確認しておくと安心。
  - 理由: 既存の outbox 運用（pruner worker）が `processed_events`/`outbox_events` を刈る前提なら新規イベント type も自動で対象に入るはずだが、明示確認があると運用上の見落としを防げる。
- **[S-005]** チャートの空/少データ時のエッジケース（活動テーブル空状態は plan L243 で扱っているが、チャート側の「ある時間帯だけ 0」「全 24h で ingestion 0 件」）の UI 仕様が SVG sparkline 生成（plan L141/L174）で未定義。
  - 理由: 全 0 のとき sparkline をどう描くか（平坦線 / 「データなし」表示）で虚偽表示の懸念が出る。ADR-002 は「過去 ingestion_jobs から導出されるため空状態が出ない」とするが、新規インスタンスや閑散時間帯では実際に全 0 がありうる。`null`（取得失敗）と 0（実データで 0 件）の区別を UI で明確にする旨をテスト方針に足すとよい（plan L252 の「`null` 系列で取得失敗」とは別ケース）。

---

#### 良い点

- ADR-001 の event-sourced projection 採用は、`search/handleNoteSavedEvent.ts`・`view/handleNotePurgedEvent.ts`・`publication/handleUserDeletedEvent.ts` という確立先例に正しく乗っており、レイヤー整合・関心分離の判断として的確。「活動ログはドメイン概念ではなく read-model」「`ActivityKind` はドメイン値オブジェクトにしない（不変条件を持たない）」という線引きは、CLAUDE.md「make illegal states unrepresentable」「ドメインを過剰に重くしない」の双方に照らして適切。
- 虚偽表示禁止の鉄則を AC-2（LLM 系列）・スコープ節（nightly backup）・ADR-004（期間切替/全件導線）で一貫して適用し、データ源が無い要素を確実に範囲外へ落としている。Issue の派生元 #545 の方針を正しく継承。
- LLM 記録源の有無を Step 1 で「設計前提の確認」として最初に固定する順序は、虚偽表示リスクを実装前に潰す段取りとして優秀。調査でも LLM 呼び出しの永続記録は皆無と確認でき、この前提確認は正しく機能する。
- ADR-002 の「専用集計テーブルを作らず `ingestion_jobs` を直接集計」は、書き込みパスに集計負荷を持ち込まず・バックフィル不要・partial-failure 契約共有という観点で、Issue スコープに対し過剰実装を避けた妥当な判断。`idx_media_owner`/`idx_ij_status_updated` 等の既存 index と整合。
- partial-failure 契約（throw せず per-metric `null`、UI は「取得失敗」）を時系列フィールドにも拡張する方針（AC-3）が、既存 `UsageMetricsProvider` の確立契約と一貫している。
- 依存方向（domain → application → adapter → presentation）に沿ったステップ設計と、チャート/活動の PR 分割は、独立性の高い 2 機能を分けて検証可能にする実務的な良判断。
- 調査結果セクションの精度が高い（既存イベント在庫の棚卸し、`adminSettings/events.ts` 不在の特定、`export.job.completed` の意味=per-owner エクスポートである点の指摘など）。設計の前提が実コードに裏付けられている。
