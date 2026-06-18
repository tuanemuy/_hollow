# PR #760 レビュー — Test 観点（review-002 / Round 2 フルレビュー）

対象: PR #760 / Issue #748 / 実装計画 `.issue/748/plan.md`
観点: テスト（layer split・fakes・real-DB integration・plan テスト方針の網羅・Round 1 修正反映の質）
方式: ゼロベース（Round 1 を前提にせず最新差分を全面再評価）

## サマリ

- Blockers: 0
- Warnings: 1
- Notes: 4

Round 1 の Warning 3 件（W-001 failure isolation 未テスト / W-002 hourly DTO map 非 null 未検証 /
W-003 provider 名真実源 未検証）は **いずれも実 assertion 付きで適切に塞がれている**。plan「テスト方針」の
中核項目（記録回数 2/1/0・best-effort 握り潰し・Stub 非記録・recorder の insert/prune 境界・provider の
系列/scalar/bucket parity/null degrade/AC-7・Round 1 で追加された scalar=系列合計 不変条件）は
偽の通過にならない形で網羅されている。層分け（recorder は spy、集計は real D1）も docs/test.md に忠実。

残る 1 Warning は Round 1 で入れた per-file `beforeEach`（共有 D1 リーク対策）が、本来 SSOT である
グローバル `setup.ts` の `CLEAN_STATEMENTS` 漏れの**回避策に留まっている**点。テストは現状すべて通るが、
新テーブルのクリーンアップ責務が共有 setup と個別ファイルに二重化しており、将来の漏れリグレッションを
誘発する構造的脆さがある。

---

## Test

### Blockers

なし。

### Warnings

#### [W-001] `llm_call_log` がグローバル integration setup の TRUNCATE 対象に入っておらず、per-file `beforeEach` が SSOT 漏れの回避策に留まる
- 説明: integration の per-test 分離は `app/core/adapters/d1/__tests__/setup.ts` の `CLEAN_STATEMENTS`
  （`beforeEach` で全テーブル DELETE）が SSOT として担う設計（docs/test.md「テスト間の状態クリーンアップは
  グローバル setup が見る」）。しかし本 PR で新設した `llm_call_log` が **`CLEAN_STATEMENTS` に追加されていない**。
  Round 1 でリークが顕在化した 2 ファイル（`llmCallLogRecorder.integration.test.ts` L26-28、
  `usageMetricsProvider.integration.test.ts` L99-101）が**個別に `beforeEach(() => db.delete(llmCallLog))` を
  足す**ことで通しているが、これは共有 setup の漏れを各ファイルで埋める対症療法であり、クリーンアップ責務が
  二箇所に分散している。
- 場所: `app/core/adapters/d1/__tests__/setup.ts` L13-41（`CLEAN_STATEMENTS` に `llm_call_log` 欠落）。
  対症療法側: `llmCallLogRecorder.integration.test.ts` L26-28 / `usageMetricsProvider.integration.test.ts` L99-101。
- 理由: `llm_call_log` を触る integration は計 4 ファイル（上記 2 + `runIngestionJob.integration.test.ts` +
  `handlers.integration.test.ts`）。後者 2 ファイルは「seedUser の owner を毎回ユニーク採番し ownerId で
  フィルタ集計」「固定 llmId を seed→delete で検証」という**スコープ限定で偶然リークに鈍感**なため通っているが、
  グローバル truncate に載っていないことで以下が保証されない: (a) 同 isolate 内で `llm_call_log` 全件 COUNT に
  依存する将来テストが書かれた瞬間にリークで落ちる、(b) `handlers` の failure-isolation test が固定 llmId に
  依存しており、将来 owner 非依存の集計検証を足すと汚染される。Round 1 の per-file `beforeEach` 自体は
  「他テストの前提を壊していないか」という観点では健全（グローバル setup → file `beforeEach` の順で両方走り
  競合しない、provider テストの upload 系列・他 scalar 検証も llm 行に非依存なので無影響）だが、修正箇所が
  SSOT でない点が残課題。
- 提案: `setup.ts` の `CLEAN_STATEMENTS` に `["llm_call_log", "DELETE FROM llm_call_log"]` を 1 行追加し、
  クリーンアップ責務を SSOT に戻す。これにより 2 ファイルの per-file `beforeEach` も冗長化するので削除でき、
  4 ファイルすべてが共有 setup で一律にクリーンになる。owner-FK 制約は無い（`owner_id` は users への FK だが
  DELETE 対象なので users 削除前に消せばよい＝activity_log と同列の位置に置けば順序問題も無い）。

### Notes

#### [N-001] runIngestionJob「LLM throw で 0 行」テストが job 失敗ステータスを assert していない（許容）
- 場所: `runIngestionJob.integration.test.ts`「records 0 rows when the LLM throws」。
- 理由/判断: `StubOfficeOk` で抽出成功 → `ThrowingLLMProvider` の `structureToHtml` が throw → 記録地点に
  到達せず 0 行、という arch[S-001]（記録を成功直後に置く＝Stub/throw は構造的に非記録）の核心経路を
  正しく踏んでいる。0 行 assert が本質的検証なので許容。ただし job が「LLM 前で別要因により失敗→0 行」
  と区別したいなら `status === "failed"`（または該当 errorCode）を 1 行足すと throw 経路を経た 0 行で
  あることが固定でき尚良い。best-effort テスト側は `previewing` + `errorCode: null` を assert しており、
  こちらは「記録失敗が本処理を壊さない（AC-5）」を偽の通過なく押さえている。

