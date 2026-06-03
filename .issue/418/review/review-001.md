# PR Review #001 — refactor(ui): テキストリンク装飾を common textLink primitive へ統一する

**PR:** #438
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（W-001 対応 / W-002 記録対応）
- Notes: 8（うち N-001 を反映）
- Verdict: **BLOCKED**（Warning を残さない方針のため修正後に再レビュー）

---

## Frontend / Styling

### Blockers
なし

### Notes
- [N-001] `textLink` の命名・配置・JSDoc が `navItem`/`pillBtn` 規約と完全一貫。
- [N-002] auth 3 定数の合成は class トークン集合一致（視覚回帰ゼロ）を検証済み。
- [N-003] consumer の JSX は定数名不変、typecheck クリーン。
- [N-004] 死蔵再エクスポート削除に副作用なし（外部 importer 0 件）。
- [N-005] utility-first 方針・`.note-detail-content` 例外への配慮が正しい。

総評: Frontend/Styling 観点で blocker・warning なし。APPROVE。

## リファクタ整合性 / SSOT / CSS 等価性

### Blockers
なし

### Warnings
- **[W-001]** g の取りこぼし — `SignUpForm/index.tsx:263,270` と `AdminSignUpForm/index.tsx:379,386` に `textLink` とバイト一致する inline 文字列が 4 箇所残存。SSOT 化の主目的（装飾の物理的重複の集約）が部分達成に留まる。
  - 提案: 4 箇所を `className={textLink}` へ置換し g を完結。完了条件は `grep -rn "text-accent hover:underline" app/` が定義 1 件のみ。
  - **対応:** 修正済み（4 箇所を `textLink` 合成へ置換、`@/components/common/styles` から import）。ADR-004 に記録。
- **[W-002]** `AdminSignUpForm/index.tsx:176` の `"text-accent underline [text-underline-offset:3px]"`（常時下線）は `textLink`（hover 時のみ下線）と別意匠で置換不可。なぜ 1 箇所だけ残すか ADR に記録すべき。
  - **対応:** ADR-004 に「常時下線の別意匠ゆえ対象外・YAGNI で据え置き」を記録。

### Notes
- [N-001] ADR-002 / JSDoc の「同一意匠」表現は不正確（本文リンクは常時下線、`textLink` は hover のみ）。「近縁意匠」が正確。
  - **対応:** JSDoc を "near-relative"（常時下線 vs hover 下線の差を明記）へ、ADR-002 を「近縁意匠」へ精緻化。
- [N-002] TC-003 の SKIP・静的検証代替は許容範囲。
- [N-003] primitive 粒度（装飾のみ・size 非内包）の判断は妥当。

総評: Blocker なし。唯一の実質論点 W-001（inline 重複 4 箇所）を修正し g を完結。

---

## Design Decisions

- ADR-004 を追記: W-001 の 4 箇所を `textLink` へ集約し g を完結、`AdminSignUpForm:176` の常時下線リンクは別意匠で対象外（YAGNI 据え置き）。
- ADR-002 / `textLink` JSDoc の意匠表現を「同一」→「近縁（常時下線 vs hover 下線）」に精緻化（N-001）。
