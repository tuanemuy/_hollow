# PR #746 レビュー — Use Case / Application

対象: Issue #595（P40 ダッシュボード 24h チャート + 最近のアクティビティ backend）
観点: Use Case / Application

## Use Case / Application

### Blockers

なし

冪等性（AC-7）・projection 配置（ADR-006）・fan-out 配線（ADR-005 / S-001-arch）・read-time 窓集約・collectEvents 棚卸し（AC-6）・eventDecoders は、いずれも plan / adr の確定事項どおりに実装されており、ジョブ実行を壊す二重登録やドメインロジックの application 漏れといった致命的な逸脱は見つからなかった。要点の確認結果:

- **冪等性 二重防御**: projection ハンドラ（`handleUserCreatedEvent` / `handleIngestionFailedEvent` / `handleInstanceSettingsUpdatedEvent` / `handleExportJobCompletedEvent`）はすべて `activityLogRepository.insertIfAbsent`（`onConflictDoNothing({ target: activityLog.eventId })`）で `eventId` 自然キー insert に限定され、件数加算等の非冪等操作を持たない。`handleIngestionCreatedEvent` も `recordBurst`（`ingestion_burst_log.eventId` unique）で 1:1 蓄積し加算しない。`projection.test.ts` が同一 eventId 二重配信で 1 行に留まることを検証。AC-7 を満たす。
- **fan-out 配線**: `ingestion.created` は既存 `runIngestionJob` の case 内に `handleIngestionCreatedEvent` を追加する fan-out で、別 case 二重登録になっていない（`dispatchDomainEvent.ts:164-191`）。`runIngestionJob` の `retry` でも burst insert は冪等なため順序非依存。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は純粋な新規 case で、既存 `default: skipped` の挙動を壊していない。`dispatchDomainEvent.test.ts` の skipped-regression-guard とルーティングテストが回帰を守る。
- **projection の UoW/コンテナ（ADR-006）**: 各ハンドラは `ConsumerContainer` を取り、write UoW を開かず `activityLogRepository` へ直接書く。`AC-5` の target/detail 解決は read-only UoW lookup（`userRepository.findById` 等）で、これは ADR 実装メモ（buildSnapshotByNoteId と同じ read UoW パターン）どおり。`activityLogRepository` は `RequestContainer`（read 用 `getRecentActivity`）と `WorkerContainer`（write 用）の両方に載り、`UnitOfWorkContext` には足されていない。
- **collectEvents 棚卸し（AC-6）**: emit 6 種（registration_policy / llm_config / speech_config / prompt_template / instance_limits / design_tokens）が `settingKind` ユニオン・`SETTING_KIND_LABEL`・zod enum と完全一致。`reencryptApiKey` / `updateUserPromptOverride` / `rebuildSearchIndex` は emit していない（grep 確認）。no-op ガードのある usecase（`updatePromptTemplate` / `resetPromptTemplate` / `resetAllPromptTemplates` / `updateDesignTokens` / `resetDesignTokens`）は `next === current` の早期 return で collectEvents 前に抜けるため no-op 時は emit しない。
- **eventDecoders**: `adminSettings/eventDecoders.ts` は zod `.strict()` + `buildEventDecoder`、`settingKindSchema` は `satisfies z.ZodType<InstanceSettingKind>` でドメイン型と同期。ハンドラが消費する payload フィールドは各既存 decoder（ingestion/identity/export）の strict schema で検証済み。ドメインロジックの application 漏れなし（投影は純粋なマッピング）。
- **DI 差し替え（P-003）**: `D1UsageMetricsProvider.collect()` は scalar フィールドをすべて `null` 固定で返し、`uploadsHourly` のみ実装。既存 4 metric-card の挙動不変が成立。`createRequestContainer` で `NullUsageMetricsProvider` → `D1UsageMetricsProvider` に差し替え、consumer は spread 継承。pruner は `runPruneTick` で `pruneActivityLog` を追加配線済み。

### Warnings

- **[W-001]** `runPruneTick` の activity-log prune が無防備 await でドキュメント記述と乖離
  / 場所: `app/worker/cloudflare/handlers.ts:91-101`
  / 理由: doc コメントは「A failure there must not block the outbox prune, so the activity prune runs after and its outcome is folded into the result only for the outbox count」と明言するが、実コードは `await pruneActivityLog(container)` を try/catch で囲っていない。`pruneActivityLog` 内の `pruneOlderThan` / `pruneBurstOlderThan` は `mapDbError` で D1 transient を SystemError として再 throw するため、activity prune が失敗すると `runPruneTick` 全体が reject し、先行して**コミット済み**の outbox prune 結果（`result`）が呼び出し元に返らない。`pruner.ts` は `ctx.waitUntil(runPruneTick(env))` の fire-and-forget なので outbox 行の削除自体は巻き戻らないが、(a) コメントが約束する「outbox prune をブロックしない」挙動が実コードで担保されていない（pruneOutbox 後段の処理は無いので実害は限定的だが、将来 outbox prune の後段に処理が増えると即バグ化する）、(b) `handlers.integration.test.ts:270/289` の `{ deleted }` 戻り値アサーションが activity prune の偶発失敗で巻き添えになる。
  / 提案: コメントの意図どおり `try { await pruneActivityLog(container); } catch (e) { container.logger.error(...); }` で囲み、activity prune の失敗を outbox prune 成功と独立させる（worker の per-row 部分失敗許容と同じ方針）。あるいはコメントを実態（「両者直列で activity prune 失敗時は tick 全体が retry される」）に合わせる。

