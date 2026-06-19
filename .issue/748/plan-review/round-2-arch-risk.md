# Plan Review — Issue #748（Round 2 / アーキテクチャ整合性・実現可能性・リスク）

レビュアー視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/748/plan.md` / `.issue/748/adr.md`（レビュー履歴・ADR-006/007/008 追記を含む）
日付: 2026-06-18
前提: Round 1 の P-001〜P-004 が反映されたとの申告。実コードで再裏取りした。

実コードで再検証した主要ファイル:
- `app/core/application/di/serverCloudflare.ts`（`buildLlmProvider` L578-591、`createRequestContainer` L703-707、`createConsumerContainer` / `resolveConsumerLlmConfig` L880-958、`buildSharedDeps` L425-428）
- `app/core/application/ingestion/runIngestionJob.ts`（`runPipeline` free function L273-、`PipelineDeps` L240-259、呼び出し元 L124-140、LLM 呼び出し L346 / L370）
- `app/core/application/ingestion/previewPrompt.ts`（request 路・UoW 無し・`ownerId` 在・`container.clock`/`idGenerator` 在・Stub は catch で `llm_preview_unavailable` 化 L141-143/172-180）
- `app/core/adapters/stub/llmProvider.ts`（`structureToHtml` / `suggestMetadata` ともに必ず throw）
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`（`collectUploadsHourly` L56-97、`substr(created_at,1,13)` bucket L72）
- `app/core/adapters/d1/schema.ts`（`ingestion_burst_log` L848-867: `occurred_at` = `timestamp_ms` + 別 `hour_bucket` text）
- `app/worker/cloudflare/handlers.ts`（`runPruneTick` L91-112: `pruneActivityLog` を単一 try/catch で内包）
- `app/core/application/di/types.ts`（`clock` L98 / `idGenerator` L99 / `llmProvider` L199）

総評: Round 1 の P-001〜P-004 はいずれも**実コードと整合する形で解決**されている。各論点を実コードで個別に裏取りした結果を以下に示す。

## Round 1 指摘の解決検証

- **P-001（consumer 路の記録フック地点）→ 解決**。`runPipeline` は実際に `PipelineDeps` のみ受け取る free function（L273）で `container`/`clock`/recorder/provider 名を持たないことを再確認。plan ステップ 7・設計セクション L64・調査結果 L43・ADR-002 L58 が「`PipelineDeps` に `recorder`/`clock`/`providerName` を追加し、呼び出し元 `runIngestionJob`（L124）が `container.*` から渡す」と明記し、関数構造と噛み合う。LLM 呼び出しは `deps.llm.structureToHtml`（L346, structure 系のみ）/ `deps.llm.suggestMetadata`（L370, 共通パス）の 2 箇所で、html/markdown 分岐は前者をスキップ、空 audio は早期 return（L286-297）で両方スキップ — plan の「structure 2 行 / html・markdown 1 行 / 空 audio 0 行」は実分岐と 1:1 で一致。`ownerId` は `deps.ownerId`（既存 `PipelineDeps` L243）で在る点も整合。

- **P-002（provider 名の真実源）→ 解決**。`buildLlmProvider`（L578-591）が `LLMProvider` インスタンスのみ返し解決名を外に出さないこと、`apiKey`/`model` 欠落時に env の `provider` を無視して `StubLLMProvider` を返すこと（L584）を再確認。ADR-006 / plan ステップ 11 は「`buildLlmProvider` を `{ provider, providerName }` 返却に変更し `createRequestContainer` が `llmProviderName` を container に載せる」と確定しており、env 値を真実源にしない方針が実コードのギャップ（env と実構築のズレ）と整合する。consumer 路は `resolveConsumerLlmConfig`（env override > DB, L884）の解決名を `runPipeline` 引数へ届ける方針で、これも妥当。

