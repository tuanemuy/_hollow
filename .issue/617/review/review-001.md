# PR Review #001 — feat(public-search): P32 公開検索画面をデザインモックに整合

**PR:** #625
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 13
- Verdict: **BLOCKED**（Warning 1 件を修正）

レビューレイヤー: Frontend / Design・Spec 整合性（2視点並列）

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- [N-001] CSS カスケード順（最重点）は正しく機能。`h-14 max-sm:h-12` は #416 ADR-005 の「縮小方向の素 utility が負ける」制約に**該当しない**。ビルド済み CSS 実測で `max-sm:` の `@media` ブロックが base `.h-14` より後置され、media-variant が常に勝つことを確認。`pl-[54px] max-sm:pl-[46px]`・`left-[22px] max-sm:left-[18px]` も同様。
- [N-002] 装飾ドット `·` に aria-hidden 不要（コードベース全体で `<span className="text-hairline-strong">·</span>` が aria-hidden 無しで統一。本 PR も一致）。
- [N-003] メタ行 DOM・タグ表現が plan Step 4 / ADR どおり（著者→ドット1個→accent タグ、タグは join(" ") スペース連結、タグ無し時は fragment ごと非表示、key 漏れなし）。
- [N-004] アクセシビリティ既存挙動は無傷（sr-only label / aria-label / hidden input / data-primary / avatar aria-hidden 維持）。
- [N-005] ADR-004 中央寄せ継承維持（input 高さ変更でもボタン縦中央配置で破綻しない）。
- [N-006] スタイリング規約準拠（utility-first・トークン経由・任意値はトークン非存在値に限定・max-sm: パターン・定数化）。`text-md` トークンはモック `--text-md` と一致。
- [N-007] モックの input 右 padding（24px）に対し実装 `pr-14`(56px) 維持は accent ボタン下に文字が潜らないために正しい（→ モック側を直すべき、後述 Design W-001 と対）。

## Design / Spec 整合性

### Blockers
なし

### Warnings
- **[W-001]** モック更新（Step 7）で `.hero-search input` の右 padding が新ボタン幅に未追従。
  - 場所: `spec/design/pages/P32-public-search.html:273`（`padding: 0 24px 0 54px`）/ `spec/design/pages/mobile/P32-public-search.html:268`（`padding: 0 20px 0 46px`）
  - 理由: 旧 `.kbd`（細い）→ 幅広の `.search-btn`（「検索」）へ差し替えたが、input 右 padding が据え置きで、モック上でテキストがボタン下へ潜り得る。実装は `pr-14`(56px) で正しくクリア済みのため、**モックだけが実装とずれている**。Step 7 の「モックを実装に合わせる」狙いに右 padding が未達。
  - 提案: モックの右 padding を実装の `pr-14`(56px) に合わせて拡大。
  - **→ 本 PR で修正（同一ファイル・Step 7 の狙いそのもの）**

### Notes
- [N-001] 検索バー視覚はモックとトークン値レベルで完全一致（surface/border-0/56-48/pl 54-46/focus surface-hover+shadow/icon 22-18）。
- [N-002] 結果カードのメタ行 DOM がモック `result-meta` と構造・色・ドット位置で一致。値（text-sm/avatar 9px/gap 10px/4px）も一致。
- [N-003] 送信ボタンが pillBtn+pillBtnPrimary+right-1.5 でモック `.search-btn` と一致。ADR-003/004 維持。
- [N-004] ソートは ADR-002 どおり chevron 無し・hover 背景無しの読み取り専用 span。モック `.sort-btn` 据え置きは意図的差分として plan/ADR 明記済み。
- [N-005] 更新日時右列・`<mark>` 非実装は ADR-001/plan で別Issue 明示。FTS5 `snippet()` が既に `<mark>` 生成という発見も記録済み。
- [N-006] Step 7 のモック整理は漏れなし（PC の `.kbd` CSS と `@media display:none` を削除し `.search-btn` 置換、モバイルは追加のみ、孤立 CSS・class 不整合なし）。

---

## 対応方針

- **[W-001]** 本 PR で修正。PC モック `padding: 0 24px 0 54px` → `0 56px 0 54px`、モバイルモック `padding: 0 20px 0 46px` → `0 56px 0 46px`（実装 `pr-14`=56px に合わせる）。PC モックの `@media` は `padding-left` のみ上書きのため右 56px が継承され追加修正不要。

## Design Decisions

特になし（既存 ADR-001〜004 の範囲内）。
