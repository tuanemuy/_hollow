# PR Review #002 — feat(admin/llm): surface env override state in UI

**PR:** #146
**Date:** 2026-05-22
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0（W-DI-003 は前回から持ち越しの follow-up Issue 候補として整理済み）
- Verdict: **APPROVED**

---

## Use Case + DTO (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- B-UC-001 解消: `updateLLMConfig.ts:104-109` で `safeBaseURL` reconcile 追加、両 `LLMConfig.create` 呼び出しで使用。`adminSettings.integration.test.ts:543-597` に交差点 regression テスト追加（PASS 確認済み）
- W-UC-002 解消: `types.ts:193-198` JSDoc が `{@link AdminSettingsEnv}` 参照形式に
- W-UC-003 解消: `dto/adminSettings.ts:106-110` provider キャストコメントが `createLLMProvider`'s `default: throw` 文脈に
- W-UC-004 解消: `updateLLMConfig.ts:84` に "admin-gated so DoS surface is irrelevant" 追記
- W-UC-005 解消: `logger.warn` payload は `{ fields }` のみ、`event` key drop 済み
- ADR-008 追加: `.issue/143/adr.md` に `assertEnvOverride` trim 挙動の維持方針記録

---

## Infrastructure / DI (Round 2)

### Blockers
なし

### Warnings
- **[W-DI-003 carry-over]** `resolveConsumerLlmConfig` (env 直読み) と `readRequestServerConfig` (thread) の二重実装 contract test がフォローアップ Issue 候補として整理されていない
  - 場所: `app/core/application/di/serverCloudflare.ts:128-132, 705-709`
  - 提案: Phase 4 で別 Issue 起票（ADR-008 basket に追記 or 単独起票）

### Notes
- W-DI-002 解消: `serverCloudflare.ts:266-268` に truthy vs length>0 の非対称を説明する一行コメント追加
- W-DI-004 解消: `types.ts:32-50` の `AdminSettingsEnv` JSDoc が 4 field + ADR-002 + consumer parity + silent skip semantics を網羅
- W-DI-001 → ADR-008 で記録、follow-up Issue 委譲
- `createRequestContainer` 内で 4 field 全てが `length > 0` 判定で統一、ADR-002 と完全整合

---

## Frontend (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- W-F-001 解消: `INPUT_CLASS` (`index.tsx:44`) に `disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface` 追加、`SELECT_CLASS = INPUT_CLASS` 派生
- W-F-002 解消: 4 field（provider/model/apiKey/baseURL）で `aria-describedby` と hint `<p>` の `id` 結合
- W-F-003 解消: `showBaseURL = provider === "openai" || envOverrides.baseURL` で env-locked baseURL が provider 非 openai でも可視化
- W-F-004 解消: `required={!envOverrides.model || undefined}` に統一
- `data-env-locked={envOverrides.X || undefined}` パターン CLAUDE.md `data-*` 規約準拠
- Utility-first / @theme inline トークン参照維持

---

## Test (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- W-T-001 解消: `view.test.ts:149-228` に provider/model/baseURL 単独 set 3 ケース追加
- W-T-002 解消: `view.test.ts:230-250` に `env.apiKey=null + DB ciphertext あり` の masking + JSON regression テスト追加
- W-T-003 解消: `serverCloudflare.test.ts:266-275` に whitespace-only ケース追加
- W-T-004 解消: `adminSettings.integration.test.ts:436-484` で `logger.warn` spy が `{ fields }` 呼び出しを直接 assert
- W-T-005 解消: `adminSettings.integration.test.ts:486-541` に複合 silent skip テスト追加
- B-UC-001 regression: `adminSettings.integration.test.ts:543-597` に追加
- 関連 102 テスト全 PASS

---

## Security (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- W-S-001 解消: `view.ts:48-54` で `env?.apiKey ? null : maskApiKey(settings.llm)` パターン。DTO 三項との二重防御 (defense-in-depth)
- W-S-002 解消: `updateLLMConfig.ts:148-150` に secret hygiene の不変条件コメント
- W-S-003 → ADR-008 で記録、follow-up Issue 委譲
- silent skip × LLMConfig invariant の reconcile は secret/権限境界に新規攻撃面なし
- `logger.warn` 呼び出しの spy 固定化で「payload に input/env 値を足すと CI が落ちる」回帰防壁が確立

---

## Design Decisions

このラウンドで新たな設計判断なし（B-UC-001 への対応は review-001 で「silent skip 完了後の effective 値確定段階で `LLMConfig.create` 不変条件を尊重する reconcile」として既に記録済み、実装で具体化）。

---

## Verdict

**APPROVED**

1 周目の Blocker 1 件 + Warning 17 件すべて解消（一部は ADR-008 / Phase 4 follow-up Issue 候補として整理）。新たな問題は検出されず。実装フェーズ完了。

## Phase 4 follow-up Issue 候補

review-001 で整理 + W-DI-003 を Round 2 で追加:

1. **`assertEnvOverride` apiKey trim 統一**（W-UC-001 / W-DI-001 / W-S-003）
2. **Admin / consumer env-baseURL contract test**（W-DI-003）
3. **`LLMSettingsForm` UI 防御テスト**（N-T-001）
