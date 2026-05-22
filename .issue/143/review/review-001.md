# PR Review #001 — feat(admin/llm): surface env override state in UI

**PR:** #146
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 17
- Notes: 多数
- Verdict: **BLOCKED**

---

## Use Case + DTO

### Blockers

- **[B-UC-001]** silent skip 経路で `LLMConfig.create` invariant 違反による reject が起こりうる
  - 場所: `app/core/application/adminSettings/updateLLMConfig.ts:97-132`
  - 理由: env.provider="anthropic" 固定 / env.baseURL=null / current.llm={anthropic, baseURL:null} / input={provider:"openai", baseURL:"https://..."} を直接 POST すると、`effectiveProvider="anthropic"` (DB 維持) / `effectiveBaseURL=input.baseURL` (env 未 override なので input 採用) となり `BusinessRuleError(InvalidLLMBaseURL)` が throw。ADR-001「silent skip」契約に違反
  - 提案: effective 値確定後に「`effectiveProvider !== "openai"` なら baseURL を null に落とす」reconcile を追加 + integration test 追加

### Warnings

- **[W-UC-001]** `AdminSettingsService.assertEnvOverride` の apiKey 判定が `trim().length === 0` で ADR-002 (length > 0、trim しない) と不整合
  - 場所: `app/core/domain/adminSettings/service.ts:49`
  - 提案: ADR で意図的な差として明記するか、別 Issue 起票

- **[W-UC-002]** `RequestContainer.adminSettingsEnv` JSDoc が 1 field 時代のまま陳腐化
  - 場所: `app/core/application/di/types.ts:193-198`
  - 提案: `AdminSettingsEnv` JSDoc を参照する形に書き換え

- **[W-UC-003]** DTO の provider キャストコメントの "transport boundary" が誤解を招く
  - 場所: `app/core/application/dto/adminSettings.ts:108-115`
  - 提案: 「validated by `createLLMProvider`'s `default: throw` at DI bootstrap」と書き換え

- **[W-UC-004]** encrypt 冗長許容コメントが意図を完全に伝えていない
  - 場所: `app/core/application/adminSettings/updateLLMConfig.ts:85-88`
  - 提案: 「intentional: admin-gated so DoS surface is irrelevant」程度に補強

- **[W-UC-005]** `logger.warn` の event/message 重複
  - 場所: `app/core/application/adminSettings/updateLLMConfig.ts:141-144`
  - 提案: `event` プロパティを drop し payload は `{ fields }` のみに

### Notes
- N-UC-001〜006: 良い設計の指摘（ADR-007 の null 経路 / DTO の boolean 化 / Cross-layer catch policy 準拠 / DTO projection の UoW 外 / `.dev.vars.example` の運用 note）

---

## Infrastructure / DI

### Blockers
なし

### Warnings

- **[W-DI-001]** （W-UC-001 と同じ）`assertEnvOverride` の trim 不整合
  - 場所: `app/core/domain/adminSettings/service.ts:49`
  - 提案: フォローアップ Issue 推奨

- **[W-DI-002]** `readRequestServerConfig` の env presence 判定が truthy で、container 側の `length > 0` と表記非対称
  - 場所: `app/core/application/di/serverCloudflare.ts:266-268`
  - 提案: コメントで「container 側で最終正規化するため readRequestServerConfig 側は truthy で十分」と注釈、または両者を統一

- **[W-DI-003]** `resolveConsumerLlmConfig` (env 直読み) と `readRequestServerConfig` (thread) の二重実装が doc のみで結合
  - 場所: `app/core/application/di/serverCloudflare.ts:128-132, 705-709`
  - 提案: `ADMIN_LLM_BASE_URL` の admin/consumer 一致を contract test でロック（follow-up Issue 推奨）

- **[W-DI-004]** （W-UC-002 と重複）`RequestContainer.adminSettingsEnv` JSDoc 陳腐化

### Notes
- N-DI-001〜006: 良い設計（Readonly / consumer 経路無変更 / fixture 漏れなし / Hexagonal 準拠 / destructure-and-narrow パターン / serverCloudflare.test.ts 3 ケース）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-F-001]** `INPUT_CLASS` / `SELECT_CLASS` に `disabled:` variant が無く、ADR-006 の "disabled スタイリングを Tailwind variant で整える" と不一致
  - 場所: `app/components/admin/LLMSettingsForm/index.tsx:43-46`
  - 提案: `INPUT_CLASS` / `SELECT_CLASS` に `disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface` 相当を追加

- **[W-F-002]** 各 env-locked field の hint `<p>` が `aria-describedby` で input と結合されていない（a11y）
  - 場所: `app/components/admin/LLMSettingsForm/index.tsx:253-259, 311-317, 391-396, 453-459`
  - 提案: 各 hint に `id` を付与し、input に `aria-describedby={envOverrides.X ? "..." : undefined}` を渡す

