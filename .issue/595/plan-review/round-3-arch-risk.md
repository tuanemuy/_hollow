# Plan Review — Issue #595 (Round 3: アーキテクチャ整合性・実現可能性・リスク / 最終収束確認)

レビュー対象:
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/plan.md`
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/595/adr.md`

視点: あるべきアーキテクチャとの整合性・実現可能性・リスク。これは 3 周目（最終）の収束確認であり、2 周目指摘の反映確認と新規見落としの有無を見る。

## 2周目指摘の反映確認（実コードと突き合わせ）

- **[2周目 P-001]（`ingestion_burst_log` / `activity_log` の retention・刈り込み経路）: 完全に反映**。
  - **AC-10 新設**（plan L27）: `ingestion_burst_log` 保持 24h・`activity_log` 保持定数（暫定 90 日）を超える行が pruner tick で削除される、を検証可能 AC として確定。「既存 pruner は `outbox_events` のみ対象＝新規テーブルは自動で刈られない」と前提誤りを明記し、保持を切っても直近 N 件表示が壊れないことも条件化。
  - **B-9 新設**（plan L223-226）: pruner エントリ点（`app/worker/cloudflare/pruner.ts` / `pruneOutbox` 相当）に `ingestion_burst_log`（24h）・`activity_log`（`ACTIVITY_LOG_RETENTION_DAYS` 定数）の `pruneOlderThan(cutoff)` を足すと確定。"実装時に確認" ではなく確定スコープに格上げされている（2周目 P-001 提案の核心）。
  - **ADR-005「保持・刈り込み」節**（adr L120-128）: 既存 pruner が `DELETE FROM outbox_events WHERE processed_at < cutoff` のみで `processed_events`・read-model を一切刈らない実態（grep 0 件）を明記。再設計（自然キー 1:1 蓄積）が旧「窓キー加算」方式に無かった無限増大の副作用を生んだ因果を正しく記述。
  - **ADR-007 新設**（adr L167-189）: 両テーブルの保持を 1 箇所（既存 pruner daily tick）に集約。`processed_events` 無刈りはスコープ外（既存運用課題・別 Issue 望ましい）と線引き。
  - **実コード照合**: `pruneOutbox`（`outboxPrune.ts`）は `outboxRepository.pruneProcessed(cutoff)` のみ呼ぶ。`processedEvents` の delete/prune は repositories に 0 件。pruner 実体は `pruner.ts` → `runPruneTick`（`handlers.ts` L84）→ `pruneOutbox` の経路で、B-9 が示すフック点（`runPruneTick` / `pruneOutbox`）と一致。plan・ADR の記述に虚偽なし。retention 値（burst 24h ≥ 窓幅 5 分、activity 90 日）も論理整合。

- **[2周目 S-001]（`ingestion.created` は新規 case ではなく既存 `runIngestionJob` case への fan-out 追加）: 反映**。
  - plan B-7（L213-216）・依存関係（L99）・リスク節（L255）に明記。実コードでは `case "ingestion.created": ... await runIngestionJob(...)`（`dispatchDomainEvent.ts` L146-155）で既に `runIngestionJob` にルーティング済み。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は `default: skipped`（L354）のため純粋な新規 case、という区別も正しい。手本として挙げた `note.trashed` の順次 fan-out（search → publication → view、L211-）も実在。取り違え防止の記述は妥当。

- **[2周目 S-002]（fan-out の片方 retry でも自然キー insert は冪等）: 反映**。
  - ADR-005「fan-out の冪等性」節（adr L118）・plan B-7（L215）に「`runIngestionJob` が `retry` を返しても `ingestion_burst_log` の `ON CONFLICT(event_id) DO NOTHING` insert は冪等で順序非依存」と明記。実装者が fan-out 順序で迷わない記述になっている。

- **[2周目 S-003]（activity_log 本体の保持方針）: P-001 と統合して反映**。ADR-007 で `activity_log` 本体も保持 90 日定数 + pruner 削除に組み込み済み（plan レビュー履歴 L294 で「[arch S-003] = activity_log 本体の保持と統合して扱った」と追跡記録）。

2周目の要修正 1 件・改善提案 3〜4 件はすべて反映され、見送りなし（plan L302-303）。

## 再設計後の整合性（依存方向・レイヤー責務・projection パターン・冪等性）

