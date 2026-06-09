# PR Review #001 — feat(identity): P06 メール変更確認にアドレス差分カードを追加

**PR:** #613
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 11
- Verdict: **BLOCKED**（Warning 0 まで潰すため）

---

## Use Case / Application

### Blockers
なし

### Warnings
- **[W-001]** DTO の型注釈と実際に流す値の「ブランド剥がし」が暗黙的
  - 場所: `app/core/application/identity/verifyEmailChange.ts:56-60` / `13-17`
  - 理由: `EmailAddress`（ブランド string）を `oldEmail: string` / `newEmail: string` に代入。構造的サブタイプで型安全だが、ブランドを意図的に剥がしていることがコード上明示されておらず、暗黙のワイドニングに依存。将来 brand が nominal 化されると壊れて気づきにくい。
  - 提案: 射影点で `as string` で明示脱ブランド、または `VerifyEmailChangeOutput` に JSDoc で意図を一行添える。

### Notes
- N-001: `found.entity.email` が変更前の値である保証は実コードで裏付け（`User.changeEmail` は純粋関数）。
- N-002: UoW コールバック戻り値の直接 return はトランザクション境界・エラー伝播ともに健全。
- N-003: server function は出力を明示射影、入力境界は不変で規約準拠。
- N-004: PII の新規ログ出力なし。
- N-005: 統合テストの `oldEmail` アサーションは ADR-001 準拠で妥当。

## Frontend / UX / a11y

### Blockers
なし

### Warnings
- **[W-001]** ADR-002 の「ラベルテキストで意味を担保」の記述が実態よりやや強い
  - 場所: `.issue/594/adr.md`（ADR-002）/ `app/components/auth/EmailChangeConfirm/index.tsx:114-117`
  - 理由: ラベル（旧アドレス/新アドレス）は旧/新の**区別**を担保するが、「無効化」の意味は直後の warning alert（`role="status"`）が担う。取り消し線は視覚専用。機能・a11y 上の実害はなくモック準拠だが、ADR の記述が正確でない。
  - 提案: ADR-002 の Consequences を「ラベルは旧/新の区別を担保し、無効化の意味は warning alert が担保する」と正確化。

### Notes
- N-001: トークンマッピング全項目モックと完全一致（実値照合済み・リテラル px なし）。
- N-002: 旧行 `font-medium`→`font-normal` 上書きは生成 CSS 順で正しく効く（dist 確認済み）。
- N-003: `biome-ignore`（useSemanticElements）は FilterBar 等の先例に倣い妥当。
- N-004: `aria-live` 非付与は二重読み上げ回避で適切。
- N-005: 長いアドレス折返し・エラー時非表示は型安全に担保。
- N-006: 状態管理の配線漏れなし。

## Test

### Blockers
なし

### Warnings
なし

### Notes
- N-001〜N-005: アサーション値・正規化整合・ADR-001 準拠・カバレッジ粒度いずれも妥当。問題なし。

---

## Design Decisions

ADR-002 の記述の正確化（Frontend W-001）をこのラウンドで反映する。新規の設計判断はなし。
