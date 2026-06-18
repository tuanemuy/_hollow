# PR #760 レビュー（Round 2 / フルレビュー・ゼロベース）

レビュー観点: Application / Use Case
対象: PR #760 最新差分（Round 1 修正反映済み）/ `.issue/748/plan.md` / `.issue/748/adr.md`
日付: 2026-06-18

検証した主要ファイル:
- `app/core/application/llmCallLog/ports.ts` / `types.ts`
- `app/core/application/ingestion/previewPrompt.ts` / `runIngestionJob.ts`
- `app/core/application/adminSettings/getUsageMetrics.ts`
- `app/core/application/ports/usageMetricsProvider.ts`
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts` / `llmCallLogRecorder.ts`
- `app/core/application/workers/pruneLlmCallLog.ts` / `app/worker/cloudflare/handlers.ts`
- `app/core/application/di/serverCloudflare.ts` / `di/types.ts`
- 関連テスト（previewPrompt / runIngestionJob / pruneLlmCallLog / usageMetricsProvider / serverCloudflare）

総評: Application 層は plan / ADR に忠実で、依存方向（presentation → application → domain、adapter は port 実装）に違反なし。新概念をドメインに持ち込まず read-model として位置づける判断は #595 の activity_log と同格で妥当。`LlmCallLogRecorder` の write/prune 限定（read は provider に閉じる, ADR-003/arch[S-001]）、best-effort 局所 try/catch、Stub の構造的非記録、記録粒度 2/1/0、ISO8601 text 統一の bucket 流用、provider 名の真実源を `buildLlmProvider` 解決名に寄せる配線（3 経路）、Round 1 W-001 を受けた `windowStartIso()` 統一（`scalar === sum(series)`）— いずれも設計どおりに実装され、テストでも検証されている。**Blocker なし。** 以下は Warning 1 / Note 4。

---

### Application / Use Case

#### Blockers

なし。

#### Warnings

- **[W-001] `collect()` 内で `clock.now()` が複数回呼ばれ、時刻が hour 境界を跨ぐと `scalar === sum(series)` が崩れる**
  - 場所: `app/core/adapters/d1/repositories/usageMetricsProvider.ts`（`collect()` L44-58、`windowStartIso()` L100-105、`fillBuckets()` L117、`collectLlmCallsToday()` L141-152）
  - 理由: `collect()` は `collectLlmCallsHourly()` → `collectLlmCallsToday()` を逐次 await し、各メソッドが独立に `this.clock.now()`（`SystemClock` = `new Date()`、`ports/clock.ts`）を読む。さらに `collectLlmCallsHourly()` 内では `windowStartIso()`（WHERE 句生成）と `fillBuckets()`（bucket 列挙）が**別々に** `clock.now()` を読む。これら複数の now() の間に実時刻が次の hour に進むと、(a) 系列の WHERE 下限と bucket 列挙基準点がずれ、(b) 系列の window と scalar の window がずれる。ADR-004 / クラス JSDoc（L20-23）が「`scalar === sum(series)`」をダッシュボードの依存契約として謳っているが、その不変条件が「now() が単一」という暗黙前提に依存しており、コード上は保証されていない。発生確率は hour 境界の極短時間に限られるが、まさに 0 件/数件の境界時刻で 1 時間ずれた合計不一致が観測者に見える（Round 1 W-001 がこの不一致を是正した狙いと同種の穴が残る）。
  - 提案: `collect()` の冒頭で `const now = this.clock.now()` を 1 度だけ確定し、`windowStartIso(now)` / `fillBuckets(rows, now)` / `collectLlmCallsToday(now)` に渡す（`floorToHourUtc(now)` 起点を全経路で共有）。これで「単一スナップショット時刻」を構造的に保証でき、ADR-004 の不変条件が暗黙前提でなくコードで担保される。アップロード系列も同 now を共有すれば 2 系列の bucket 境界一致（テスト方針の主眼）も TOCTOU から解放される。

#### Notes

- **[N-001] 記録境界での `ownerId as string` / `provider` 受け渡しは型の穴を 1 点に閉じているが、owner の妥当性検証は recorder に委ねられていない**
  - 場所: `previewPrompt.ts` L116（`ownerId: ownerId as string`）、`runIngestionJob.ts` L312（`ownerId: deps.ownerId as string`）、`llmCallLogEntry`（`types.ts` L29-34、`ownerId: string`）
  - 理由: `LlmCallLogEntry.ownerId` が裸の `string`。preview 路は `IdentityUserId.create(input.actorUserId)` を通した branded 値を `as string` で剥がし、consumer 路は `promoted.ownerId`（既に branded `UserId`）を剥がして渡す。いずれも上流で VO 化済みなので実害はなく、read-model の append なので不変条件もないが、「記録される owner は妥当な UserId」という制約は型に乗っていない。これは plan / ADR-009 が `provider` についてのみ `LLMProvider` union で型保証した（良い判断）のと非対称。
  - 提案（任意）: 影響は軽微。現状維持で可。気になるなら `LlmCallLogEntry.ownerId: UserId`（branded）にして call-site の `as string` を撤去すると、`provider` と同じく「記録値は VO 取りうる値」が型で揃う。スコープ拡大に値するかは要判断。

- **[N-002] consumer 路 `resolveConsumerLlmConfig === null` 時の `llmProviderName` 継承が ADR-006 arch[S-002] どおりだが、Stub 名（"anthropic" 既定）が記録されないことは「Stub が throw する」前提に依存する**
  - 場所: `serverCloudflare.ts` L904-941（`llmOverrides` 三項）、L959-969（spread 継承）、`buildLlmProvider` L594-596（Stub でも `providerName = provider ?? "anthropic"` を返す）
  - 理由: `resolved === null` のとき `llmOverrides` が空 `{}` になり、ConsumerContainer は requestContainer の `llmProviderName`（env-only `buildLlmProvider` の解決名、API key/model 欠落時は Stub だが名前は "anthropic" 等）を継承する。この名前は「実構築 provider が Stub なのに 'anthropic' を指す」乖離値だが、ADR-002 どおり Stub は `structureToHtml`/`suggestMetadata` で必ず throw → `recordLlmCall` 地点に到達しないため記録されず、実害は出ない。設計は正しく、ADR-006 / arch[S-002] にも明記済み。
  - 提案: 対応不要。ただし「`llmProviderName` の正しさは記録地点が throw 後にある配置に依存する（名前単独では Stub と実 provider を区別しない）」という結合は、将来 recorder を別地点から呼ぶ改修時の落とし穴。`recordCall` の JSDoc か `llmProviderName` の型コメントに「Stub フォールバック時もダミー名を持つ — 非記録は呼び出し配置で保証」を 1 行残すと安全（既に types.ts L271-280 が近いことを書いており十分とも言える）。

- **[N-003] `previewPrompt` の `recordLlmCall` は外側 try ブロック内で await されるが、内部 try/catch で完全に握り潰すため本処理 throw 経路と混ざらない（設計どおり）**
  - 場所: `previewPrompt.ts` L112-125（`recordLlmCall` 内 try/catch）、L134 / L158（外側 try 内での await）
  - 理由: `recordLlmCall` は自身の try/catch で全例外を `logger.warn` に落として正常 return するため、外側 `try { ... } catch (error) { throw translateLLMError(error) }`（L127-167）に記録失敗が漏れて `llm_preview_unavailable` 化される懸念はない。テスト (j)（previewPrompt.test.ts L368-386）が「record 失敗でも戻り値不変」を検証済み。consumer 路（`runPipeline` の `recordLlmCall` L308-321）も同型で、テスト L1812- が best-effort 隔離を検証。AC-5 / arch[S-003] を満たす。良い実装。指摘ではなく確認事項として記録。

- **[N-004] `getUsageMetrics` の DTO 射影は `uploadsHourly` と完全対称で、`llmCallsHourly` の Date→ISO8601 map・null 透過が正しい**
  - 場所: `getUsageMetrics.ts` L67-73（`llmCallsHourly` map）、L34（DTO 型 + JSDoc）
  - 理由: snapshot の `null` をそのまま透過し、非 null 時のみ `hourStart.toISOString()` で map。`uploadsHourly`（L60-66）と寸分違わぬ形で、partial-failure 契約（null = 取得失敗 / 空・0 = 実データ）も DTO 層で保たれている。`llmCallsToday` scalar はそのまま透過（DTO 変更不要、arch[S-005]）。AC-2 / AC-4 を満たす。良い射影。確認事項として記録。

---

## 結論

Application 層はゼロベースで精査して **Blocker なし**。port 設計（write/prune 限定・read 分離）、best-effort 局所記録（preview / consumer 両路）、Stub の構造的非記録、記録粒度 2/1/0、provider 名真実源の 3 経路配線（request `buildLlmProvider` / consumer `resolveConsumerLlmConfig` override / consumer null 時の request 継承）、DTO 射影、依存方向はいずれも plan / ADR どおりで、テストも要点を網羅している。

唯一の Warning [W-001] は ADR-004 の核心不変条件（`scalar === sum(series)`）が `clock.now()` 単一前提に依存し、hour 境界での TOCTOU で破れうる点。実害は境界の極短窓に限るが、Round 1 W-001 で是正した「窓ずれによる合計不一致」と同種であり、`collect()` 冒頭で now を 1 度確定して全経路に渡す軽微な修正で構造的に閉じられる。承認可否を分ける性質ではないが、せっかく窓を統一した意図を完遂するため修正を推奨する。N-001〜N-004 は任意の磨き込み・確認事項。
