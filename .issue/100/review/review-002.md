# PR Review #002 — feat(infra): wire R2 ObjectStorage / TempFileStorage and remove production Stubs

**PR:** #150
**Date:** 2026-05-22
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 9
- Verdict: **APPROVED**

Round 1 で挙がった 9 件の Warning（重複含む実質 7 観点）に対する修正コミット `72ba717 fix(issue-100): address review-001 feedback` 適用後の再レビュー。

---

## Round 1 指摘の解消状況

| ID | Status | 検証結果 |
|---|---|---|
| A-W-001 | ✅ 解消 | `.issue/100/plan.md:64` が `async () => { throw new ... }` クロージャ形に統一され、ADR-001 参照が追記 |
| T-W-001 | ✅ 解消 | `serverCloudflare.test.ts:220` のテスト名が `"surfaces explicit unavailable errors from inline unavailable storage adapters and StubLLMProvider"` に改名 |
| I-W-001 | ✅ 解消 | `serverCloudflare.ts:335,:359` の両 factory が `satisfies ObjectStorage` / `satisfies TempFileStorage` で閉じられている |
| T-W-002 | ✅ 解消 | `assertTempFileStoragePortUnavailable` ヘルパー（L314-326）が TempFileStorage port 全 3 メソッドを網羅 |
| T-W-003 | ✅ 解消 | `createConsumerContainer` 側に TEMP_FILES 欠落の単独 `it` ケース（L870-876）が追加 |
| T-W-004 / I-W-002 / A-W-003 | ✅ 解消 | `handlers.integration.test.ts:833` に `toHaveBeenCalledTimes(1)` + `mock.results[0]` resolve 検証 + コメント補足が追加 |
| A-W-002 | ✅ 解消 | PR description Summary に Traceability note 追記 |
| I-W-003 | ✅ 解消 | `r2ObjectStorage.ts` 冒頭の重複 JSDoc が `R2ObjectStorage` クラス JSDoc にマージ |

---

## Round 2 統合レビュー

### Blockers
なし

### Warnings
なし

### Notes

- **A-W-001 解消**: `.issue/100/plan.md:64` が `async () => { throw new ... }` クロージャ形に統一され、末尾に「理由は `.issue/100/adr.md` ADR-001 を参照」が追記された。ADR-001 と完全に符合。
- **T-W-001 解消**: `serverCloudflare.test.ts:220` のテスト名が `"surfaces explicit unavailable errors from inline unavailable storage adapters and StubLLMProvider"` に改名され、`production Stubs` 表現が消えた。
- **I-W-001 解消**: `serverCloudflare.ts:335`, `:359` の両 factory が `satisfies ObjectStorage` / `satisfies TempFileStorage` で閉じられ、port シグネチャ変更時のコンパイル時回帰検知が有効。型推論の戻り型は関数宣言で固定済みで他箇所への影響なし。
- **T-W-002 + T-W-003 解消**: 新ヘルパー `assertTempFileStoragePortUnavailable` は TempFileStorage port の全 3 メソッド（put / get / delete）を網羅し、`createRequestContainer` 側（L343）と `createConsumerContainer` 側（L870-876）の両方で呼び出されている。consumer 側のヘルパー呼び出しは既存 `assertObjectStoragePortUnavailable` パターンと完全対称。
- **T-W-004 + I-W-002 + A-W-003 解消**: `handlers.integration.test.ts:833` に `expect(r2GetSpy).toHaveBeenCalledTimes(1)` 追加、`mock.results[0]` 経由で「return type + 解決値が ArrayBuffer」を assert。コメントで「unavailable fallback なら throw して bubble up する → spy hit = R2 wire 済み」の論理が明文化。`vi.spyOn` の async メソッドに対する `mock.results[0]` は `{ type: "return", value: Promise<ArrayBuffer> }` で構造的に安全。
- **A-W-002 解消**: PR description Summary に Traceability note として「Issue 本文 (1)〜(3) は Issue #110 などの先行作業で既に配備済み。本PR は (4)(5) の Stub クラス削除部分を完了させる」が追記されている。
- **I-W-003 解消**: `r2ObjectStorage.ts` の冒頭重複 JSDoc が削除され、`R2ObjectStorage` クラス JSDoc（L34-52）に「production-runtime fallback は serverCloudflare.ts の inline factory で、ADR-001 を参照」段落としてマージ。`R2PresignConfig` 直前の誤読リスクが解消。
- 自動チェック全 green: `pnpm typecheck` clean、`pnpm test:unit` 114 files / 2221 tests passed、`pnpm test:integration` 33 files / 367 tests passed。
- リグレッション・副作用: なし。`satisfies` 付与はコンパイル時のみで他箇所影響なし。新ヘルパーは既存パターンと一貫した API。consumer-side 新 it ケースは it.each ではなく単独 `it` だが、`TEMP_FILES` 欠落は 1 通りしかないため it.each 化は過剰と判断され既存パターンと整合。

---

## Design Decisions

このラウンドで新たな設計判断は発生していない。すべて Round 1 の指摘修正で完結。

---

## Verdict

**APPROVED** — Blocker 0 / Warning 0。 マージ準備完了。
