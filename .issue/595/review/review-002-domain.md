# レビュー #746 — Domain 観点（review-002 / 前ラウンド修正後の再レビュー）

対象: PR #746 / Issue #595（P40 ダッシュボード backend）
レビュー範囲: Domain 層に関わる変更（`app/core/domain/adminSettings/events.ts` を中心に、ドメインイベント二相モデル整合・read-model のドメイン非昇格・不変条件・ドメインロジック漏出・CLAUDE.md 規約準拠）。前ラウンド W-001（`actorId` を `UserId` ブランド型化）の修正確認を含む。ゼロベースで再検証した。

## Domain

### Blockers

なし。

### Warnings

なし。

- **[前回 W-001 = 解消確認]** `instance_settings.updated` の `actorId` は `UserId` ブランド型に修正済み。
  - `events.ts:24` — payload `actorId: UserId`（生 `string` を廃止）。型 import も `import type { UserId } from "@/core/domain/identity/valueObject"` を追加。
  - `events.ts:42-49` — ファクトリ `AdminSettingsEvents.updated` の引数も `actorId: UserId` に型付けされ、戻り値 `EventDraft<InstanceSettingsUpdatedEvent>` を維持。
  - 生成側（`toggleRegistrationPolicy.ts:41` ほか 8 usecase）は `actor.id`（`assertAdmin` が返す `UserId`）を渡しており、生 string の混入経路が型レベルで閉じている。
  - decoder（`eventDecoders.ts:20,39`）は `actorId: z.string()` で at-rest payload を受け、mapper で `UserId.create(p.actorId)` を通す。これは `identity/eventDecoders.ts`（`UserId.create(p.userId)`）・`export/eventDecoders.ts`（`ownerId` 同パターン）と完全一致の rehydrate 境界処理であり、未検証 string をブランド境界で正規化する確立パターンに整合。
  - 結論: payload は `UserId`、生成側は VO を渡し、decode 境界で `.create()` を通す——`identity` / `export` のブランド識別子イベントと三方向で一致。「make illegal states unrepresentable at the type level」（CLAUDE.md）に適合。修正は適切かつ過不足なし。

### Notes

- **[N-001]** イベント二相モデル（`DomainEventDraftBase` / `DomainEventBase` / `EventDraft`）への準拠は正しい。`InstanceSettingsUpdatedEvent` を `DomainEventBase<type, payload>` で定義し、`AdminSettingsEvents.updated` が `id` 抜きの `EventDraft<...>` を返す形は `identity/events.ts` `ingestion/events.ts` `export/events.ts` と完全一致。`EventId` 付与を application 層（`collectEvents` → `attachEventIds`）に委ね、ドメインを `IdGenerator` から自由に保つ原則を守る。events.ts の JSDoc が「なぜドメインが id を持たないか」「なぜ aggregate 自身が emit せず usecase 境界で collect するか（ADR-006）」を WHY として簡潔に説明しており、CLAUDE.md のコメント方針に沿う。

- **[N-002]** 「活動ログは read-model でありドメイン概念にしない」という ADR-001 / plan の方針が守られている。`app/core/domain/activityLog/` 等のドメインエンティティ・値オブジェクトは新設されておらず、`ActivityKind`（`user_created` | `large_upload` | `job_failed` | `settings_changed` | `export_completed`）も application 層に閉じている。ドメイン側に新設されたのは「変更通知イベント」1 種のみで、projection / 集約ロジックの漏出は無い。不変条件を持たない概念をドメイン値オブジェクト化しない判断が一貫している。

- **[N-003]** イベント生成位置の判断が ADR-006 注記・実装メモ（B-6）と整合。`InstanceSettings` の mutation メソッド（`setRegistrationOpen` / `updateLLM` / `updateSpeech` / `updateLimits` / `updatePrompt` / `updateDesignTokens` 等, entity.ts:374-395 ほか）はいずれも plain な `InstanceSettings` を返し、`{entity, eventDrafts}` 化していない。`instance_settings.updated` は usecase 層の `ctx.collectEvents([...])` で収集される。設定変更は「ドメイン不変条件を持たない純粋な変更通知」であり、aggregate を重くしない判断（S-003-arch 見送り）と一致。

- **[N-004]** `settingKind` ユニオン（6 値: registration_policy / llm_config / speech_config / prompt_template / instance_limits / design_tokens）が「emit する usecase の棚卸し」と三者整合。events.ts の union 型、decoder の `z.enum([...]) satisfies z.ZodType<InstanceSettingKind>`（型レベル同期）、emit 実態（9 usecase の `AdminSettingsEvents.updated` 呼び出し）が一致。ADR の「emit しない」群（`reencryptApiKey` / `updateUserPromptOverride` / `rebuildSearchIndex`）はユニオンに含まれず、取りこぼし・余剰なし。

- **[N-005]** `aggregateId` に `INSTANCE_SETTINGS_ID`（`"singleton"`, entity.ts:24 の `as const`）を再利用しており、singleton aggregate の同一性をイベントメタにも一元的なソースから反映。`DomainEventDraftBase.aggregateId: string` 契約に適合。

- **[N-006]** BusinessRuleError / VO 構築時検証・`*ErrorCode` 命名規約に違反する新規ドメインコードは無い。本イベントはドメイン不変条件を持たない変更通知であり、events.ts にバリデーションが無いのは妥当（検証は emit 元 usecase の VO 構築と decoder の zod strict 境界で担保）。`errorCodeNaming.test.ts`（447 cases）はパス。なお同 PR には speech config 関連のドメイン追加（entity/valueObject/service/errorCode）も含まれるが、これは #595 のチャート/アクティビティとは別系統の変更であり、本観点（活動ログイベント設計）の評価対象外。speech 側にも errorCode 命名違反は無いことを上記テストで確認済み。

## 総評

前ラウンド唯一の指摘 W-001 は、payload・ファクトリ・生成側・decode 境界の 4 点すべてで `UserId` ブランド型へ正しく統一され、`identity` / `export` の既存イベント設計と完全に整合する形で解消された。新規のドメイン問題は検出されず。二相イベントモデル・read-model のドメイン非昇格・ADR-006（aggregate 非 emit / usecase collect）・命名規約のいずれも遵守されている。Domain 観点は収束。