#### [N-002] 記録器 integration の行順 assert が ORDER BY 無し（Round 1 N-002 から未対応・許容）
- 場所: `llmCallLogRecorder.integration.test.ts` L49-50（`rows[0]?.occurredAt` を挿入順前提で assert）。
- 理由/判断: SQLite は ORDER BY 無し単純 select で概ね rowid（挿入）順を返すため実害低だが契約上の順序保証は
  無い。`orderBy(llmCallLog.occurredAt)` か `rows.map(...)` の `arrayContaining` がより堅い。ISO8601 text として
  保存される値そのものの検証意図は妥当で、件数（`toBe(2)`）と prune 境界（strict `<` の deleted=2）は
  順序非依存に正しく固められている。

#### [N-003] markdown kind の記録 1 行が個別テスト無し（許容）
- 場所: `runIngestionJob.integration.test.ts`（html=1 行はあるが markdown 単独は無し）。
- 理由/判断: html/markdown は実装上完全同型（共に `structureToHtml` を呼ばず `suggestMetadata` のみ）で
  LLM 呼び出し回数に差が出ない。html ケースが代表として記録回数 1 を担保。plan の「html・markdown=1回」は
  構造的に html テストでカバーされる。

#### [N-004] Sparkline `aria-label` prop 化（arch[S-005]）に unit テスト無し（許容）
- 場所: `app/components/admin/Dashboard/__tests__/chart.test.ts`（`buildSparkline` の 0 vs null は検証済み）。
- 理由/判断: docs/test.md「Frontend: 必要最小限」と、aria-label が純粋 presentational prop である点、
  manual-test（TC-1/2/5 結果が diff 内に同梱）での担保から許容。虚偽表示禁止の本質（0=平坦線 vs null=取得失敗）は
  chart.test.ts で押さえられている。

---

## Round 1 修正の反映確認（個別評価）

- **[W-001 解消] runPruneTick failure isolation**: `handlers.integration.test.ts` に独立 try/catch を固定する
  2 本を追加。(1) `D1ActivityLogRepository.pruneOlderThan` を mockReject → llm prune が実行され該当 llm 行が
  消え（`llmRemaining.toHaveLength(0)`）outbox deleted=1 が返る。(2) `D1LlmCallLogRecorder.pruneOlderThan` を
  mockReject → activity prune が完走（spy の `results[0].type === "return"`）outbox deleted=1・tick は throw しない。
  「1 つの try に統合する回帰」を緑が許さない形になっており**質は十分**。spy 隔離の使い方も適切で偽の通過なし。
- **[W-002 解消] getUsageMetrics hourly DTO map**: `adminSettings.integration.test.ts` に
  `StubUsageMetricsProvider` で 24 本（bucket0 に count=7、upload は bucket23 に count=5）を与える 1 本を追加。
  `result.llmCallsHourly?.[0]` が `{hourStart:"...T00:00:00.000Z", count:7}` で `typeof hourStart === "string"`、
  upload 系列も map されることを assert。**Date→ISO8601 の非 null 分岐が実行され count 保持も確認**でき
  偽の通過を解消。
- **[W-003 解消] provider 名真実源 ADR-006**: `serverCloudflare.test.ts` に `llmProviderName` の assert を
  4 本（anthropic 構築=「anthropic」、**openai 構築=「openai」の差分ケース**＝env default 回帰なら落ちる、
  provider 未設定+資格情報あり=anthropic default、Stub fallback は defined のみ）追加。さらに `buildLlmProvider`
  既存スイートを `{provider, providerName}` 返却へ移行し `providerName` を assert。**「env でなく解決済み名」を
  差分で証明**しており質は十分。
- **[scalar=系列合計 不変条件]**: `usageMetricsProvider.integration.test.ts`「computes llmCallsToday ...
  matching the series sum」で `snapshot.llmCallsToday === seriesTotal` を hour-aligned 窓境界（gte 2026-06-09T13:00、
  直前の 12:00 は除外）と共に検証。scalar と系列の窓一致を縛る良い不変条件で、両者が別ロジックで乖離する回帰を
  捕捉できる。0 件=0（null でない＝実データ）も別途固定。
- **[beforeEach 共有 D1 リーク対策の健全性]**: per-file `beforeEach` はグローバル setup の `beforeEach` と
  順次両方走り競合しない。provider テストの upload 系列・他 scalar（AC-7）検証は llm 行に非依存のため無影響。
  他テストの前提を壊していない。ただし修正箇所が SSOT でない点は W-001 参照。

---

## 総評

Round 1 の 3 Warning はすべて実 assertion 付きで的確に解消され、特に failure isolation（spy 隔離 + 反対側完走）と
provider 名の差分ケース（openai≠default）は「回帰が緑を割る」形に仕上がっている。記録回数 2/1/0・best-effort
握り潰し（戻り値/ジョブ遷移不変）・Stub 非記録（構造的非到達）・recorder の insert/prune strict `<` 境界・
系列/scalar/bucket parity/null degrade/AC-7・scalar=系列合計 不変条件、いずれも偽の通過なし。過剰モックも無く
層分けは docs/test.md に忠実。Blocker は無し。残る 1 Warning は新テーブルのクリーンアップを per-file の対症療法
ではなく共有 setup（SSOT）へ戻す磨き込みで、テストの現状の正しさには影響しないが将来のリーク回帰防止のため
推奨する。
