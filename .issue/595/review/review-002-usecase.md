# PR #746 レビュー（Round 2）— Use Case / Application

対象: Issue #595（P40 ダッシュボード 24h チャート + 最近のアクティビティ backend）
観点: Use Case / Application
前提: Round 1（review-001-usecase.md）の W-001 / W-002 修正後のゼロベース再レビュー

## 前ラウンド指摘の検証結果

- **W-001（`runPruneTick` の activity-log prune が無防備 await）= 修正済み**。`app/worker/cloudflare/handlers.ts:104-110` で `await pruneActivityLog(container)` を `try/catch` で囲み、失敗を `container.logger.error` で握り潰して outbox prune 結果（`result`）を独立に返すようになった。doc コメント（91-103）も実コードと整合。「worker → root」の per-row 部分失敗許容方針どおり。
- **W-002（emit/no-emit 単体テストが 2 usecase 分しかない）= 修正済み**。`adminSettingsEvents.integration.test.ts` が emit 6 種すべて（registration_policy / llm_config / speech_config / prompt_template / instance_limits / design_tokens）の emit を 1 ケースずつ検証し、加えて no-op ガード回帰として `updateDesignTokens`（空 override / 同値再保存）・`updatePromptTemplate`（同値再保存）・`resetPromptTemplate`（override 無し）・`resetAllPromptTemplates`（override 無し）の「emit しない」を検証。
- **（参考）Round 1 N-002（"sliding-window" 文言と固定窓実装の乖離）= 実装側を修正**。`activityLogRepository.ts:159-258` が二点ポインタによる真のスライディング窓に再実装され、コメントどおりの挙動になった（境界跨ぎバーストを検知）。候補 owner を `HAVING COUNT(*) >= threshold` で絞り `(owner_id, occurred_at)` index 経由で読む starvation 対策も入った。文言と実装の不整合は解消。

## Use Case / Application

### Blockers

なし

冪等性（二重防御）・projection の WorkerContainer/UoW 方針（ADR-006）・dispatcher fan-out（ingestion.created の既存 case 追加でジョブ実行を壊さない）・大量アップロード集約・collectEvents 棚卸し・eventDecoders・DI 差し替えは、いずれも plan / adr の確定事項どおりに実装されており、致命的逸脱は無い。確認点:

- **冪等性 二重防御**: 全 projection ハンドラ（`handleUserCreatedEvent` / `handleIngestionFailedEvent` / `handleInstanceSettingsUpdatedEvent` / `handleExportJobCompletedEvent`）は `insertIfAbsent`（`onConflictDoNothing({ target: activityLog.eventId })`）で `eventId` 自然キー insert に限定、件数加算なし。`handleIngestionCreatedEvent` も `recordBurst`（`ingestion_burst_log.eventId` unique）で 1:1 蓄積し加算しない。`projection.test.ts` が同一 eventId 二重配信で 1 行に留まることを検証。AC-7 充足。
- **fan-out 配線（ADR-005 / S-001-arch）**: `ingestion.created` は既存 `runIngestionJob` の case 内に `handleIngestionCreatedEvent` を fan-out 追加（`dispatchDomainEvent.ts:164-191`）。別 case 二重登録になっておらず、`runIngestionJob` の `retry` でも burst insert は冪等で順序非依存。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は純粋な新規 case で、既存 `default: skipped` を壊していない。
- **projection の UoW/コンテナ（ADR-006）**: 各ハンドラは write UoW を開かず `activityLogRepository` へ直接書く。target/detail の解決は read-only UoW lookup（`userRepository.findById` / `ingestionJobRepository.findById` / `exportJobRepository.findById`）で、ADR 実装メモどおり。`activityLogRepository` は RequestContainer（read 用 `getRecentActivity`）と WorkerContainer（write 用）の両方に載り、`ConsumerContainer` は request 由来を継承（`serverCloudflare.ts:939-941`）。`UnitOfWorkContext` には足していない。
- **collectEvents 棚卸し（AC-6）**: emit 6 種が `settingKind` ユニオン（`eventDecoders.ts` の `settingKindSchema`）・`SETTING_KIND_LABEL`（`handleInstanceSettingsUpdatedEvent.ts`）と完全一致。`reencryptApiKey` / `updateUserPromptOverride` / `rebuildSearchIndex` は emit していない。
- **eventDecoders**: `adminSettings/eventDecoders.ts` は zod `.strict()` + `buildEventDecoder`、`settingKindSchema` は `satisfies z.ZodType<InstanceSettingKind>` でドメイン型と同期。projection は純粋なマッピングでドメインロジックの application 漏れなし。
- **DI 差し替え（P-003）**: `D1UsageMetricsProvider.collect()` は scalar フィールドすべて `null` 固定で `uploadsHourly` のみ実装（既存 4 metric-card 挙動不変）。24 バケット 0 埋め、失敗時は系列 `null` で degrade（throw しない）。`createRequestContainer` で差し替え、consumer は spread 継承。pruner は `runPruneTick` から `pruneActivityLog` を try/catch 付きで配線済み。

