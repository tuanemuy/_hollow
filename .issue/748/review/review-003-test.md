# Round 3 フルレビュー（ゼロベース） — Test

PR: #760 / Issue: #748
対象: LLM 呼び出しの永続記録源（`llm_call_log`）新設と P40 ダッシュボード LLM 時系列追従
焦点: Round 2 修正（integration クリーンを共有 `setup.ts` の `CLEAN_STATEMENTS` に集約・per-file `beforeEach` 撤去, ADR-012）の健全性、および plan.md テスト方針の網羅・偽の通過・assertion 不足

---

## Test

### Blockers

なし。

### Warnings

なし。

### Notes

- **[T-N1] Sparkline の `aria-label` prop 反映を直接検証するテストが無い（plan テスト方針との差分）**
  - 場所: `app/components/admin/Dashboard/__tests__/`（`chart.test.ts` のみ。コンポーネント／DOM テストは不在）
  - 理由: plan.md「テスト方針」は「**Sparkline（unit / 描画）: `aria-label` prop が反映され、アップロード／LLM の両カードで正しい文言が出る（arch[S-005]）**」を挙げているが、実際に追加されたのは `buildSparkline` の純関数を見る `chart.test.ts` のみで、prop 化した `aria-label`（「アップロード数…」／「LLM 呼び出し数…」）が描画に反映されることを assert するテストは存在しない。Dashboard 配下にコンポーネント描画テストの土台（`*.test.tsx`）も無い。
  - 影響度: 低。`aria-label={ariaLabel}` は単純な props 透過で `index.tsx` を読めば自明、かつ docs/test.md の方針（Frontend は必要最小限・server function wire 型境界と UI ロジックを重視、描画 a11y は手動/ブラウザ検証へ寄せる）と整合する。manual-test 結果（TC-*）でカード描画は別途確認済み。よって Blocker/Warning ではなく方針差分の記録に留める。新たにコンポーネントテスト基盤を立てるのは過剰であり**追加実装は不要**と判断。

- **[T-N2] runIngestionJob「LLM throw → 0 行」テストはジョブ失敗そのものは assert していない**
  - 場所: `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts` の "records 0 rows when the LLM throws"
  - 理由: `ThrowingLLMProvider`（office 路で `structureToHtml` が `LLMUnavailableError` を throw）注入後、`countLlmCallLogRows === 0` のみを assert し、ジョブが実際に失敗遷移したことは確認していない。仮に office 路が LLM に到達しない回帰が入っても 0 行で緑になりうる。
  - 影響度: 低。同じ office 路の "records 2 rows"（成功時 2 行）が「office 路は LLM に確実に到達する」ことを保証しており、両テストが対になって「到達するが throw 時は記録地点に達しない」を画している。`StubLLMProvider`/`ThrowingLLMProvider` いずれも throw 前置で構造的非到達を担保（plan ADR-002 / arch[S-001]）。proxy として `ThrowingLLMProvider` を使う点も妥当（Stub も同様に throw）。よって偽の通過リスクは実質ない。`expect(status).toBe("failed")` を 1 行足せばより強くなる程度の任意磨き込み。

---

## Round 2 修正（共有 setup 集約 / ADR-012）の健全性確認

- **SSOT 集約の正しさ**: `setup.ts` の `CLEAN_STATEMENTS` に `["llm_call_log", "DELETE FROM llm_call_log"]` を `ingestion_burst_log` の直後（FK 依存の無い独立テーブル、users より前）に登録（L18）。`llm_call_log` は `owner_id`/`provider`/`occurred_at`/`created_at` のみで RESTRICT FK を持たないため、削除順序の制約に触れず登録位置は安全。per-statement 逐次実行 + ラベル付きエラーで失敗箇所が特定可能な既存パターンに自然に収まっている。Round 2 の唯一の Warning（per-file `beforeEach` の対症療法を SSOT へ戻す）が解消された。
- **per-file `beforeEach` 撤去の確認**: `llmCallLogRecorder.integration.test.ts`・`usageMetricsProvider.integration.test.ts` のいずれにも `beforeEach` は無く、各 `it` 冒頭で `createTestContainer()` を呼ぶだけ。クリーンはグローバル `setup.ts` の `beforeEach` 単一経路に一本化されており、二重定義・順序依存・取りこぼしの温床が消えた。
- **他テストの前提を壊していないこと**: `llm_call_log` の DELETE 追加は他テーブルに非依存（孤立テーブル）。`afterEach` の `_occ_guard` 空アサートにも無影響。`usageMetricsProvider` の upload 系列・他 scalar（AC-7）検証は `llm_call_log` 行に依存しないため、追加クリーンの有無で結果が変わらない。全 integration スイートで「前テストの llm 行が漏れて次テストの集計を汚す」リーク経路が共有 setup により恒久的に塞がれた。
- **helpers.ts への配線**: adapter/application 双方の `createTestContainer` に `llmCallLogRecorder: new D1LlmCallLogRecorder(db)` と `llmProviderName: "anthropic"` を追加。container 形状が production と揃い、runIngestionJob integration が実 `D1LlmCallLogRecorder` で行を永続化できる。

