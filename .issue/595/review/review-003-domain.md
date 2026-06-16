# PR #746 レビュー（Round 3 / 最終収束確認）— Domain

対象: Issue #595（P40 ダッシュボード 24h チャート + 最近のアクティビティ backend）
観点: Domain
前提: review-002-usecase.md の W-001（`resetDesignTokens` no-op 短絡が domain entity で未修正 = ガード dead code）の修正確認を含むゼロベース再レビュー
ブランチ: `issue/595/admin-dashboard-charts-activity`（HEAD + 未コミット作業ツリーを対象）

## 前ラウンド指摘の検証

- **review-002 W-001（`resetDesignTokens` の no-op 短絡が domain に無くガードが dead code）= 修正済み**。
  `app/core/domain/adminSettings/entity.ts:371-384` の `resetDesignTokens` に
  `if (designTokensEqual(settings.designTokens, DesignTokens.empty())) return settings;` を追加し、
  `resetAllPrompts`（`Object.keys(settings.prompts).length === 0` 短絡）と対称な「リセット対象が無いなら同インスタンス返却」になった。
  これにより usecase `resetDesignTokens.ts:32` の `if (next !== current)` ガードが実際に効き、
  override 無し状態の reset で `instance_settings.updated` を emit しなくなる（ADR 実装メモ adr.md:223「実変化時のみ emit」と一致）。
  回帰テスト `entity.test.ts:336-341`「resetDesignTokens on an already-empty map is a no-op」（`same === current` / version 不変）追加済み。entity 単体 40 件パス。
  短絡条件は厳密に「現状トークンが空（= リセットで何も変わらない）」のときだけ true で、version/不変条件を壊さない（空でない場合のみ `Version.next` + 新 `DesignTokens.empty()`）。`DesignTokens.empty()` は `{ tokens: {} }` を返すため `designTokensEqual` の対象も正しい。

## Domain

### Blockers

なし

### Warnings

なし

review-002 W-001 はドメイン側で正しく修正された。短絡条件の厳密性・対称性・version 不変条件いずれも問題なし。新規ドメイン要素（`events.ts` の `InstanceSettingsUpdatedEvent` / `AdminSettingsEvents.updated`）も二相イベントモデル・規約に適合。確認点:

- **二相イベントモデル準拠**: `AdminSettingsEvents.updated` は `EventDraft<InstanceSettingsUpdatedEvent>`（`EventId` 無し）を返す identity-less ファクトリ。`IdGenerator` を持ち込まず、id 付与は application 層 `collectEvents` 路に委ねる（ADR-006 / `events.ts:33-40` の JSDoc どおり）。`InstanceSettings` アグリゲート自体は emit せず純粋な変更通知に留める設計で、ドメインを `{entity,eventDrafts}` 化して重くしていない（S-003-arch 見送り判断と整合）。
- **`actorId` の型強化（未コミット差分）**: `events.ts` で `actorId: string` → `actorId: UserId`（`@/core/domain/identity/valueObject`）へ tightening。`assertAdmin` は `User`（`identity/entity`）を返し `actor.id` は `UserId` なので、usecase からキャスト無しで流れる。illegal-state-unrepresentable を型で前倒しする良い変更で、ドメイン規約に沿う。
- **不変条件・mutation の整合**: `resetDesignTokens` 以外の mutation（`updateSpeech` 等）は `Version.next` + `updatedAt` スタンプの確立パターンを踏襲。`updateSpeech` の speech-only 更新で `llm` 等が保たれることを `entity.test.ts:71-85` が検証。
- **`settingKind` ユニオン**: `events.ts:12-18` の 6 値が emit 対象 usecase（adr.md B-6 棚卸し）と一致。`reencryptApiKey` / `updateUserPromptOverride` を含まずユニオンに混入させていない。

### Notes

- **[N-001]** `resetDesignTokens` usecase だけ「no-op 時も `save(next, expectedVersion)` を無条件に呼ぶ」点が sibling reset usecase と非対称。
  / 場所: `app/core/application/adminSettings/resetDesignTokens.ts:28-32`（cf. `resetPromptTemplate.ts:32` / `resetAllPromptTemplates.ts:29` は `if (next === current) return;` で `save` ごと早期 return）
  / 内容: ドメイン短絡修正後、`next === current`（no-op）でも `save` が走る。ただし `next === current` は version 据え置きの同一インスタンスなので、`save` は同 version を書き戻すだけの無害な no-op write（version bump せず・event も出ない）。Domain 観点では `resetDesignTokens` ドメイン関数の挙動・不変条件は完全に正しく、これは usecase 層の軽微な書き込みパターン非対称（application スコープ）。Domain レビューとしては記録のみで、ブロッカー/ウォーニングではない。気になれば usecase 側を `if (next === current) return;` に揃えると 3 reset usecase が完全対称になる。

- **[N-002]** review-002 N-002 と同旨だが Domain 視点で補足: `setRegistrationOpen` / `updateLLM` / `updateSpeech` / `updateLimits` のドメイン mutation には `next === current` 短絡が無く、同値再保存でも version を bump する。これは「常に save → 常に emit」の意図的設計（adr.md B-6 表）であり、no-op ガードを持つのは「リセット系 + 値置換系（prompt / designTokens）」に限るという一貫した方針。AC-6 の「no-op 時に emit しない」要求は no-op ガードを持つ usecase のみに掛かるため逸脱ではない。ドメイン不変条件の破壊も無い。記録のみ。
