# PR #760 レビュー — Test 観点（review-001）

対象: PR #760 / Issue #748 / 実装計画 `.issue/748/plan.md`
レビュー観点: テスト（layer split・fakes・real-DB integration・plan テスト方針の網羅）

## サマリ

- Blockers: 0
- Warnings: 3
- Notes: 4

plan.md「テスト方針」の中核項目は概ね実データ assertion 付きで網羅されている。特に
recordCall の呼び出し回数（structure=2 / html=1 / 空 audio=0 / LLM throw=0）、best-effort
握り潰し、Stub 非記録、recorder の insert / prune 境界（strict `<`）、provider の
hourly 系列・scalar・bucket parity・null degrade・他 scalar null 固定（AC-7）、
pruneLlmCallLog の cutoff 計算は、それぞれ偽の通過にならない形で検証できている。
unit/integration の層分けも docs/test.md の方針（fake は recorder spy のみ、振る舞いは
real-DB integration に寄せる）に忠実。

一方で plan の「テスト方針」に明記されていながら**テストが存在しない／空振りしている**
項目が 3 つある（runPruneTick の failure isolation、getUsageMetrics の hourly DTO map、
provider 名真実源 ADR-006）。いずれも Blocker ではないが、plan が明示要求した検証点なので
Warning とする。

---

## Test

### Blockers

なし。

### Warnings

#### [W-001] runPruneTick の failure isolation（独立 try/catch）が未テスト
- 説明: plan テスト方針 / AC-6 / arch[S-003] は「`runPruneTick` 内で **独立 try/catch** のため、
  activity-log prune の失敗が LLM prune をブロックしない／その逆／outbox prune もブロックしない
  こと（failure isolation）」を明示要求している。実装（`handlers.ts` L106-122）は
  pruneActivityLog / pruneLlmCallLog をそれぞれ独立 try/catch で握り潰すよう正しく書かれているが、
  その**隔離挙動を検証するテストが存在しない**。
- 場所: `app/worker/cloudflare/__tests__/handlers.integration.test.ts` L256-295（runPruneTick の
  テストは outbox 保持窓の deleted=1/0 の 2 本のみ。llm/activity prune 失敗注入も
  「片方が落ちても他方が走る」検証も無い）。`pruneLlmCallLog.test.ts` は単体の cutoff/deleted
  転送のみで、`runPruneTick` の合成は対象外。
- 理由: 独立 try/catch は本 PR の主目的の一つ（ADR-005）。「相乗りすると activity prune 失敗が
  LLM prune をスキップさせ得る」という回避対象のリグレッションが、テストで固定されていない。
  実装をうっかり 1 つの try に統合しても緑のまま通る。
- 提案: `runPruneTick` の integration テストを 2 本追加。(1) `pruneActivityLog` 系を失敗させる
  container（または D1 を一時的に壊す）で、LLM prune が実行され llm_call_log 行が刈られること
  ＋ outbox の deleted がそのまま返ること。(2) `llmCallLogRecorder.pruneOlderThan` を throw させ、
  activity-log prune と outbox prune が完走すること（logger.error が積まれ tick は throw しない）。

#### [W-002] getUsageMetrics の hourly DTO map（Date → ISO8601）の非 null 分岐が未検証
- 説明: plan テスト方針「getUsageMetrics（unit）: `llmCallsHourly` の DTO map（Date → ISO8601）」。
  実装（`getUsageMetrics.ts` L67-71）は `llmCallsHourly` を `point.hourStart.toISOString()` へ
  map するが、`getUsageMetrics` のテスト 3 本（adminSettings.integration.test.ts L2042/2074/2115）は
  すべて `llmCallsHourly: null`（かつ `uploadsHourly: null`）を渡しており、map 関数の**非 null 分岐が
  一度も実行されない**。Date→string 変換のリグレッションを捕まえられない。
- 場所: `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` L2057-2059,
  L2090-2091, L2135-2136（すべて hourly が null）。
- 理由: hourly 系列の DTO 化（series が UI に届く形）は AC-2/AC-4 の経路上にあり、plan が
  個別にテスト項目として挙げている。null 固定の現状は「present series が 24 本 Date を持つ」
  ケースを一切踏まないため、偽の通過に近い。
- 提案: `StubUsageMetricsProvider` に 24 本（または代表数本）の `hourStart: Date` を持つ
  `llmCallsHourly` / `uploadsHourly` を与え、`result.llmCallsHourly?.[0]?.hourStart` が
  ISO8601 文字列になっていること（`count` が保持されること）を 1 本で確認する。

