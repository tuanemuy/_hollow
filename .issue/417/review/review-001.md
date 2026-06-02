# PR Review #001 — refactor(ui): public 画面のボタン系統を common へ統一する

**PR:** #434
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（うちアクション要 1 / レビュアーが非問題と結論 3）
- Notes: 10
- Verdict: **BLOCKED**（Warning 残のため。Step 7 は Blocker 0 + Warning 0 で完了）

---

## Frontend / Styling

### Blockers
なし

### Warnings
- **[W-001]** `pillBtnPrimary` の余分な append（PILL_BTN / SEARCH_FORM_BUTTON）
  - 場所: `app/components/public/styles.ts`
  - 結論: surface consumer には variant がマッチせず無害。1定数で全 consumer をカバーする意図的設計（plan ステップ1）。**実害なし・修正不要**。
- **[W-002]** SEARCH_FORM_BUTTON の `top-1.5` → `top-1/2 -translate-y-1/2` 等価性
  - 場所: `app/components/public/styles.ts`
  - 結論: 旧 `top-1.5`(6px) は h-12 input + 36px ボタンで数学的中央。新方式は PC 視覚同一・モバイル(44px)で 2px 余白中央。TC-002 で bottomOverflow=-2px 実測。**視覚的回帰なし・修正不要**。

### Notes
- [N-001] CLAUDE.md Styling 規約を全面遵守（utility-first / data-* variant / 定数 hoisting / token / `data-x=""`）
- [N-002] append 順序が auth `BTN_PRIMARY` と完全一致（base → size → variant → 固有）
- [N-003] `data-primary` 付与が正確（accent 3箇所 / surface 4箇所、付け忘れ・誤付与なし）
- [N-004] 旧→新の等価マッピングに視覚的回帰なし
- [N-005] 残存旧クラス断片・未使用 import なし、コメント過不足なし

## Architecture / 回帰リスク

### Blockers
なし

### Warnings
- **[W-001]** ADR-002 の「意図的差分」列挙が `active:bg-accent-pressed`（press 時の暗色背景）を取りこぼし【アクション要】
  - 場所: `app/components/common/styles.ts:26`（`pillBtnPrimary` の `data-[primary]:active:...:bg-accent-pressed`）/ `.issue/417/adr.md` ADR-002
  - 理由: 旧 SEARCH_FORM_BUTTON / GATE_SUBMIT は `hover:bg-accent-hover` のみで active 背景色がなかった。`pillBtnPrimary` 経由で押下時に `--color-accent-pressed`（accent より暗い）へ変化する挙動が primary ボタンに新規付与される。#336 ADR-002 が切り出した残務の範囲内だが ADR の受容範囲記述として列挙漏れ。
  - 提案: ADR-002 の Decision に press 時の暗色化も付く旨を 1 行追記（**ドキュメントのみ、コード修正不要**）。
- **[W-002]** gate フォームの縦リズム目視確認が TC-005 の結果に薄い
  - 場所: `.issue/417/manual-test/results/TC-005.md`
  - 結論: GATE_FORM は `flex flex-col gap-3` の縦積みで input(h-11)+submit(h-12) の 4px 差は重なりを生まない。auth に同型先例あり。**構造的に受容範囲・追加作業不要**。

### Notes
- [N-001] ADR-004 中央寄せ化は #416 ADR-005 の縮小方向制約を正しく回避、SEARCH_FORM_ICON パターン流用で妥当
- [N-002] 中央寄せの副作用（px-4/pr-14・絶対配置の重なり）なし（水平軸不変・text-only で gap 不発火）
- [N-003] 全 consumer の data-primary 付与を実コードで網羅確認、誤りなし
- [N-004] common primitive 無変更で他 surface 波及ゼロ、YAGNI 判断（danger/aria-disabled 不追加）も一貫
- [N-005] opacity 60→55・text-[15px]→text-md は auth #416 で先行受容済みの意図的差分と一致

---

## Design Decisions

- ADR-002 の受容範囲記述に `active:bg-accent-pressed` を追記する（W-001 対応、ドキュメント修正）。コード上の挙動は変わらず、#336 ADR-002 が切り出した「press feedback 統一」残務の一部。
