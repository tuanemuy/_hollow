# 実装計画 — Issue #109: queue consumer の processing 中断ジョブが自動再走できない（LLMRateLimitError 後の塩漬け）

**Issue:** #109
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

Issue #57 (PR #108) で queue consumer から `runIngestionJob` を dispatch する配線が入ったが、構造的バグが残っている。

`runIngestionJob` の entry guard は `IngestionJob.isPending` 固定（`app/core/application/ingestion/runIngestionJob.ts:69`）。1回目の配信で `pending → processing` を commit してから pipeline 内で `LLMRateLimitError` を rethrow すると、idempotency stamp は post-dispatch化で残らないが、redelivery 時に `isPending` ガードで no-op に縮退し、ジョブが `processing` のまま塩漬けになる。

つまり #57 ADR-005 で謳う「`LLMRateLimitError` → retry（rate limit 解消で自然回復）」は ingestion path では成立せず、`max_retries → DLQ → admin 手動 retry` に必ず倒れる。本 Issue でこの「既知の限界」を解消し、`LLMRateLimitError` で中断された ingestion job が redelivery で自動再走できるようにする。

## スコープ

### 含まれるもの

- `runIngestionJob` の pipeline catch 内で、`LLMRateLimitError` を rethrow する**前に** `processing → pending` への state rollback を行う（選択肢2を採用）
- domain（`IngestionJob`）に `processing → pending` の rollback 遷移を追加
- dispatch / handler の「既知の限界」コメント（JSDoc）を新しい挙動に合わせて更新
- `.issue/109/adr.md` に設計判断を記録
- domain ユニットテスト + integration test（自動再走の E2E 証明） + 既存 regression guard テストの反転更新

### 含まれないもの

- domain に「rate-limited で中断」の新状態を追加する案（選択肢1）— `startProcessing`/`isPending` の不変条件に広く波及し、#253 ADR-001 で「最もリスキー」として却下済み
- cron safety net（選択肢3）— 本 Issue に対しインフラ過剰。新 scheduled worker / wrangler cron / lease 設計が必要で、コストに見合わない
- `LLMTimeoutError` / `LLMUnavailableError` など他の transient LLM エラーの扱い変更 — 現状 `markFailedSafely` で `failed` に畳まれ、admin retry path で回復する。本 Issue は `LLMRateLimitError` のみ対象
- `runExportJob` の挙動変更 — 内部 catch で `LLMRateLimitError` を rethrow しないため同等問題が無い。design 一貫性は確認するが変更不要
- queue の retry / DLQ 挙動、stamp 順序（#57 ADR-003）の変更 — 不変

## 採用方針: 選択肢2（`processing → pending` state rollback）

### 3案のトレードオフ比較

| 観点 | 案1: `isPending` ガード緩和 | 案2: rollback `processing → pending` | 案3: cron safety net |
|---|---|---|---|
| domain 状態機械への影響 | `startProcessing` の不変条件破壊 / 新状態 or ガード緩和が必要 | `processing → pending` 遷移を1つ追加するのみ。`startProcessing`/`isPending` 無変更 | domain 変更なし |
| 「中断 processing」vs「正常 processing 中」の区別 | **区別不能**。型で表現できない | rollback 後は `pending` なので区別不要。既存セマンティクスと一致 | N分閾値で推測するのみ。誤巻き戻しの窓が残る |
| 楽観ロック相互作用 | 再エントリと正常処理が同一 `processing` 版で競合し得る | rollback は `save(expectedVersion)` 1トランザクション。retry/regenerate と同じ。OCC 安全 | cron と consumer が同一行を奪い合う |
| `regenerated` / admin retry との一貫性 | 不整合 | **完全一致**（#253 ADR-001 の `→ pending` パターン踏襲） | 別機構で一貫しない |
| 実装コスト・テスト容易性 | 高（再エントリ semantic に広く波及） | 低（domain 1遷移 + usecase catch 1分岐） | 高（新 worker + cron + 新 usecase + lease） |

**採用: 案2。** #253 ADR-001 が確立した「再処理が必要なら `→ pending` に戻して `runIngestionJob` の `isPending` 入口に合流させる」パターンと完全に一貫し、「中断 processing と正常 processing の区別」問題が消え、波及が最小。詳細は `adr.md` ADR-001。

### 再駆動の経路: queue `message.retry()` 一本化（イベント emit なし）

rollback 後の再駆動を「新イベントを outbox 経由で再 dispatch」する案と、「queue の `message.retry()` 一本に任せる」案がある。**後者を採用**する:

