# PR Review #001 — feat(issue/218): admin prompts/design tokens override model with reset

**PR:** #260
**Date:** 2026-05-28
**Round:** 1 回目

---

## Summary

- Blockers: 0
- Warnings: 8
- Notes: 多数（参考）
- Verdict: **BLOCKED**（Warning 修正後に再レビュー）

---

## Domain

### Blockers
なし

### Warnings
- **[D-W-001]** `InstanceSettings.updatePrompt` の「非空テンプレート前提」契約がコード上未強制
  - 場所: `app/core/domain/adminSettings/entity.ts:177-187`
  - 理由: ADR-006 は「非空前提」を宣言するが、実装は空文字テンプレートでもそのまま `{ ...prompts, [purpose]: template }` を作る。`rehydratePrompts` 側で `text === ""` を落とすため、ラウンドトリップでデータが暗黙に消える罠が残る。
  - 提案: 実行時ガードとして `if (template.text.length === 0) throw new BusinessRuleError(AdminSettingsErrorCode.InvalidPromptPurpose, "updatePrompt requires non-empty text")` を追加（または新規 errorCode）。

### Notes
- **[D-N-006]** `app/core/adapters/d1/promptResolver.ts:57-60` の JSDoc が `InstanceSettings.default()` を「全 purpose を空文字で materialise」と書いており、新セマンティクス（`{}` を返す）と食い違う。挙動は不変だが文言を直すと整合する。

---

## Use Case

### Blockers
なし

### Warnings
- **[U-W-001]** （所感、即時修正必須ではない）`updatePromptTemplate` で `text` 不変時の no-op skip がなく、二重押下で OCC version が無駄に進む余地。
  - 場所: `app/core/application/adminSettings/updatePromptTemplate.ts:39-56`
  - 判断: ドメイン `updatePrompt` の責務と読めるため、Phase 4 で別 Issue 候補。本 PR では対応見送り。
- **[U-W-002]** reset 系 2 ユースケースに non-admin の `ForbiddenError` 検証ケースがない
  - 場所: `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts`
  - 提案: `resetPromptTemplate`／`resetAllPromptTemplates` それぞれに admin 拒否ケースを 1 件ずつ追加。
- **[U-W-003]** `resetAllPromptTemplates` の冪等性（上書きが無いとき DB に bootstrap 行を書かない）テストがない
  - 場所: 同上
  - 提案: 既存 `resetPromptTemplate` の no-op テスト（L953-968）に対称な 1 件を追加。

### Notes
- **[U-N-001..N-008]** UoW / 認可 / DTO 射影 / エラー契約 / index export はいずれも既存パターンと一貫。問題なし。

---

## Frontend

### Blockers
なし

### Warnings
- **[F-W-001]** `resetPromptTemplateSchema.purpose` / `updatePromptTemplateSchema.purpose` が `z.string()` 止まりで、同ファイル内の dual-list 規約（`LLM_PROVIDERS_TRANSPORT` ↔ `LLM_PROVIDERS`）から外れる
  - 場所: `app/components/admin/schema.ts:67-75`
  - 提案: `PROMPT_PURPOSES_TRANSPORT = ["structure","title","directory","metadata","ocr_assist"] as const` を追加し、両 schema を `z.enum(PROMPT_PURPOSES_TRANSPORT)` に。
- **[F-W-002]** PromptCard の reset 完了時に「保存しました」が表示される（誤誘導）
  - 場所: `app/components/admin/PromptsForm/index.tsx:127-140, 207-209`
  - 提案: `savedAt` を `{ kind: "saved" | "reset", at }` のタグ付き状態にしてラベル切替（"リセットしました" 表示）。
- **[F-W-003]** override 中に textarea を空にして save 不可になったとき、リセット導線への案内がない
  - 場所: `app/components/admin/PromptsForm/index.tsx:225 周辺`
  - 提案: `isOverridden && text.trim().length === 0` の状態で「空にしたい場合は『この項目をリセット』を使ってください」の補助テキストを表示する。

### Notes
- **[F-N-1..N-8]** dead branch / 冗長条件 / DesignTokens の保存ボタン disabled の表記揺れ等、軽微な参考事項。修正は任意。

---

## Spec

### Blockers
なし

### Warnings
- **[S-W-001]** UI ヒント文言と spec のテスト期待文言が完全一致していない
  - 場所:
    - 実装: `app/components/admin/PromptsForm/index.tsx` L156-169（"既定値: （プロバイダ既定指示）"）
    - spec: `spec/scenario/admin.md`、`spec/pages/index.md`、`spec/manual-tests/admin.md` TC-I2-01 step1 / TC-I2-04 step2（"LLM プロバイダの既定指示を使用"）
  - 提案: spec 側を実装に合わせる（「『既定値: （プロバイダ既定指示）』のヒント」に統一）。

### Notes
- **[S-N-001]** `ResetPromptTemplate` のエラー記載 `ValidationError(...)` は実装の `BusinessRuleError` と語彙ずれだが、既存 `UpdatePromptTemplate` 記載との慣例踏襲。本 PR の責ではないため見送り。
- **[S-N-002]** `spec/usecases/adminSettings.md` 冒頭の「すべて admin」注記との不整合は既存問題、本 PR の責ではない。
- **[S-N-003]** `.issue/218/adr.md` ADR-001 Decision の最後の一文（"`updatePrompt` は `text === ""` でキー削除、非空でキー追加"）が ADR-006 で書き換えた内容と矛盾。
  - 提案: 該当文言を ADR-006 整合に直す。
- **[S-N-004..N-007]** 用語一貫性・5 値 SSOT 化・no-op 記載・P23 注記は概ね揃っている。

---

## Design Decisions

このラウンドで新規 ADR は不要。既存 ADR-001 の文言整合（S-N-003）は本ラウンドで修正する。

---

## 対応方針

修正対象:
1. **[D-W-001]** `entity.ts` `updatePrompt` に空文字ガード追加
2. **[U-W-002][U-W-003]** integration test に admin 拒否 2 件・resetAll 冪等性 1 件を追加
3. **[F-W-001]** `schema.ts` に `PROMPT_PURPOSES_TRANSPORT` 追加、両 schema を `z.enum` 化
4. **[F-W-002]** `PromptsForm/index.tsx` の `savedAt` を tag 付き状態化
5. **[F-W-003]** override 中 + 空状態の補助テキストを追加
6. **[S-W-001]** spec/scenario/admin.md, spec/pages/index.md, spec/manual-tests/admin.md の文言を実装に合わせる
7. **[D-N-006]** `promptResolver.ts` JSDoc を修正
8. **[S-N-003]** `.issue/218/adr.md` ADR-001 末尾を ADR-006 整合に修正

見送り（フォローアップ Issue 候補）:
- **[U-W-001]** ドメイン `updatePrompt` の no-op skip — Phase 4 で別 Issue 起票検討