- **依存方向**: domain（イベント定義）→ application（port / usecase / handler / DTO）→ adapter（D1 repo / provider）→ presentation の内向き順を維持。activity_log を read-model と位置づけドメインエンティティ化しない判断（ADR-001 / 設計 L111-112）は責務分離として正しい。
- **projection パターン**: `search/handleNoteSavedEvent.ts` 系統（`WorkerContainer` 経由・UoW を開かず `insertIfAbsent`）に揃え、`ConsumerContainer = RequestContainer & Pick<WorkerContainer, ...>` に `activityLogRepository` を載せる配線（ADR-006）は実在前例どおり。`UnitOfWorkContext` を汚さない判断は CLAUDE.md の UoW 原則に整合。
- **冪等性**: consumer の `idempotencyStore.hasProcessed`（主防御）+ projection の `event_id` unique 自然キー insert（二重防御、`markProcessed` 前クラッシュ窓カバー）の二重防御。「件数加算等の非冪等操作を持たない」制約（ADR-001 / AC-7）が一貫。read-time 集約（`COUNT(DISTINCT event_id)`）に逃がしたことで加算の非冪等性を構造的に排除しており、再設計は健全。
- **partial-failure 契約**: 時系列フィールドも既存 scalar と同じ「throw せず系列 `null` degrade」に従い、try/catch を provider 内に閉じる。実データ 0 と取得失敗 null を UI で区別（AC-3）。
- **虚偽表示禁止**: LLM 系列のデータ源確定（A-1）・nightly backup を写さない・期間切替/全件導線の非描画・実データ 0 と null の区別が AC・ADR・テストを貫いて一貫。1〜2 周目から後退なし。

---

#### 問題点

問題点ゼロ。

2 周目の要修正 P-001（retention / pruning）は AC-10・B-9・ADR-005 保持節・ADR-007 へ確定スコープとして反映され、S-001 / S-002（fan-out 注記）も plan・ADR・リスク節に明記された。実コード（`outboxPrune.ts` の `outbox_events` 限定削除、`processed_events` 無刈り、`dispatchDomainEvent.ts` の `ingestion.created` = `runIngestionJob` 既存 case、`note.trashed` 順次 fan-out、`runPruneTick` フック点）と突き合わせても plan・ADR の記述に事実誤認はない。再設計後の設計は依存方向・レイヤー責務・既存 projection パターン・冪等性の全てと整合し、新たな見落とし・退行は検出されなかった。収束したと判断する。

---

#### 改善提案

改善提案ゼロ（任意・非ブロッキングの軽微メモのみ、対応不要）。

- 強いて挙げれば、ADR-005 / ADR-007 の retention 定数（burst 24h / activity 90 日）はいずれも暫定値である旨が明記済みで、チューニングは別途と線引きされている。本 Issue の収束には影響しない。実装時に B-9 のフック先が `pruneOutbox` 関数の直後（`runPruneTick` 内）になるか専用 prune 関数を並べる形になるかは定型の範囲で、設計判断としては既に確定している。

---

#### 良い点

- 2 周目 P-001 の「再設計が生んだ新規副作用（自然キー 1:1 蓄積による無限増大）」という因果を、ADR-005 保持節と ADR-007 で正確に言語化し、旧「窓キー加算」方式との増加率の差まで明示している。再設計のトレードオフを隠さず設計に織り込んだ点が良い。
- pruner の実態（`outbox_events` のみ削除、`processed_events`・read-model は無刈り）を grep で確認し、「新規テーブルも pruner が自動で拾う」という暗黙の前提を排した。確認した実コードと plan・ADR の記述が完全に一致しており、信頼できる。
- 刈り込みを既存 pruner daily tick の 1 箇所に集約し、`ActivityLogRepository.pruneOlderThan(cutoff)` を `outboxRepository.pruneProcessed` の定型に倣わせる設計は、運用一元化と実装容易性を両立。
- 冪等の責務分担（consumer 主防御 + 自然キー二重防御、加算禁止）が ADR-001 / ADR-005 / AC-7 を貫いて一貫し、read-time 集約への逃がしで非冪等性を構造的に排除した点が、CLAUDE.md の outbox 契約（at-least-once / consumers must be idempotent）と完全整合。
- レビュー履歴が「修正 / 取り込み改善 / 見送りと理由」で 1〜2 周目とも整理され、各指摘の追跡可能性が高い。最終周として収束を確認できる状態に仕上がっている。
