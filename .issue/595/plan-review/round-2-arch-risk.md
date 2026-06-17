# Plan Review — Issue #595 (Round 2: アーキテクチャ整合性・実現可能性・リスク)

レビュー対象:
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/plan.md`
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/adr.md`

視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク。
今回は 1 周目指摘の反映が妥当か、再設計に新たなリスクが無いかを確認する。

## 総評

1 周目の要修正 3 件はいずれも的確に反映され、実コードと突き合わせても正しい。

- **P-001（大量アップロード集約 vs idempotencyStore 二重計上）**: ADR-005 が件数加算を全廃し、`ingestion_burst_log`（`event_id` unique）への自然キー insert + read-time 集約に再設計された。脅威モデル（`handleQueue` の `hasProcessed → dispatch → markProcessed`、`markProcessed` 前クラッシュ → 再 dispatch の窓）の記述は `app/worker/cloudflare/handlers.ts` L142-176 の実装と完全に一致しており、正確。再設計後の方式は「加算しない＝再実行に耐える」ため、この窓でも二重計上が原理的に起きず、AC-7「二重行が出ない」と「二重計上しない」の両方を満たす。妥当。
- **P-002（projection のコンテナ / UoW）**: ADR-006 が新設され、`WorkerContainer` 経由・UoW を開かず `insertIfAbsent`・`UnitOfWorkContext` には足さない方針が確定。`search/handleNoteSavedEvent.ts`（`WorkerContainer` を取り UoW なしで `indexJobRepository.enqueue`）と完全に同系統で、`ConsumerContainer = RequestContainer & Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">`（`di/types.ts` L303-306）に `"activityLogRepository"` を足す配線も実在の前例どおり。妥当。
- **P-003（usageMetricsProvider 差し替え経路）**: `usageMetricsProvider: NullUsageMetricsProvider` は `createRequestContainer`（`serverCloudflare.ts` L740）に wire され、consumer は spread 継承するだけ（L926-933）。差し替えを `createRequestContainer` 内で行い、scalar は `null` 固定で「既存 4 metric-card 挙動不変」を担保する条件が ADR-002・A-3・リスク節に明記された。妥当。

改善提案（S-001〜S-005）も hourly bucket 方式の具体化（`substr`/`strftime` + 24 バケット 0 埋め）、ステップ番号の PR 連番化、`null` と実データ 0 の UI 区別など、すべて適切に取り込まれている。

一方、**再設計（ADR-005 方式A）が新たに導入した `ingestion_burst_log` テーブルの肥大化リスク**について、plan の S-004 注記が pruner の実態と食い違っており、要修正の指摘が 1 件ある。それ以外は問題なし。

---

#### 問題点（要修正）

- **[P-001]** ADR-005 方式A が新設する `ingestion_burst_log` は刈り込み経路が存在せず無限増大する。plan S-004（L244）の「`processed_events`・`ingestion_burst_log` の刈り込みが pruner の既存対象に含まれるか実装時に確認」という前提（"既存 pruner が拾うはず"）は実態と食い違う。
  - 理由: 既存 pruner は `pruneOutbox`（`app/core/application/workers/outboxPrune.ts`）→ `outboxRepository.pruneProcessed`（`app/core/adapters/d1/repositories/outboxRepository.ts` L213-225）で、`DELETE FROM outbox_events WHERE processed_at < cutoff` のみを実行する。**`processed_events`（idempotency store）も他の read-model テーブルも一切刈らない**（grep で `processedEvents` の delete/prune は 0 件）。つまり「新規イベント type も自動で pruner 対象に入るはず」は成り立たない。さらに `ingestion_burst_log` は `ingestion.created`（= アップロード 1 ファイル 1 件、高頻度イベント）ごとに 1 行を蓄積するため、burst 検知という性質上 read-time 集約に必要な保持期間は短い（窓幅 `LARGE_UPLOAD_WINDOW_MINUTES` = 暫定 5 分）にもかかわらず、行は永久に残り続ける。これは**再設計前の「窓キー 1 行へ加算」方式には無かった新規の副作用**（旧方式は owner×窓で 1 行に潰れるため増加率が桁違いに低い）であり、ADR-005 の Consequences が「中間テーブルが増える」と一行触れるのみで増大の歯止めを設計していない。activity_log 本体も同様に無刈りだが、こちらは「直近 N 件表示」で行数が抑制される性質ではなく全イベント保持なので、こちらも保持方針の判断が要る。
  - 提案: `ingestion_burst_log` に明示的な保持・刈り込みを設計に組み込む。最小実装は (a) 既存 pruner worker に `ingestion_burst_log` の `occurred_at < cutoff`（窓幅より十分長い保持、例 24h）削除を 1 文追加する、または (b) `getRecentActivity` の read-time 集約が「直近 24h 窓」しか参照しないので、それより古い行を同じ pruner tick で削除する。`processed_events` の無刈り問題は #595 のスコープ外（既存の運用課題）だが、本 Issue が `instance_settings.updated` という新規イベント type を恒常的に emit して `processed_events` 行を増やす（設定変更は低頻度なので増分は軽微）点だけ S-004 の記述から「pruner が拾う」という誤った含意を外し、「`processed_events` は現状無刈りだが設定変更は低頻度で軽微」と正確化する。少なくとも plan S-004 の「pruner の既存対象に含まれるか実装時に確認」は「**既存 pruner は outbox_events のみ対象。burst_log は専用の刈り込みを足す**」と確定すべき（"確認"止まりだと実装で漏れる）。

