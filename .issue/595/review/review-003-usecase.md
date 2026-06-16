# PR #746 レビュー（Round 3 / 最終収束確認）— Use Case / Application

対象: Issue #595（P40 ダッシュボード 24h チャート + 最近のアクティビティ backend）
観点: Use Case / Application
前提: Round 2（review-002-usecase.md）の W-001（`resetDesignTokens` no-op ガード dead code）修正後のゼロベース再レビュー

## 前ラウンド指摘の検証結果

- **W-001（`resetDesignTokens` の no-op ガードが dead code）= 修正済み**。ドメイン `InstanceSettings.resetDesignTokens`（`entity.ts:371-384`）に `if (designTokensEqual(settings.designTokens, DesignTokens.empty())) return settings;` の no-op 短絡が追加され、`resetAllPrompts` と対称になった。これにより usecase（`resetDesignTokens.ts:32`）の `if (next !== current)` ガードが live になり、override 無し状態で reset しても `instance_settings.updated` を emit しなくなった。ADR 実装メモ（adr.md:223）の「実変化時のみ emit」と挙動が一致。
  - **テスト追加も確認**: `adminSettingsEvents.integration.test.ts:227` に「override 無しで `resetDesignTokens` → emit しない」ケース、`entity.test.ts:336` にドメイン no-op（同インスタンス返却）ケースが追加。`pnpm test:integration adminSettingsEvents` は 12 件すべて pass。
  - **残る `save` 無条件呼び出しについて**: usecase は no-op 時も `save(next, expectedVersion)` を呼ぶが、`next === current`（同一バージョンの同一エンティティ）を保存するだけで version bump は起きない（bump はドメイン側の `Version.next` 経由のみ、短絡時は通らない）。W-002 で挙げた「version の無駄 bump」は解消済み。実害なし。
- **（参考）`getRecentActivity` の severity 記録用途**: `getRecentActivity.ts:25-31` の JSDoc が「`severity` は projection が記録する監査フィールドで、UI は tag tone を `kind` から導出するため表示には使わない（N-002/N-101）」と明示。DTO に残すが描画入力にしない設計判断がコメントで固定されており、application 層の整合は取れている。

## Use Case / Application

### Blockers

なし

### Warnings

なし

Round 2 の唯一の Warning（W-001）がドメイン側短絡 + usecase ガード live 化 + 双方向テスト追加で完全にクローズした。冪等性（二重防御）・projection の WorkerContainer/UoW 方針（ADR-006）・dispatcher fan-out・大量アップロード集約・collectEvents 棚卸し・eventDecoders・prune 耐性・DI 差し替えはいずれも plan / adr の確定事項どおりで、新たな逸脱・回帰は無い。確認点（再掲・現状一致）:

- **冪等性 二重防御（AC-7）**: 全 projection ハンドラが `insertIfAbsent`（`eventId` 自然キー `ON CONFLICT DO NOTHING`）に限定、件数加算なし。`handleIngestionCreatedEvent` も `ingestion_burst_log` へ 1:1 蓄積で加算しない。
- **fan-out 配線（ADR-005）**: `ingestion.created` は既存 `runIngestionJob` case 内に `handleIngestionCreatedEvent` を fan-out 追加（`dispatchDomainEvent.ts:164-191`）。別 case 二重登録になっておらず、`runIngestionJob` の `retry` でも burst insert は冪等で順序非依存。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は純粋な新規 case で `default: skipped` を壊していない。
- **collectEvents 棚卸し（AC-6）**: emit 6 種が `settingKind` ユニオン・`SETTING_KIND_LABEL` と完全一致。`reencryptApiKey` / `updateUserPromptOverride` / `rebuildSearchIndex` は非 emit、ADR 実装メモの�n分け表どおり。
- **eventDecoders**: `adminSettings/eventDecoders.ts` は zod `.strict()` + `buildEventDecoder`、`settingKindSchema` がドメイン型と同期。
- **prune 耐性（AC-10 / ADR-007）**: `runPruneTick`（`handlers.ts:104-110`）は `pruneActivityLog` を try/catch で囲み、失敗を log に握って outbox prune 結果を独立に返す（「worker → root」per-row 許容）。`pruneActivityLog` は `activity_log`（90 日定数）・`ingestion_burst_log`（24h 定数）双方を prune。
- **DI 差し替え（P-003）**: `D1UsageMetricsProvider.collect()` は scalar 全 `null` 固定 + `uploadsHourly` のみ、24 バケット 0 埋め、失敗時系列 `null` degrade（既存 4 metric-card 挙動不変）。`createRequestContainer` で差し替え、consumer は spread 継承。

### Notes

- **[N-001]** `ingestion.created` の activity decode が `runIngestionJob` の後段（`dispatchDomainEvent.ts:180-189`）に置かれており、dispatcher doc の「副作用前に payload validate」（#159 ADR-005）原則とは厳密には逆順。ただし decode が検証する `jobId` は case 先頭の `IngestionJobIdVO.create(payload.jobId)` で既に検証済みで新規検証サーフェスを後段に持ち込んでおらず、decode 失敗は `BusinessRuleError → handled`（burst 未書き込みだが job 処理は完了済みで honest）。実害なし。（Round 1/2 N-001 から変化なし）

- **[N-002]** `toggleRegistrationPolicy` / `updateLLMConfig` / `updateSpeechConfig` / `updateInstanceLimits` は対応ドメイン mutation に `next === current` ガードが無く同値再保存でも emit する。ADR 実装メモの「常に save → 常に emit」と整合した意図的挙動で、AC-6 の no-op 非 emit 要求は no-op ガードを持つ prompt/designTokens のみに掛かる解釈のため逸脱ではない。W-001 解消により「ガードがある建前で漏れていた」取りこぼしは無くなり、本 Note は純粋に意図的挙動の記録のみ。（Round 2 N-002 から、W-001 との対比は解消済み）

- **[N-003]** 本 PR は #595 スコープ外の speech-config DI（`updateSpeechConfig` の env 連携・speech registry 配線等、`serverCloudflare.ts` 差分の大半）も含む混在変更。Application 観点では `speech_config` を `settingKind` に含め `updateSpeechConfig` が emit する整合は取れている。レビュー範囲外として記録のみ。（Round 1 N-004 / Round 2 N-003 から変化なし）

## 収束判定

Round 2 の唯一の Warning（W-001）がクローズし、Blocker・Warning ともゼロ。残る Notes は実害なしの意図的設計 / スコープ外混在の記録のみで修正不要。`pnpm typecheck` pass、`adminSettingsEvents` 統合テスト 12 件 pass。Use Case / Application 観点で計画・ADR の確定事項に矛盾なく収束しており、**APPROVED**。