- `LLMRateLimitError` は dispatch 側で引き続き `retry` outcome に分類され `message.retry()` が呼ばれる。stamp は残らないので redelivery で再 dispatch され、`pending` を見て自動再走する。
- 新イベントも emit すると、outbox 経由と queue redelivery の2経路で再 dispatch され二重駆動になる（`isPending` + OCC で機能上は冪等だが UoW を余分に開く）。
- よって rollback 遷移では**新イベントを emit しない**。詳細は `adr.md` ADR-002。

## 実装ステップ

### 1. domain に `processing → pending` の rollback 遷移を追加

- **対象ファイル:** `app/core/domain/ingestion/entity.ts`
- **変更内容:** `ProcessingIngestionJob → PendingIngestionJob` を返す private 関数 + 公開メソッド `rollbackToPending(job, now)` を追加。`startProcessing` と対称に `version` を進め `updatedAt` を更新、`preview/errorCode/errorReason/savedAsNoteId` は null（既に null）、**`tempStorageKey` はスプレッドで保持**（再走に必須）、`regenerationCount` は保持（cap を回避させない）。公開メソッドのガードは `status !== "processing"` で `BusinessRuleError(InvalidStateForRollback)`。**イベントは emit しない**（`eventDrafts: []`。ADR-002 参照）。
- **理由:** 中断した `processing` ジョブを既存の `isPending` 入口に正規遷移で戻す唯一の手段。型で `processing` 限定にし illegal states を排除。

### 2. errorCode に rollback 用の状態遷移ガードコードを追加

- **対象ファイル:** `app/core/domain/ingestion/errorCode.ts`
- **変更内容:** `InvalidStateForRollback`（値は `lower_snake_case`、`BusinessRuleError` の spec 文言と一致）を追加。CLAUDE.md の `*ErrorCode` 命名規約に従う。
- **理由:** rollback 遷移のガード違反を既存パターンに合わせて表現するため。

### 3. `runIngestionJob` の catch で rethrow 前に rollback を実行

- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **変更内容:** `if (isLLMRateLimitError(error)) { throw error; }`（150-153行目）を、UoW 内で `findById → isProcessing ガード → rollbackToPending → save(expectedVersion)` を実行してから rethrow する形に変更。`isProcessing` でなければ（並行遷移済み）rollback をスキップして rethrow のみ。rollback の save が万一 throw しても元の `LLMRateLimitError` を rethrow して retry outcome を維持（try/catch でラップ）。**rollback save が D1 一時障害等で失敗した場合は `logger.warn` で観測可能にする**（`markFailedSafely` が永続化失敗を logger で記録するのと整合させ、ADR-002 が認める「rate-limit 自動 rollback の観測手段なし」の代替観測点とする）。
- **理由:** stamp は依然 post-dispatch で残らず、次回 redelivery が `pending` を見て自動再走する。dispatch 側は引き続き `LLMRateLimitError → retry` で `message.retry()` を呼ぶ。