- **P-003（Stub 非記録）→ 解決（かつ実コードがより強く保証）**。`StubLLMProvider` は `structureToHtml`/`suggestMetadata` の**両方が必ず throw**する（`stub/llmProvider.ts` L26-40）ことを確認。記録地点が「成功直後」である限り、request 路（catch で `llm_preview_unavailable` 化 L172-180）・consumer 路（throw でジョブ失敗、成功路に到達しない）のいずれも Stub は構造的に記録されない。plan AC-1 但し書き・ADR-002 L60 の「Stub 非記録」は実コードで自然に成立する（consumer 路の「Stub 判定で recorder をスキップ」は belt-and-suspenders であり、害はない — S-001 参照）。

- **P-004（bucket 方式）→ 解決**。`ingestion_burst_log.occurred_at` が `integer(... { mode: "timestamp_ms" })` で別 `hour_bucket` text を持つ（schema.ts L856-857）こと、`uploadsHourly` のみが `ingestion_jobs.created_at`（ISO8601 text）に `substr(...,1,13)` を当てる（usageMetricsProvider.ts L72）ことを再確認。ADR-007 / plan ステップ 2・5・リスク欄 L159 は「`llm_call_log.occurred_at` は ISO8601 text にして `uploadsHourly` と同じ substr bucket を流用、ingestion_burst_log 同型（ts_ms + 別 hour_bucket）は採らない」と一意に確定し、旧調査の誤記述も訂正済み。`collectUploadsHourly` のロジック流用は実コード上そのまま成立する。

---

#### 問題点（要修正）

問題点ゼロ。

Round 1 の 4 件は実コードと整合する形で解決され、新たなアーキテクチャ違反・依存方向逆転・ドメインロジック漏れは検出されなかった。ヘキサゴナル/DDD の依存方向（ポート/型 → schema → adapter → provider → usecase → UI → DTO → pruner → DI → test）に沿い、read-model としての位置づけ（新ドメイン概念・不変条件を増やさない）も #595 の activity_log と同格で妥当。read=provider / write・prune=recorder の責務分離（ADR-003）、`event_id` unique 撤廃（ADR-008）、独立 try/catch による prune の failure isolation（ADR-005, `runPruneTick` L104-110 の現状単一 try/catch を実コードで確認）はいずれも整合的。

#### 改善提案（検討推奨）

- **[S-001]** consumer 路の「Stub 判定で recorder をスキップ」は冗長で、判定情報を `PipelineDeps` に持ち込むと逆に複雑化する恐れ
  - 理由: `StubLLMProvider` は両メソッドが必ず throw する（`stub/llmProvider.ts` L26-40）。記録を「`deps.llm.*` の成功直後（await が解決した後）」に置く限り、Stub は throw して記録地点に到達しないため、Stub 非記録は記録地点の配置だけで構造的に保証される。plan ステップ 7 / ADR-002 L60 が要求する「provider が Stub なら recorder をスキップ」は、そのために Stub 判定フラグ（`providerName === "stub"` 等）を `PipelineDeps` に追加で持ち回す実装を誘発しうる。これは P-002 の「Stub フォールバック時の `providerName` 値は記録に使われない」（ADR-006 L144）と相まって、不要な分岐を増やす。実装時は「記録は成功直後のみ・Stub は throw で到達しない」を主たる保証とし、明示的 Stub 判定は**入れない**選択を検討する価値がある（plan の記述は害ではないが、実装をシンプルに保てる）。

- **[S-002]** consumer 路で `resolveConsumerLlmConfig` が `null` を返す場合の providerName の出所を 1 行明記すると実装の迷いが消える
  - 理由: `createConsumerContainer`（L884-942）は `resolved === null` のとき `llmOverrides` を空にし、request container の LLM provider（env-only `buildLlmProvider`、Stub の可能性あり）を spread 継承する（L932-934）。この経路では「`resolveConsumerLlmConfig` 解決結果由来の provider 名」が存在しない。plan は ConsumerContainer が RequestContainer を spread 継承する前提なので、`llmProviderName` も同様に request 側の値が継承され破綻しない（=整合的）が、ADR-006 の本文は「consumer 路 = resolved config 由来」とだけ書くため、`resolved===null` フォールバック時の出所（request 側継承）を 1 行補えば実装時の判断が一意になる。なお、その経路は実 provider が Stub になりがちで、Stub は throw して記録に到達しないため、実害は限定的。

