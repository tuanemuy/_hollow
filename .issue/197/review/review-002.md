# PR Review #002 — feat(identity): wire Resend email sender with dev-fallback gate

**PR:** #200
**Date:** 2026-05-24
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全レイヤーで Round 1 指摘の解消を確認
- Verdict: **APPROVED**

Round 1 で挙がった 1 Blocker + 14 Warnings はすべて解消、または document-only / follow-up と整理済み。新規の Blocker / Warning は検出されず。

---

## Adapter / Infrastructure (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **R1 Adapter W-001 (unexpected error の secret 漏洩理論)**: `resendEmailSender.ts:169-174` で `String(cause)` → `maskSecrets` → throw の経路に修正、test 側 (`test.ts:300-326`) で Bearer credential のマスクを fix
- **R1 Adapter W-002 (extractErrorDetail hang)**: `resendEmailSender.ts:189-213` で「text 一度だけ読んで JSON.parse」one-read 設計に書き直し、stream 二重読みリスク消失。`text/html` 502 経路を test (`test.ts:328-347`) で固定
- **R1 Test W-001..W-005**: 全件解消
- 新規観察はいずれも Note レベル（unknown locale ケース、`body.name` フォールバック、`endpoint`/`timeoutMs` override テスト等）でフォローアップ候補

---

## Application Layer / DI (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **R1 DI W-001 (RequestServerConfig JSDoc)**: AND ゲート / silent-failure 経路 / ADR-005 参照付きで明記
- **R1 DI W-002 (ServerEnv.EMAIL_FROM JSDoc)**: 「Empty / unset → AND gate fails, DI keeps ConsoleEmailSender regardless of RESEND_API_KEY state」で非対称性解消
- **R1 DI W-003 (truthy default が AND gate を退縮)**: per-stage 空文字デフォルト + `readRequestServerConfig` 透過二重防御で fail-safe 化
- **R1 DI W-004 (consumer 経由の RESEND_API_KEY 未使用)**: ADR-004 承認済み、対応不要
- **R1 DI N-005 (DI テスト不在)**: 7 ケース追加（readRequestServerConfig 3 + AND gate 4 象限）。AND gate 退縮防止が transport 境界 + DI 層の二重で検出される構造
- `vi.stubGlobal` + `try/finally { vi.unstubAllGlobals() }` で test 間のリーク無し

---

## Test (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **R1 Test W-001 ja locale for sendEmailChangeNotice**: 追加、4 メソッド × 2 locale (en/ja) の 8 セル網羅
- **R1 Test W-002 text fallback for extractErrorDetail**: non-JSON 502 で検証、実装は one-read 設計に修正済み
- **R1 Test W-003 HTML escape regression**: `&` の `&amp;` 変換を双方向 assert で固定
- **R1 Test W-004 fetch binding `vi.stubGlobal`**: 規範化、`afterEach(vi.unstubAllGlobals)` で flake 耐性向上
- **R1 Test W-005 unexpected error path**: 文字列 throw + Bearer credential を masked 確認
- **新規 Notes**: unknown locale、body.name fallback、endpoint/timeoutMs override の test 不在 — いずれも Note レベル、フォローアップ候補

---

## Infrastructure / Deploy (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **R1 Infra B-001 (resolved)**: `EMAIL_FROM_BY_STAGE: Record<Stage, string>` per-stage dict をデフォルト空文字で導入。`renderWrangler.ts:78-81` + `:127`。`Stage` union を `Record` で受けるため新 stage 追加時は TypeScript が網羅性を強制
  - `pnpm infra:render:staging` 経由で `wrangler.staging.toml` に `EMAIL_FROM = ""` が出力されることを確認済み
  - ADR-005 AND ゲートと噛み合い、silent 4xx 経路を閉じる fail-safe 設計
  - Operator runbook が ADR-006 補遺に 4 ステップで明記（domain verify → renderer 編集 → secret 追加 → deploy）
- **R1 Infra W-001/W-002/W-003**: document-only / フォローアップ Issue 起票推奨と整理済み。再提案なし
- ADR-006 の Decision ブロックに「review-001 の B-001 を受けて」の経緯まで記録、設計判断のトレーサビリティ確保

---

## Design Decisions

このラウンドで新規に下した設計判断はなし。Round 1 で派生した「per-stage 空文字デフォルト」は ADR-006 にすでに反映済み（Round 1 修正時点で記録）。

---

## 完了判定

`references/review-guide.md` Step 7: 「Blocker 0 件 かつ Warning 0 件 になったらレビュー完了。1 ラウンドでクリーンならその時点で終了する。」

→ **Round 2 で 4 レイヤーすべてクリーン**。Phase 3 完了とする。次は Step 8（PR を Ready for review に切り替え）。
