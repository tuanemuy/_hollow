# PR Review #001 — docs(design): §7.1 ボタン形態を「規範」から「文脈ごとの判断」原則ベースへ見直す

**PR:** #465
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 10
- Verdict: **BLOCKED**（W-001 修正のため。Blocker は無いが Warning 残ゼロが完了条件）

---

## ドキュメント整合性・要件カバレッジ

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 4要件すべてが差分に反映され漏れ・やり残しなし（①規範→指針 ②a11y二段明文化 ③例外の畳み込み ④ADR namespace 化）。rewrite 領域から `MUST/SHOULD/禁止/必須` が消滅（`aria-label` の「必ず付ける」のみ a11y 床として意図的に残存）。
- **[N-002]** ADR 参照の正確性を実ファイルで裏取り済み。#292 ADR-002/003/005 と新 §7.1 適用例が1対1対応。`.issue/70/adr.md`・CLAUDE.md styling 節は無変更を確認（変更は `spec/design/index.md` と `.issue/460/*` のみ）。
- **[N-003]** 実装名の鮮度OK。`BTN_SM_CLASS` 排除、`pillBtn`/`pillBtnSm` 等は実在。
- **[N-004]** Markdown 構造健全（擬似見出しの前後空行・§内部参照の生存）。`pnpm format:check` パス。
- **[N-005]** トーンは §1-§5 の原則筆致に馴染む。スコープ逸脱なし。

## a11y / WCAG 正確性・実装非整合の不在

### Blockers
なし

### Warnings
- **[W-001]** FilterBar アクティブチップの高さを「28px」と記述しているが実装は `h-[30px]`（30px）
  - 場所: `spec/design/index.md:148`（「chip 自体が 28px 高」）
  - 理由: 該当 chip は `app/components/note/list/FilterBar.tsx:11` のローカル定数 `CHIP` で `h-[30px]`（30px）。共通 `chip`（`common/styles.ts:175`, `h-7`=28px）とは別物。main から verbatim で引き継いだ既存誤り（#354 で chip が `h-[30px]` 化した際に未追従）だが、本 PR が当該行を再編する機会に温存しており「実装非整合の不在」観点では見逃せない。
  - 提案: 「28px 高」→「30px 高」に修正。数値が論旨（付属要素なので独立床を適用しない）に必須でないなら、絶対値を落として将来のドリフトを断つ。

### Notes
- **[N-001]** WCAG 数値・レベル対応は正確（2.5.5 AAA=44×44 / 2.5.8 AA=24×24、`review/004.md:260` と語彙一致）。
- **[N-002]** a11y を緩めすぎていない。「24 床/44 目標/AA 未満は許さない」を §3・§7.1 両所に明記。`aria-label` 等 SR 契約を §8 と一体で温存。Issue 留意点を満たす。
- **[N-003]** 「44 を床に格上げしていない」。admin 28px・dialog 32px とも 24 床を満たし即違反にならない。
- **[N-004]** 実装名・トークン・数値（`max-sm:min-h-[44px]`/`w-8 h-8`/`data-[sm]:h-7`/close `w-4 h-4`=16px）すべて実コードと符合。
- **[N-005]** ADR 参照は出典・内容ともに正確。#70・CLAUDE.md・#292 本文は無変更。

---

## 仕分け

- **W-001 → このPRで直す**（同一ファイル内・1行・低コスト。Phase 4 スコープ基準上も「このPRで直す」に該当）。レビュアー提案に従い、絶対値「28px」を落として将来のドリフトを断つ書き換えにする。

## Design Decisions

特になし（W-001 は数値修正であり設計判断ではない）。