#### [W-003] provider 名の真実源（ADR-006）が直接検証されていない
- 説明: AC-1 / ADR-006 の核心は「記録する `provider` は env 値でなく `buildLlmProvider` が実際に
  構築した provider の解決済み名」。`buildLlmProvider` は `{ provider, providerName }` 返却へ
  変更され（serverCloudflare.ts L593-606）、container に `llmProviderName` が載るが、
  **`llmProviderName` の値を検証するテストが無い**。serverCloudflare.test.ts は
  `container.llmProvider instanceof Stub/Anthropic` を見るのみで `llmProviderName` を assert しない。
  記録系テスト（previewPrompt / runIngestionJob）は fixture が一律 `llmProviderName: "anthropic"` で、
  記録される provider も "anthropic"。よって「env でなく解決済み名が記録される」ことを
  区別して証明できていない（env が openai でも解決名が anthropic、のような差分ケースが無い）。
- 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts`（llmProviderName の assert 不在）、
  `previewPrompt.test.ts` L100 / `runIngestionJob.integration.test.ts` L1747-1748（provider 固定 "anthropic"）。
- 理由: ADR-006 は本 PR の設計判断の一つで、AC-1 但し書き（Stub 非記録）と並ぶ真実源の確定。
  `createRequestContainer` が `buildLlmProvider` の返す名前を載せていることが緑で固定されていないと、
  env 由来の名前を載せる回帰に気づけない。
- 提案: serverCloudflare.test.ts の「anthropic 構築」ケースに `expect(container.llmProviderName).toBe("anthropic")`、
  別 provider（例 openai 構築）ケースで対応する解決名を assert を 1〜2 行追加。Stub フォールバック時の
  `llmProviderName` の扱い（記録対象外なので任意値で良い旨）も 1 本で固定できると尚良い。

### Notes

#### [N-001] markdown kind の記録 1 行が個別にテストされていない（許容）
- 場所: `runIngestionJob.integration.test.ts` L1751（html のみ。markdown は無し）。
- 理由/判断: `runIngestionJob.ts` L359-375 で html / markdown は完全に同型の分岐（共に
  `structureToHtml` を呼ばず `suggestMetadata` のみ）。markdown は `markdown.toHtml` 変換が
  増えるだけで LLM 呼び出し回数に影響しない。html ケースが記録挙動を代表しているため、
  個別追加は任意。plan の「html・markdown=1回」は構造的に html テストで担保されている。

#### [N-002] 記録器 integration の行順 assert が ORDER BY 無し
- 場所: `llmCallLogRecorder.integration.test.ts` L43-44（`rows[0]?.occurredAt` を挿入順前提で assert）。
- 理由/判断: SQLite は ORDER BY 無しの単純 select で概ね rowid（挿入）順を返すため実害は低いが、
  契約上は順序保証が無い。`occurredAt` を assert したいなら `orderBy(llmCallLog.occurredAt)` を
  付けるか、`rows.map(r => r.occurredAt)` を `expect.arrayContaining` で確認する方が堅い。
  挿入された値そのもの（ISO8601 text として保存される）の検証意図自体は妥当。

#### [N-003] Sparkline の aria-label prop 化（arch[S-005]）が unit テスト無し（許容）
- 場所: `app/components/admin/Dashboard/__tests__/chart.test.ts`（buildSparkline の 0 vs null は
  しっかりテスト済み。aria-label prop の反映はテスト対象外）。
- 理由/判断: docs/test.md の「Frontend: 必要最小限」方針と、aria-label が純粋な presentational
  prop であることから、manual-test（diff 内 TC-1/2/5 結果）での担保で許容範囲。plan も低優先。
  0 vs null 区別（虚偽表示禁止の本質）は chart.test.ts で押さえられている点は良い。

#### [N-004] previewPrompt 記録テストの assert は概ね十分だが id 源の検証は無し
- 場所: `previewPrompt.test.ts` L307-340（(h)/(h2)）。
- 理由/判断: (h) で owner/provider/occurredAt を `toMatchObject` で確認し、(h2) は回数のみ。
  `id` が `idGenerator.next()` 由来であることは未検証だが、これは recorder 側の責務で本質的でない。
  best-effort 握り潰し (j)、Stub 非到達 (i) は実コード経路（catch → llm_preview_unavailable 変換）を
  正しく踏んでおり、偽の通過ではない。total として previewPrompt の記録分岐カバレッジは良好。

---

## 総評

実装と plan テスト方針の対応は良好で、real-DB integration による記録回数・刈り込み境界・系列集計の
検証は実データ assertion で固められており信頼できる。過剰モックも無く（recorder は spy、provider は
real D1）、層分けも適切。残る 3 つの Warning は「plan が明示要求したのに緑が空振り or 不在」という
カバレッジの穴であり、いずれも 1〜2 本のテスト追加で塞げる。Blocker は無し。