- **[S-003]** `runIngestionJob` の LLM 呼び出しは `runPipeline` 内（呼び出し元 `runIngestionJob` L124 の try ブロック内で呼ばれる free function 内）にあるため、記録 try/catch は `runPipeline` 内に閉じること
  - 理由: plan ステップ 7 は記録を「各 `deps.llm.*` 成功直後に try/catch best-effort」と正しく置いている。実コードでは `runPipeline` の throw は呼び出し元 L123 の `try` で受けてジョブを失敗させる（L141 以降の catch 系）。記録の best-effort try/catch を `runPipeline` 内の各呼び出し直後に局所配置すれば、記録失敗が `runPipeline` の戻り値・ジョブ遷移に一切波及しない（AC-5）。これは plan の記述通りで問題ないが、「記録の握り潰しは `runPipeline` 内の局所 try/catch で行い、`runPipeline` の throw 経路（本処理失敗）と混同しない」ことをテスト方針に 1 項足すと、AC-5 のリグレッションを防ぎやすい。

#### 良い点

- **P-001〜P-004 の解決がいずれも実コードの事実と一致**。特に P-001（`runPipeline` free function への `PipelineDeps` 拡張）と P-004（`occurred_at` を ISO8601 text にして `collectUploadsHourly` の substr bucket を流用）は、実装時の流用元コード（`usageMetricsProvider.ts` L56-97）まで含めて噛み合っている。
- **P-003 の解決が実コードにより一段強く担保される**。`StubLLMProvider` の両メソッド必ず throw（`stub/llmProvider.ts`）により、「記録は成功直後のみ」という配置だけで Stub 非記録が構造的に保証され、虚偽表示禁止（AC-4）と矛盾しない。ADR-002 の「実際の LLM 呼び出しを記録」という核心が、特別な除外集計なしで成立する。
- **read/write 責務分離（ADR-003）が既存パターンに忠実**。`D1UsageMetricsProvider` は constructor で `db` を直接持ち `collectUploadsHourly` を provider 内に直接書く（L56-97）ので、`collectLlmCallsHourly` を同じ場所に置き recorder ポートを read で汚さない判断は既存構造と一致。同じ集計の二重定義リスクを避けられる。
- **prune の failure isolation（ADR-005）が実コードの構造的弱点を正しく突いている**。`runPruneTick`（L91-112）は `pruneActivityLog` を単一 try/catch で内包しており、相乗りすると逐次 await で片方の失敗がもう片方をスキップさせ得る。独立 try/catch ブロックで `pruneLlmCallLog` を呼ぶ確定（plan ステップ 10）は failure isolation の観点で正しい。
- **provider 真実源の修正（ADR-006）が env と実構築のズレという実コードの罠を正確に回避**。`buildLlmProvider` L584 の Stub フォールバックにより env `ADMIN_LLM_PROVIDER` が実 provider と一致しないケースを、名前付き返却で根本解決する設計は妥当。
- **依存方向・ドメイン非汚染・DI 配置（`D1ActivityLogRepository` 前例の RequestContainer/WorkerContainer 両載せ + ConsumerContainer spread 継承）**が一貫して #595 の確立パターンに揃っており、実現可能性が高い。

---

## 結論

Round 1 の要修正 4 件（P-001 consumer 経路の記録フック / P-002 provider 名真実源 / P-003 Stub 非記録 / P-004 bucket 方式）は、いずれも実コードで裏取りした結果、**実コードと整合する形で解決**されている。新たなアーキテクチャ違反・依存方向逆転・ドメインロジック漏れは検出されなかった。問題点ゼロ。S-001〜S-003 は実装時にシンプルさ・一意性を高めるための任意の磨き込みであり、計画の承認を妨げるものではない。