## plan.md テスト方針の網羅性（個別確認）

- **記録回数 2/1/0**: runIngestionJob integration で office=2（structureToHtml+suggestMetadata）／html=1（suggestMetadata のみ）／空 audio=0（早期 return）を実 DB 行数で固定。記録粒度 = LLM API 呼び出し回数（AC-1）を満たす。
- **best-effort 握り潰し**: previewPrompt (j) と runIngestionJob "recordCall failure does not break the job" の双方で、recordCall throw 時も戻り値不変／ジョブが `previewing` へ到達し `errorCode` null を確認。記録の局所 try/catch が本処理 throw 経路と混同されない（arch[S-003], AC-5 リグレッション防止）ことを別々に検証。
- **Stub 非記録（構造的非到達）**: previewPrompt (i)（Stub 風 throw → 翻訳 → 記録地点不達 → `recordCall` 未呼出）、runIngestionJob "0 rows when the LLM throws"。明示的 Stub 判定に依存しない設計を体現。`StubLLMProvider`/`ThrowingLLMProvider` とも throw 前置で同等（T-N2 参照）。
- **recorder insert/prune 境界**: `recordCall` が 1 行/call（onConflict 無し, ADR-008）、`pruneOlderThan` が strict `<`（cutoff ちょうどの行は残す）を境界 4 点（cutoff 前・直前・同時刻・後）で検証し `deleted=2` を固定。
- **provider 系列/scalar/bucket parity/null degrade/AC-7**: LLM 系列 24 本・UTC hour bucket・0 埋め・partial-failure `null`、scalar 24h 窓（gte 境界 inclusive・直前除外）、upload 系列と `hourStart` 列が完全一致（bucket parity）、broken db で系列・scalar とも null、他 scalar（userCount/storage*/uploadsToday）は `null` 固定（AC-7）を網羅。
- **scalar=系列合計 不変条件**: `llmCallsToday === sum(llmCallsHourly)` を hour-aligned 窓境界と共に固定。実装は両者とも `windowStartIso(now)` を共有するため構造的に成立し、別ロジック乖離回帰を捕捉する有効な縛り。0 件=0（null でない＝実データ）も別途固定。
- **runPruneTick failure isolation**: handlers integration で (1) activity prune mockReject → llm 行が消え outbox deleted=1、(2) llm prune mockReject → activity prune 完走（spy `results[0].type==="return"`）・outbox deleted=1・tick は throw しない。独立 try/catch を割る回帰が緑を許さない（arch[S-003], AC-6）。outbox prune（先行・既コミット）も非ブロック。
- **hourly DTO map**: getUsageMetrics で 24 本（bucket0 に count=7）の非 null 系列を与え Date→ISO8601 文字列化と count 保持、upload 系列も map されることを assert。null-degrade 路に隠れていた map 分岐を実行する。
- **provider 名真実源（ADR-006）**: serverCloudflare test で `llmProviderName` を anthropic 構築=「anthropic」、**openai 構築=「openai」の差分（env default 回帰なら落ちる）**、provider 未設定+資格情報=anthropic default、Stub fallback は defined のみ、の 4 本＋`buildLlmProvider` を `{provider, providerName}` 返却へ全面移行。env でなく解決済み名であることを差分で証明。
- **pruneLlmCallLog unit**: cutoff = now − `LLM_CALL_LOG_RETENTION_HOURS`(48h) を spy で固定、deleted 透過も確認。境界定数の取り違え回帰を捕捉。

## 総評

Round 2 で唯一残っていた Warning（新テーブルのクリーンアップを per-file 対症療法ではなく共有 `setup.ts` の SSOT へ集約）が ADR-012 として正しく反映され、`CLEAN_STATEMENTS` 一本化・per-file `beforeEach` 完全撤去が確認できた。FK 非依存の独立テーブルゆえ登録位置も安全で、他テストの前提を壊さず、将来のリーク回帰経路が恒久的に塞がれている。plan.md のテスト方針項目はすべて実 assertion 付きで網羅され、failure isolation（spy 隔離＋反対側完走）・provider 名差分（openai≠default）・scalar=系列合計 不変条件・best-effort 握り潰しと本処理 throw の分離検証など、いずれも「回帰が緑を割る」形に仕上がっている。偽の通過・過剰モック・層越境は無く docs/test.md に忠実。Blocker・Warning ともに無し。残る 2 件は方針差分の記録（フロント描画テスト不在＝docs 方針と整合）と任意の 1 行強化（ジョブ失敗 assert 追加）で、現状の正しさには影響しない。
