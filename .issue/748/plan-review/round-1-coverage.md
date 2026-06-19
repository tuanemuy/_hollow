# Plan Review Round 1 — Issue #748（視点: Issue要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/748/plan.md` / `.issue/748/adr.md`
レビュアー視点: Issue本文の合意要件が受け入れ基準に漏れなく落ち、各基準が検証可能で、実装ステップと正しく紐づき、スコープ外作業が混入していないか。

---

## 要件マッピング（Issue本文「やること」4点 → 受け入れ基準）

| Issue「やること」 | 対応 AC | 落ちているか |
|---|---|---|
| 1. LLM 呼び出しを永続記録するデータ源を新設（owner / provider / occurredAt 保持） | AC-1 | ◎ 落ちている。owner / provider / occurredAt の 3 フィールド明示。preview / ingestion 両経路カバーも明記。 |
| 2. `D1UsageMetricsProvider` を拡張し LLM hourly 時系列を返す（UTC hourly bucket・24本0埋め・partial-failure null degrade） | AC-2 | ◎ 落ちている。アップロード系列と同型の 4 条件すべて基準文に明記。 |
| 3. scalar `llmCallsToday` の実装可否を検討 | AC-3（+ ADR-004） | ◎ 落ちている。「検討」を超えて「実装する」と確定し、ADR-004 で理由（虚偽表示禁止整合）を述べている。検討要件を満たしたうえで結論まで出しており妥当。 |
| 4. P40 Dashboard「直近 24 時間」に LLM 系列を追加（虚偽表示禁止: 実データ一致） | AC-4 | ◎ 落ちている。系列 null→『取得失敗』、0件→平坦線、scalar 実数表示まで検証条件化。 |

4点すべてが受け入れ基準に落ちている。加えて AC-5（best-effort で本処理を壊さない）/ AC-6（pruner 刈り込み）/ AC-7（他 scalar 不変）は ADR から導出された派生要件で、いずれも妥当な補完。

---

## コード照合で確認した事実（計画の前提の正しさ）

- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`: `collectUploadsHourly()` が UTC `substr(created_at,1,13)` bucket・24本0埋め・try/catch null degrade で実装済み。scalar は `llmCallsToday` 含め全て `null` 固定。JSDoc に「LLM calls have no persistent record source」と明記 → 計画の「同型追加」前提は正しい。
- `app/core/application/ports/usageMetricsProvider.ts`: `UsageMetricsSnapshot.llmCallsToday: number | null` 既存、`uploadsHourly` あり、`NullUsageMetricsProvider` あり → 計画のフィールド追加箇所は正確。
- `app/components/admin/Dashboard/index.tsx`: 「直近 24 時間」は現状 1 カラム固定（296行）、LLM 系列非描画コメント（293-295行）、scalar LLM カードは `null`→『取得失敗』（281行）。計画の「2 カラムへ戻す・コメント撤去・scalar はロジック変更最小で実数反映」はすべて実コードと一致。
- call-site: `previewPrompt.ts`（UoW 無し・`actorUserId` 在・metadata/structure 2 分岐）、`runIngestionJob.ts` の `runPipeline`（`structureToHtml` / `suggestMetadata` 呼び出し・`ownerId` 在）→ 計画の記録挿入位置の前提は正しい。
- 先例 `ingestion_burst_log`（schema.ts 848行〜: id/event_id unique/owner_id/occurred_at(ts_ms) + occurred_at index）、`pruneActivityLog.ts`（`INGESTION_BURST_LOG_RETENTION_HOURS` 定数 + `pruneBurstOlderThan(cutoff)` + daily tick + logger）→ 計画の「同型再利用」は実在パターンに基づく。
- 最新 migration は `0019_ingestion_jobs_created_at_index.sql` → 計画の「`0020` 採番」は正しい。
- DI: `buildLlmProvider(provider, apiKey, model, baseURL)` は `LLMProvider` インスタンスのみを返し、provider 名は返さない。API key/model 欠落時は `StubLLMProvider` を返す（serverCloudflare.ts 577-590行）→ 計画/ADR が指摘する「provider 名引き回し配線が必要」「stub 時の記録要検討」はいずれも実コードの構造に基づく正当な懸念。

計画の事実前提に虚偽・誤りは見つからなかった。

---

## 問題点（要修正）

問題点ゼロ。

Issue「やること」4点はすべて検証可能な受け入れ基準に落ちており、各基準は実装ステップと正しく紐づき（AC↔ステップの対応表が双方向で整合）、スコープ外作業の混入も無い。スコープの「含まれないもの」5項目（provider 別系列描画 / 他 scalar の D1 実装 / token・コスト記録 / 期間変更導線 / `llm.called` イベント新設）はいずれも Issue 本文・派生元 #595 ADR と整合し、要件を削らずに拡張だけを抑える正しい線引き。

---

## 改善提案（検討推奨）

- **[S-001]** AC-1 の「両経路」検証を、ステップ 6/7 の分岐網羅まで基準文に織り込むと取りこぼし防止になる。
  - 理由: AC-1 は「preview / ingestion 両経路」と書くが、`previewPrompt` には metadata / structure の 2 分岐があり（計画ステップ6で「両分岐をカバー」と書かれている）、`runPipeline` には `structureToHtml`（html/markdown 分岐ではスキップ）と `suggestMetadata`（共通パス）の 2 呼び出しがある。「1 プレビュー = LLM 1 呼び出しで 1 行」なのか「LLM API 呼び出し回数（structure の場合 structureToHtml + suggestMetadata で 2 回）で 2 行」なのか、AC-1 の「1 呼び出し 1 行」の粒度が曖昧。テスト方針では owner/provider/occurredAt の検証はあるが「1 プレビューで何行記録されるか」の期待値が未定義。実装者が記録粒度（API call 単位 vs ユーザ操作単位）を 1 つに確定し、AC-1 か テスト方針に「structure プレビュー時の期待行数」を明記すると、scalar `llmCallsToday`「回 / 24h」の意味（API 呼び出し回数なのかプレビュー操作回数なのか）がブレない。虚偽表示禁止の観点でカードラベル「回」の定義に直結する。

- **[S-002]** stub provider 時の記録方針が「リスクと注意点」止まりで、AC に昇格していない。
  - 理由: 計画リスク節と ADR-002 は「StubLLMProvider（未設定時）は実 LLM 呼び出しではないので記録すべきか要検討（推奨: 記録しない）」とするが、これは scalar/系列の数値が実態と合うかに直結する観点（LLM 未設定インスタンスで preview を叩くと『取得失敗』ではなく「実数 0 でない値」が出ると、虚偽表示禁止 AC-4 と緊張する）。テスト方針には「stub provider 時の記録方針が意図どおり」とテスト項目はあるので検証はされるが、「stub 呼び出しは記録しない（または provider='stub' を集計除外）」を AC-1 の但し書きとして明文化すると、AC-4 の「実データに一致」との整合が基準レベルで担保される。

- **[S-003]** AC-6 の保持期間が ADR-005 で「暫定 24h、数日も可」と未確定のまま AC に「保持期間超過行を刈られる」とだけ書かれている。
  - 理由: 検証可能性の観点で、保持期間が未定だと「超過行が刈られる」境界テスト（テスト方針の cutoff 前後）の期待値が定まらない。表示窓は 24h 固定なので、保持を 24h にすると「直近 24h ちょうどの境界行」が表示窓と刈り込み窓で競合し得る（pruner daily tick のタイミング次第で表示対象がわずかに欠ける可能性）。実装時に「表示窓 24h < 保持期間」を満たす値（例: 48h）に確定する旨を AC-6 か ADR-005 Decision に固定すると、表示の欠落リスクと境界テストの期待値が両方確定する。スコープは増えない（定数 1 個の値決め）。

---

## 良い点

- Issue 本文「やること」4点が受け入れ基準表に 1:1 で漏れなく落ち、各基準が「由来」列で Issue 文言・ADR に逆引きでき、「対応ステップ」列で実装と双方向に紐づいている。カバレッジ追跡が非常に明快。
- AC-3 が Issue の「実装可否を検討する」という曖昧要件に対し、「実装する」結論 + ADR-004 の根拠（データ源があるのに『取得失敗』を出し続ける方が虚偽）まで踏み込んでおり、検討要件を形式でなく実質で満たしている。
- スコープ「含まれないもの」5項目がいずれも要件を削らず拡張のみを抑える線引きで、特に「他 scalar は不変（AC-7）」「`llm.called` イベント新設しない（ADR-002）」が #595 ADR-002 / UoW 原則と明示的に整合しており、スコープ膨張・原則逸脱の両方を予防している。
- 派生元 #595 の「データ源不在で意図的に保留」を「乖離ではなく保留解消」と正しく位置づけ、既存パターン（アップロード系列・ingestion_burst_log・pruner）の忠実な踏襲を一貫方針にしている。新規発明を最小化し既存の確立パターンに寄せる設計で、要件を満たしつつリスクが低い。
- リスク節が occurred_at 型差（ts_ms vs ISO substr）・provider 名引き回し・best-effort 取りこぼし・migration 番号衝突・Dashboard レイアウト回帰（#749 干渉）まで網羅し、いずれも実コードで裏が取れる実在の論点。