---

#### 改善提案（検討推奨）

- **[S-001]** B-7 の `ingestion.created` は新規 case 追加ではなく既存 case への **fan-out 追加**である点を明記すると実装事故を防げる。
  - 理由: `dispatchDomainEvent.ts` L146-148 で `ingestion.created` は既に `runIngestionJob` へルーティングされている（ジョブ実行のトリガー）。plan B-7（L212）は「`... / ingestion.created / ...` の case を追加し activity ハンドラへ fan-out」とまとめているが、`ingestion.created` だけは「新規 case」ではなく「既存 case 内で `runIngestionJob` の後に activity ハンドラを足す fan-out」になる。一方 `user.created` / `ingestion.failed` / `export.job.completed` は現状 `default: skipped`（L215-216 で確認）なので純粋な新規 case。両者を取り違えて `ingestion.created` を別 case に二重登録すると to ジョブ実行が壊れる。`note.trashed` の既存 fan-out（search → publication → view → ...）が手本になる。B-7 に「`ingestion.created` は既存 `runIngestionJob` case への fan-out、他は新規 case」と一行補足するとよい。設計の正しさには影響しない軽微事項。
- **[S-002]** `ingestion.created` を burst_log へ projection する際、`runIngestionJob`（同 case の本処理）が `retry` を返した場合の `markProcessed` 未到達と burst_log 二重 insert の相互作用は「自然キー insert なので無害」だが、ADR-005 でその一行を添えると安心。
  - 理由: fan-out 先で `runIngestionJob` が transient error → `retry` を返すと `markProcessed` されず再 dispatch される。その際 burst_log への insert が先に走っていても `ON CONFLICT(event_id) DO NOTHING` で二重行は出ない（まさに方式A の狙い）。すでに ADR-005 の論理で完全にカバーされているが、「fan-out の片方が retry してももう片方の自然キー insert は冪等」と明示すると、実装者が fan-out 順序（activity を先に書くか後に書くか）で迷わない。
- **[S-003]** activity_log 本体の保持方針が未定義（P-001 と同根だが別テーブル）。
  - 理由: `activity_log` は全イベントを 1 行ずつ恒久保持し、表示は `findRecent(limit)` で直近 N 件のみ。行は無限に積もるが表示は抑制されるため UI 上は問題が出にくい。ただし D1 のストレージ・`occurred_at` index のサイズは増え続ける。本 Issue で「直近 N 件しか出さない」と決めた以上、古い行の保持期間（例 90 日）を pruner に足すか、明示的に「無期限保持・別 Issue で TTL 検討」とスコープ宣言するとよい。P-001 の pruner 拡張と合わせて 1 箇所で扱える。

---

#### 良い点

- ADR-005 の再設計が、実コード（`handlers.ts` の `hasProcessed → dispatch → markProcessed` 順、`markProcessed` 前クラッシュ窓）に対する正確な脅威モデルに基づいており、1 周目 P-001 の核心（「加算の冪等単位が eventId ではなく窓キーになる」）を構造的に解消している。`media.uploaded` を含む既存の冪等設計思想（「自然 idempotent な操作のみをハンドラに置く」）とも一貫。
- ADR-006 のコンテナ配線が `search/handleNoteSavedEvent.ts` + `Pick<WorkerContainer, ...>` の実在パターンと寸分違わず、`UnitOfWorkContext` を汚さない判断が CLAUDE.md の UoW 原則（callback が触れるリポジトリを最小に）に正しく沿っている。「1 イベント → 1 行なので UoW 不要」の線引きも適切。
- P-003 の scalar `null` 固定条件が、`createRequestContainer` の単一差し替え点と consumer の spread 継承（差し替え不要）という実配線を正しく踏まえており、「既存 4 metric-card 挙動不変」（#545 一致）を破らない条件が明確。
- 虚偽表示禁止の鉄則（LLM 系列・nightly backup・期間切替/全件導線・実データ 0 と取得失敗 null の区別）が AC・ADR・テスト方針を貫いて一貫適用されており、1 周目から後退していない。
- レビュー履歴節が「修正した点 / 取り込んだ改善 / 見送った提案と理由」に整理され、各指摘の追跡可能性が高い。見送り判断（S-003-arch のイベント生成位置を実装時判断に委ねる）も妥当で、ドメインを不要に重くしない姿勢と整合。
