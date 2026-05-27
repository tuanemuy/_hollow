# PR Review #001 — common/styles.ts 新設で Dialog 周りの cross-domain import を解消

**PR:** #186
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16（Frontend 8 / Architecture 8）
- Verdict: **APPROVED**

1ラウンドで Blocker・Warning ともにゼロ。Phase 3 の完了条件（1ラウンドクリーンで終了）を満たし、レビューループ終了。

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** SSOT 移行の網羅性は確認済み。`common → note` の cross-domain styles import は完全に消滅し、`app/` 配下に `note/styles` 参照は残っていない（grep でゼロ件）。`app/components/note/styles.ts` は物理削除済み。note 配下 21 ファイルの `from "../styles"` 書き換えも漏れなく完了。
- **[N-002]** `common/styles.ts` の `dialog` JSDoc（`.issue/104/adr.md` ADR-005 参照付き）と `dialogCloseButton` JSDoc（a11y 契約：focus trap 包含 / initial-focus 除外 / `closable=false` 時の disabled）は plan.md ステップ 1 の要求通り文言保持されている。ファイルレベル JSDoc は「note components」→「common UI primitives (domain-agnostic)」へ書換済み。
- **[N-003]** `MergeTagDialog.tsx:143-150` の primary ボタンは ``className={`${pillBtn} ${pillBtnPrimary}`} data-primary=""`` で、`pillBtnPrimary` 定義の `data-[primary]:bg-accent` 系が attribute presence 経由で正しく適用される。utility-first + data-* 規約 (ADR-003) 準拠。キャンセルボタンは `pillBtn` 単独で danger なし、想定どおり。
- **[N-004]** ADR-001 で明示された視覚 regression（`active:scale-[0.985]` 喪失 / `max-sm:min-h-[44px]` 喪失 / `transition-all`→`transition-colors`）は妥当な判断。WCAG 2.5.5 Enhanced (44px) 未達は ADR-001 内で明示され testing.md チェックリスト化済み。Minimum レベル (24px) は満たす。
- **[N-005]** dangling reference 解消（plan ステップ 7）も `CLAUDE.md:47` と `app/components/tag/styles.ts:5` の例示順 (`common/styles.ts, auth/styles.ts, layout/styles.ts, public/styles.ts`) が一貫している。
- **[N-006]** スコープ外として `tag/TagActions.tsx`, `tag/CreateTagForm.tsx` 等に `../layout/styles` 経由の `PILL_BTN` / `FORM_ERROR` が残るが、plan.md「含まれないもの」で明示的に除外されており、本 PR の責務範囲外。
- **[N-007]** typecheck / lint / format:check / test:unit はすべて pass。lint warning 4件は本 PR の touch 対象外ファイル（既存）。
- **[N-008]** （非必須・将来検討）`MergeTagDialog.tsx:33` の `DIALOG_DESCRIPTION` はローカル定数として残存。plan.md ステップ 4 で「本 Issue では `DIALOG_DESCRIPTION` を触らない」と明記済みで意図通り。`common/styles.ts` への移管は他 Dialog にも `text-[13px] text-ink-secondary mt-2` 相当が現れた時点で検討するのが筋。

---

## Architecture

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 依存方向逆転の解消は完全。`common/Dialog.tsx:5` / `ConfirmDialog.tsx:5` 旧 `common/ → @/components/note/styles` の cross-domain import は、両ファイルが同ディレクトリ `./styles` を参照する形に切り替わり、`common/` → 外部ドメインへの上向き依存はゼロ。`grep -rn "components/note/styles" app/ CLAUDE.md docs/ spec/` 結果が空であることで活コード参照ゼロを確認。
- **[N-002]** SSOT が 1 ファイルに収束し、note → common の順方向依存に整流された。`common/styles.ts` の 16 export を、21 ファイルの note 配下 callsite と 1 ファイルの tag 配下 callsite (`MergeTagDialog`) が全て `@/components/common/styles` を alias 参照。再エクスポート用シムを置かない選択 (ADR-002) も実装に正確に反映済み。
- **[N-003]** import スタイルの一貫性ルール（同一ディレクトリ＝相対、別ディレクトリ＝alias）が実装に正確に反映されている。`Dialog.tsx:5` / `ConfirmDialog.tsx:5` は `./styles`、note 配下 21 ファイルと `MergeTagDialog.tsx:15` は `@/components/common/styles`。plan.md L117 の規約と一致。
- **[N-004]** 残置された `layout/styles.ts` の重複定数は ADR-002 で意図的に out-of-scope と明記されている。`app/components/layout/styles.ts:53` (`FORM_ERROR`), `:58` (`FIELD_LABEL`) は `common/styles.ts` の `formError` / `fieldLabel` と文字列完全一致。ADR-002 Consequences 末尾で「layout shell 系と dialog/form 系の意図的分離」「後続 Issue で統合 SSOT 候補として顕在化」と明示されており、本 PR スコープ違反ではない。
- **[N-005]** ADR-001 のトレードオフ（`MergeTagDialog` の primary/cancel ボタンで `active:scale-[0.985]` と `max-sm:min-h-[44px]` 喪失）は実装と一致。`MergeTagDialog.tsx:134-150` で `pillBtn`（h-9, max-sm 拡張なし）になっている。
- **[N-006]** JSDoc 内 dangling reference は活コードから全て解消されている。`CLAUDE.md:47`, `app/components/tag/styles.ts:5` 両者とも `common/styles.ts` 参照に更新済み。`ConfirmDialog.tsx:27` の `Issue #13 ADR-005` 参照は本 PR 対象外（既存コメント）で、`common/` 配置の妥当性を補強する文脈なので残置で正しい。
- **[N-007]** `.issue/88/` 配下の plan / adr / testing / manual-test 内に残る `note/styles` 言及は、過去状態を記述するスナップショットとして意図的に残されている (plan ステップ 7「対象外」)。活コードや CLAUDE.md / docs / spec から dangling reference は全消失しているため、アーキテクチャ整合性に影響なし。
- **[N-008]** `MergeTagDialog.tsx:33` の `DIALOG_DESCRIPTION` ローカル定数は本 Issue 対象外として意図的に残置（plan.md ステップ 4）。説明文専用の単一 callsite 局所定数で SSOT 違反というより「local naming」相当。アーキテクチャ視点では問題なし。

---

## Design Decisions

このラウンドで見つかった新たな設計判断はなし。ADR-001 / ADR-002 の trade-off が実装に正確に反映されていることをレビューで確認済み。

---

## 修正方針

なし — Blocker・Warning ゼロでクリーン。次のステップは PR を Ready for review に切り替え。