### Warnings

- **[W-001]** `resetDesignTokens` の no-op ガードが事実上無効で、空状態リセットでも `instance_settings.updated` を emit する
  / 場所: `app/core/application/adminSettings/resetDesignTokens.ts:28-42` ＋ `app/core/domain/adminSettings/entity.ts:364-372`
  / 理由: usecase は `const next = InstanceSettings.resetDesignTokens(current, now)` の後 `if (next !== current)` で emit をガードしているが、ドメインの `resetDesignTokens`（entity.ts:364）は `resetPrompt` / `resetAllPrompts` / `updateDesignTokens` と違い **no-op 短絡が無い** — 常に `{ ...settings, designTokens: DesignTokens.empty(), version: Version.next(...) }` という新オブジェクトを返す。したがって `next === current` は決して成立せず、ガードは dead code。結果、デザイントークンが既に空（override 無し）の状態で reset を実行しても version が bump され、活動行 `settings_changed`（種別「デザイントークン」「デザイントークンをリセット」）が emit される。ADR 実装メモ（adr.md:223）の「`resetDesignTokens` … 実変化時のみ emit（`next !== current` ガードを追加）」と挙動が乖離する。`save` も無条件に呼ばれ no-op で version を進める副作用がある。同種の他リセット系（`resetPromptTemplate` / `resetAllPromptTemplates`）はドメイン側で短絡するため正しく no-op 非 emit になっており、`resetDesignTokens` だけが取りこぼし。
  / 影響度: 低。emit 自体は実際に発生した管理操作（reset ボタン押下）に紐づくため「虚偽表示」ではなく、冪等性（二重行）にも影響しない。あくまで「値を変えないリセット」でノイズ行が出る・version が無駄に進む整合性の問題。
  / 提案: ドメイン `resetDesignTokens` を `resetAllPrompts` と対称に「既に空なら同インスタンスを返す」短絡に直す（`if (designTokensEqual(settings.designTokens, DesignTokens.empty())) return settings;`）。これで usecase の既存ガードが効き、`save` の無駄 bump も消える。併せて W-002 のテスト群に「override 無しで `resetDesignTokens` → emit しない」を 1 ケース追加（現状この経路のテストは override 有りの変化ケースのみ＝`adminSettings.integration.test.ts:1746`）。

### Notes

- **[N-001]** `ingestion.created` の activity decode が `runIngestionJob` の後段に置かれており、dispatcher doc が掲げる「副作用の前に payload を validate」（Issue #159 ADR-005）原則とは厳密には逆順。ただし activity 用 decode が検証する `jobId` は case 先頭の `IngestionJobIdVO.create(payload.jobId)` で既に検証済みで、新規の検証サーフェスを後段に持ち込んでいない（decode 失敗 = `BusinessRuleError` → `handled`、burst 未書き込みだが job 処理は完了済みで honest）。実害なし。気になるなら decode を case 先頭へ移すと head-validation 規則と完全整合。場所: `dispatchDomainEvent.ts:180-189`。（Round 1 N-001 から変化なし）

- **[N-002]** `toggleRegistrationPolicy` / `updateLLMConfig` / `updateSpeechConfig` / `updateInstanceLimits` は対応ドメイン mutation に `next === current` ガードが無く、同値再保存でも version を bump し emit する。ADR 実装メモの「常に save → 常に emit」と整合した意図的挙動であり、AC-6 の「no-op 時に emit しないか」は no-op ガードを持つ prompt/designTokens のみに掛かる要求と解釈できるため逸脱ではない。ただし W-001 と合わせ「リセット/同値保存で活動行が出る usecase が複数ある」点は仕様として認識しておくとよい（W-001 はガードがある建前で漏れている点が異なる）。

- **[N-003]** 本 PR は #595 スコープ外の speech-config DI（`updateSpeechConfig` の env 連携・`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` / `HttpSpeechConnectionTester` / speech registry 配線）も含む（`serverCloudflare.ts` 差分の大半）。Application 観点では `speech_config` を `settingKind` に含め `updateSpeechConfig` が emit する整合は取れているが、speech adapter 新設自体は #595 の AC に紐づかない混在変更。レビュー範囲外として記録のみ。（Round 1 N-004 から変化なし）
