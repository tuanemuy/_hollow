# PR Review #001 — fix(#349): パスワード最小長を domain に揃える (transport 12..128)

**PR:** #350
**Date:** 2026-05-30
**Round:** 1回目（小規模Issue・単発レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## Presentation / Transport boundary

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `app/components/auth/schema.ts:11-16` — `PASSWORD_MIN_LENGTH` を 12、`PASSWORD_MAX_LENGTH` を 128 に変更し、domain 値オブジェクト `RawPassword`（`app/core/domain/identity/valueObject.ts:32-33` の `12..128`）と一致させた。追加した3行コメントが「なぜ domain をミラーするか（field エラーで先に弾く）」という非自明な WHY を簡潔に説明しており CLAUDE.md のコメント方針に沿う。定数は signUp / adminSignUp / passwordResetConfirm / login の各 schema と、各フォームの placeholder・minLength・maxLength・hint・強度メーターしきい値・Zod メッセージから参照されるため、定数変更だけで全箇所が一貫して 12..128 に揃う（直書きの「8」「256」は実装側に存在しないことを grep で確認）。
- **[N-002]** `LoginForm/index.tsx:157` の HTML `maxLength` が 256→128 に変わるが、domain max=128 を超える有効パスワードは `RawPassword.create` を通過できず存在し得ないため、既存ユーザーのログイン入力を truncate するリスクはない。`loginSchema` の password は `min(1)` のままで最小長の影響も受けない。回帰なし。
- **[N-003]** `app/components/auth/__tests__/schema.test.ts:11` の有効パスワードを `"Passw0rd!23"`（11文字）→ `"Passw0rd!234"`（12文字、英字+数字+記号）に更新。min=12 で「accepts a valid payload」テストが落ちる問題を解消。`too-short`（`"short"`）テストは引き続き有効で変更不要。

---

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-004]** integration テスト（`identity.integration.test.ts` の `strongPassword` ヘルパー）は既に 12 文字を生成するため domain 側変更なしで影響なし。`pnpm test:unit` 2848 件 全 PASS、`pnpm typecheck` / `lint` / `format` クリーン。ブラウザ検証（`.issue/349/manual-test/report.md`）でも signup フォームの 11文字→field直下エラー / 12文字→通過 / placeholder「12文字以上」表記を確認済み。

---

## Design Decisions

- ADR-001（`.issue/349/adr.md`）: `PASSWORD_MAX_LENGTH` も transport=256→domain=128 に揃える判断。Issue 本文の「想定対応」は min のみだが、同一ファイル・同一定数ブロック・同種のバグクラスであり issue-implement Phase 4 の「同じファイルの問題は原則その場で修正」に該当。妥当な判断であり PR 説明・ADR で明示されているため、レビュアーが分離を望めば 1 行で revert 可能。承認に問題なし。

---

## 総評

変更は定数2つとテスト1行のみで、波及はすべて定数経由で一貫。domain を真実のソースとする Issue の意図を正確に満たし、max の同種不整合も同 PR で解消している。設計判断は ADR に記録済み。自動テスト・型・lint・ブラウザ検証すべてクリーン。**APPROVED**。