### 4. dispatch / handler の「既知の限界」コメントを更新

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`（`Error classification` セクションの `LLMRateLimitError → retry ... ADR-003「既知の限界」` 記述）、`app/worker/cloudflare/handlers.ts`（"Known limitation" JSDoc の rate-limit 限定記述）
- **変更内容:** 「`processing` 状態からは再走不能、DLQ → admin 手動 retry に倒れる」記述を、「rate limit 中断時は `runIngestionJob` が `processing → pending` に rollback し、redelivery（queue retry）で自動再走する（Issue #109 ADR）」に更新。
- **切り分け（重要）:** `handlers.ts` の JSDoc は手前に「`isPending`/OCC 二重防御」の一般論があり、その直後に rate-limit 限定の限界記述が続く。**rate-limit 限定の部分だけ**を書き換え、一般的な二重防御の記述・無関係な DLQ コメントは残す（段落丸ごと削除しない）。`dispatchDomainEvent.ts` も `ingestion.regenerated` 周辺ルーティングコメントには触れず、`Error classification` の該当行のみ更新する。
- **理由:** #57 ADR-003 の旧「既知の限界」を記述したコメントが残ると実態と乖離するため。

### 5. ADR を新規作成

- **対象ファイル:** `.issue/109/adr.md`
- **変更内容:** 3案比較と案2採用（ADR-001）、再駆動の queue retry 一本化判断（ADR-002）、`processing → pending` 遷移の domain 追加とイベント非 emit の判断を記録。#57 ADR-003 / #253 ADR-001 との関係（旧「既知の限界」を解消したこと）を明記。

## 設計判断

詳細は `adr.md` 参照。要点:

- **ADR-001:** 3案のうち案2（state rollback）を採用。#253 ADR-001 パターン一貫性・状態区別問題の消滅・最小波及。
- **ADR-002:** 再駆動は queue `message.retry()` 一本化。rollback 遷移はイベントを emit しない（二重駆動回避）。

## リスクと注意点

- **rollback save の OCC 失敗:** rollback の `save(expectedVersion)` が並行遷移（discard/markFailed 等）と競合し得る。rollback の UoW 内で `findById` し直して `isProcessing` を再確認し、非 processing なら skip。失敗時は元の `LLMRateLimitError` を rethrow して retry outcome を維持する。
- **rollback ループ:** rate limit が長時間未解消だと「rollback → 再走 → rate limit → rollback」を繰り返すが、queue の `max_retries` 超過で最終的に DLQ に隔離されるため無限ループにはならない（#57 ADR-005 の意図挙動と一致）。`regenerationCount` とは別軸なので cap には影響しない。
- **`tempStorageKey` の保持:** rollback 後の再走に `tempStorageKey` が必須。`processing` 中は保持されているので、rollback 遷移でスプレッドして誤って null 化しないこと。
- **`runExportJob` 非対称:** export 側は内部 catch で `LLMRateLimitError` を rethrow しないため同等問題が無い。design 一貫性の観点でも、export は「中断したら failed に畳む」ので rollback 不要であることを確認済み。

## テスト方針

- **domain ユニットテスト**（`app/core/domain/ingestion/__tests__/entity.test.ts` / `entity.property.test.ts`）:
  - `rollbackToPending`: `processing → pending` で version+1、preview/error null、`tempStorageKey`/`regenerationCount` 保持、`eventDrafts` 空。
  - 非 `processing` 状態からの rollback は `BusinessRuleError(InvalidStateForRollback)`。
  - property test に「rollback 後は再び `startProcessing` で `processing` に進める」往復不変条件を追加。あわせて `startProcessing → rollbackToPending → startProcessing` で **version が単調増加（+1, +1, +1）** することも検証する（OCC 健全性の核心）。
- **integration test（最重要・自動再走の証明）**（`app/worker/cloudflare/__tests__/handlers.integration.test.ts` の「既知の限界 regression guard」テストを反転更新）:
  - 1回目配信: `suggestMetadata` に `LLMRateLimitError` を注入 → retry outcome + stamp なし（既存 assert 維持）。
  - **変更点:** 1回目配信後のジョブ status を `processing` ではなく **`pending`** に assert（rollback の証明）。
  - **redelivery:** stamp なしで再 dispatch → `isPending` 通過 → LLM が再度呼ばれる。2回目は **`suggestMetadata` モックを成功側に差し替え**（`mockClear` ではなく `mockResolvedValueOnce` / `mockReset`+成功実装。kind=html では pipeline が `suggestMetadata` のみ呼び `structureToHtml` は呼ばないため、この1モック差し替えで `previewing` 到達可能）、最終 status が **`previewing`** に到達して stamp + ack されることを assert（自動再走の E2E 証明）。既存テストは R2 binding 経由でバイトを seed 済みなので、同一 `tempStorageKey` から再読込できる。
  - テスト名・コメントを「既知の限界」から「LLMRateLimitError 後の自動再走（Issue #109）」へ書き換え。
- 最後に `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test`。

## レビュー履歴

### 1周目: 両視点とも承認（問題点ゼロ相当）で終了

**要件カバレッジ視点:** 問題点ゼロ。Acceptance Criteria 3項目すべてカバー、スコープ外混入なしを確認。

**アーキ・リスク視点:** 致命的問題ゼロ。P-001 は「rollback skip 時の収束経路が ADR に未明記で誤読の余地」という明確化指摘（実害なし）。

**反映した修正・改善提案:**
- ADR-001 Consequences に「rollback skip / save 失敗時の収束経路（`handled` で drain / 二段構え rollback / DLQ 隔離で無限化しない）」を追記（P-001 / S-001）。
- 実装ステップ4を具体化: `dispatchDomainEvent.ts` は `Error classification` セクションの該当行のみ、`handlers.ts` は rate-limit 限定の JSDoc 部分のみ更新し、一般的な二重防御記述・DLQ コメント・regenerate ルーティングコメントには触れない切り分けを明記（S-001 / S-003）。
- 実装ステップ3に「rollback save 失敗時は `logger.warn` で観測可能にする」を追記（S-001）。
- テスト方針に property test の version 単調増加検証を追加（S-002）。
- integration test の redelivery 手順を具体化: `suggestMetadata` モックを成功側に差し替え（`mockResolvedValueOnce`/`mockReset`）、kind=html では `suggestMetadata` のみ呼ばれること、R2 binding 経由の seed で同一 tempStorageKey から再読込できることを明記（S-002）。

**見送った提案:** なし（全提案がスコープ内の妥当な明確化のため取り込み）。
