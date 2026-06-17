# レビュー #746 — Domain 観点（review-001）

対象: PR #746 / Issue #595（P40 ダッシュボード backend）
レビュー範囲: Domain 層に関わる変更（主に `app/core/domain/adminSettings/events.ts`）と、ドメインロジックの漏出・read-model の扱い・イベント二相モデル整合・CLAUDE.md 規約準拠。

## Domain

### Blockers

なし。

### Warnings

- **[W-001]** `instance_settings.updated` の `actorId` が生 `string` で、ブランド型 `UserId` を使っていない
  - 場所: `app/core/domain/adminSettings/events.ts:24`（`actorId: string`）/ 連動して `eventDecoders.ts:21`（`actorId: z.string()`）
  - 理由: 同リポジトリの既存イベント payload は、識別子をブランド型で型付けする確立パターンを持つ。`identity/events.ts` は `userId: UserId`、`ingestion/events.ts` は `jobId: IngestionJobId`、`export/events.ts` は `ownerId: UserId` を payload に持つ。本イベントの `actorId` は「変更を行った admin の UserId」という同じ意味の識別子でありながら生 `string` で、ドメイン層の型付け規約から外れている。「make illegal states unrepresentable at the type level」（CLAUDE.md）の観点でも、ブランド型なら未検証 string の混入をコンパイル時に弾ける。
  - 補足: payload に `UserId` を載せると、生成側（usecase）が現在保持しているのは生 `string`（`input.actorUserId`）なので `UserId.create()` を 1 回挟む必要がある。decoder 側は rehydrate 境界で `UserId.create()` を呼ぶのが既存 export/identity decoder と整合（at-rest payload は未検証）。これは「設定変更は純粋な変更通知」という ADR-006 の軽量化方針とトレードオフだが、`aggregateId` を `INSTANCE_SETTINGS_ID` にした一方で actor だけ素の string なのは型付けの一貫性として弱い。最低限、決定として明示しておく価値がある。
  - 提案: `payload.actorId: UserId` に変更し、decoder で `UserId.create(p.actorId)` を通す。重くしたくない判断なら「actorId はブランド化しない（純粋通知のため）」という一行を events.ts のコメントか ADR に残す。

### Notes

- **[N-001]** イベント二相モデル（DraftBase / Base）への準拠は正しい。`InstanceSettingsUpdatedEvent` を `DomainEventBase<type, payload>` で定義し、ファクトリ `AdminSettingsEvents.updated` が `EventDraft<...>`（id なし）を返す形は `identity/events.ts` `ingestion/events.ts` と完全に一致。`EventId` 付与を application 層（`collectEvents` / `attachEventIds`）に委ね、ドメインを `IdGenerator` から自由に保つ原則を守っている。events.ts のコメントもこの意図（WHY: なぜドメインが id を持たないか、なぜ aggregate 自身が emit しないか）を簡潔に説明しており、CLAUDE.md のコメント方針（WHY を残す）に沿う。
- **[N-002]** 「活動ログは read-model でありドメイン概念にしない」という ADR-001 / plan の方針が守られている。`app/core/domain/activityLog/` 等のドメインエンティティは新設されず、`ActivityKind`（`user_created` | `large_upload` | `job_failed` | `settings_changed` | `export_completed`）も application 層（`activityLog/types.ts`・ハンドラ）に閉じている。projection ハンドラ（`handleInstanceSettingsUpdatedEvent.ts` 等）は application 層に置かれ、ドメインに read-model 構築ロジックが漏れていない。ドメイン不変条件を持たない概念をドメイン値オブジェクトにしない判断が一貫している。
- **[N-003]** `settingKind` ユニオンが「emit する usecase の棚卸し」と厳密に一致している。events.ts の 6 値（registration_policy / llm_config / speech_config / prompt_template / instance_limits / design_tokens）、decoder の `z.enum`（`satisfies z.ZodType<InstanceSettingKind>` で型レベル同期）、各 usecase の emit 実態（`toggleRegistrationPolicy` ほか）が三者整合。ADR の「emit しない」群（`reencryptApiKey` / `updateUserPromptOverride` / `rebuildSearchIndex`）はユニオンに含まれず、取りこぼし・余剰が無い。no-op ガード（`next === current` / `next !== current` 時に emit しない）も `updatePromptTemplate` `updateDesignTokens` `resetDesignTokens` `resetPromptTemplate` `resetAllPromptTemplates` で正しく実装され、ADR-005 の冪等方針（虚偽の変更行を出さない）と整合。
- **[N-004]** `aggregateId` に `INSTANCE_SETTINGS_ID`（`"singleton"`）を使っており、singleton aggregate の同一性をイベントメタにも正しく反映している。`DomainEventDraftBase.aggregateId: string` 契約に適合し、entity の `INSTANCE_SETTINGS_ID as const` を再利用しているため source-of-truth が一元化されている。
- **[N-005]** BusinessRuleError / VO 構築時検証の規約に違反する新規ドメインコードは無い。本イベントはドメイン不変条件を持たない「変更通知」であり、events.ts にバリデーションが無いのは妥当（検証は emit 元 usecase の VO 構築と decoder の zod 境界で担保）。`*ErrorCode` 命名規約に関わる新規エラーコード追加も無し。