- **[W-F-003]** baseURL が `provider === "openai"` のときしか render されないため、`ADMIN_LLM_PROVIDER=anthropic` + `ADMIN_LLM_BASE_URL=set` の組み合わせで lock の痕跡が UI に現れない
  - 場所: `app/components/admin/LLMSettingsForm/index.tsx:276 (showBaseURL gate)`
  - 提案: `showBaseURL = provider === "openai" || envOverrides.baseURL` に拡張

- **[W-F-004]** `required={!envOverrides.model}` の表記揺れ（同ファイル内で `required={apiKeyRequired || undefined}` と書き分け）
  - 場所: `app/components/admin/LLMSettingsForm/index.tsx:441`
  - 提案: `required={!envOverrides.model || undefined}` に揃える

### Notes
- N-F-001〜007: 良い設計（data-* attribute 規約準拠 / utility-first / `providerChanged` 抑制 / secret hygiene / serialized error kind）

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** view.test.ts に provider 単独 / model 単独 / baseURL 単独 set ケースの pinpoint テストが無い
  - 提案: 各 field 単独 set で他は DB 値が残ることを 1 ケースずつ assert

- **[W-T-002]** `env.apiKey null + DB ciphertext あり` のケースで `apiKeyMasked` が DB 由来でマスクされ、ciphertext 生値が JSON に出ない regression テストが無い
  - 提案: view.test.ts に追加

- **[W-T-003]** `serverCloudflare.test.ts` の length>0 境界に whitespace-only (`" "`) のケースが無い（ADR-002「trim しない」の保証）
  - 提案: serverCloudflare.test.ts に追加

- **[W-T-004]** silent skip integration テストが `logger.warn` 呼び出しを検証していない
  - 場所: `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts:374-434`
  - 提案: spy で `{ event, fields }` 呼び出しを assert

- **[W-T-005]** `env.apiKey set + env.provider set + apiKeyPlain 入力` の複合 silent skip テストが無い

### Notes
- N-T-001: LLMSettingsForm UI 防御テスト未実装（既存ファイル無し条件で skip 可、follow-up）
- N-T-002〜005: 良いテスト（env overlay pinpoint / threading 3 ケース / providerChanged 抑制 / manual-test secret hygiene）

---

## Security

### Blockers
なし

### Warnings

- **[W-S-001]** `view.ts:48` で `maskApiKey` を常に呼び出すため、env override 時にも DB ciphertext がマスクされてから DTO 三項で null に置換される。defense-in-depth として view.ts 段階で env-aware にすべき
  - 場所: `app/core/application/adminSettings/view.ts:48`
  - 提案: `env?.apiKey ? null : maskApiKey(settings.llm)` に変更 + ciphertext regression テスト

- **[W-S-002]** logger.warn payload に env 値/input 値/ciphertext を含めない不変条件が JSDoc 化されていない
  - 場所: `app/core/application/adminSettings/updateLLMConfig.ts:138-145`
  - 提案: JSDoc または一行コメントで明示

- **[W-S-003]** （W-UC-001/W-DI-001 と同じ）`assertEnvOverride` trim 不整合のセキュリティ影響
  - 提案: 実害は小さいが「admin UI と save 経路の乖離リスク」として記録

- **[W-S-004]** transport schema strict + assertAdmin 順序は正しい（指摘ではなく確認事項）

### Notes
- N-S-001〜005: 良い設計（envOverrides 型レベル不変条件 / Secret hygiene 検証 / defense-in-depth 2 層 / 攻撃面縮小 / testLLMConnection schema strict）

---

## Design Decisions

このラウンドで見つかった設計判断:

- **`assertEnvOverride` の trim 挙動**: 既存実装で whitespace-only apiKey を「未設定」と扱う。ADR-002 (length > 0、trim しない) と細部不一致だが、本 Issue 範囲で潰すと既存 `service.test.ts:83 "treats whitespace-only env.apiKey as missing"` テストを翻す必要があり影響広い。**ADR-008 として「本 Issue では既存挙動を維持」と明記、別 Issue で対応**。

- **baseURL UI render 条件**: provider=openai 時のみ baseURL input を描画する既存実装は OpenAI 互換 API の base URL という意味論を反映している。env override 時の lock 可視化のため `showBaseURL = provider === "openai" || envOverrides.baseURL` に拡張する（W-F-003 修正）。

- **silent skip 経路の LLMConfig invariant 守護** (B-UC-001 への対応): silent skip 完了後の effective 値確定段階で `LLMConfig.create` 不変条件を尊重する reconcile を 1 行追加する。effective provider が openai 以外なら effective baseURL を null に強制。これにより silent skip 契約と LLMConfig invariant の両立を保証する。