- **[W-002]** AC-6 棚卸しの emit/no-emit を保証する単体テストが 2 usecase 分しかない
  / 場所: `app/core/application/adminSettings/__tests__/adminSettingsEvents.integration.test.ts`（テストは `toggleRegistrationPolicy` / `updateInstanceLimits` のみ）
  / 理由: AC-6 は「一部 usecase だけ emit して他が漏れる取りこぼしを構造的に防ぐ」ことを要求し、plan C-1 / テスト方針も「設定変更で `instance_settings.updated` が collectEvents される単体テスト」を挙げる。だが実テストは emit 6 種のうち 2 種のみ。残る `updateLLMConfig` / `updateSpeechConfig` / `updatePromptTemplate` / `updateDesignTokens` の emit 検証も、no-op ガード付き usecase（`updatePromptTemplate` / `reset*` / `updateDesignTokens` / `resetDesignTokens`）の**「no-op 時に emit しない」回帰テスト**も無い。後者は `next === current` 早期 return という退行しやすい分岐で、ガードが消えても emit-on-change テストでは検出できない。
  / 提案: 各 settingKind の emit を 1 ケースずつ（最低でも `updateLLMConfig` / `updateSpeechConfig` / prompt 系 / design tokens 系）、かつ「同値再保存で outbox が増えない（no-op 非 emit）」を prompt/designTokens で 1 ケース追加する。

### Notes

- **[N-001]** `ingestion.created` の activity decode が `runIngestionJob` の後段に置かれており、dispatcher doc コメントが掲げる「Issue #159 ADR-005: 副作用の前に payload を validate」原則とは厳密には逆順。ただし activity 用 decode が検証する `jobId` は case 先頭の `IngestionJobIdVO.create(payload.jobId)` で既に検証済みで、新規の検証サーフェスを後段に持ち込んでいない（decode 失敗 = `BusinessRuleError` → `handled`、burst 未書き込みだが job 処理は完了済みで honest）。実害なし。気になるなら `ingestion.created` の decode を case 先頭（`runIngestionJob` 前）へ移すと head-validation 規則と完全整合する。場所: `app/core/application/workers/dispatchDomainEvent.ts:180-189`。

- **[N-002]** 大量アップロードの read-time 集約はコメント・JSDoc で "sliding-window" と記すが、実装は `Math.floor(occurredAt / WINDOW_MS)` の固定タンブリング窓（`activityLogRepository.ts:162`, ports.ts:36 の "sliding-window" 文言）。窓境界をまたいで分散したバースト（例: 同一 owner が境界前後で 10+10 件）は閾値 20 に届かず行が出ない近似。ADR-005 は「閾値以上の窓のみ導出」とだけ規定し true sliding を要求していないので機能要件は満たすが、文言が実装とずれている。COUNT DISTINCT 相当（`Set<eventId>.size`）で二重計上が無いことは確認済み。提案: コメントを "fixed/tumbling window" に正す。

- **[N-003]** `toggleRegistrationPolicy` / `updateLLMConfig` / `updateSpeechConfig` / `updateInstanceLimits` は対応するドメイン mutation（`setRegistrationOpen` / `updateLLM` / `updateSpeech` / `updateLimits`）に `next === current` ガードが無く、同値再保存でも version を bump し emit する。ADR 実装メモの「常に save → 常に emit」と整合した意図的挙動であり、AC-6 の「no-op 時に emit しないか」は no-op ガードを持つ prompt/designTokens のみに掛かる要求と解釈できるため逸脱ではない。ただし運用上「値を変えずに保存」した操作者にも活動行が出る点は仕様として認識しておくとよい。

- **[N-004]** 本 PR は #595 スコープ外の speech-config DI（`updateSpeechConfig` の env 連携・`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` / `HttpSpeechConnectionTester` / speech registry 配線）も含む（`serverCloudflare.ts` の大半の diff）。Application 観点では `speech_config` を `settingKind` に含め `updateSpeechConfig` が emit する整合は取れているが、speech adapter 新設自体は #595 の AC に紐づかない混在変更。レビュー範囲外として記録のみ。
