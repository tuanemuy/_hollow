# PR Review #001 — fix(editor): WYSIWYGエディターのフォーカス枠線・余白・選択表現を整える

**PR:** #606
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 13
- Verdict: **BLOCKED**（Warning 1件を修正してから APPROVED）

レビューレイヤー: Frontend/スタイリング規約、回帰/横断CSS影響（2視点並列）

---

## Frontend / スタイリング規約

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** ユーティリティファースト準拠良好。新規CSSファイル/@apply なし。`.note-detail-content[data-editing]` は ADR-002 例外への属性スコープ付き通常CSS追記でADR-008の整理は妥当。
- **[N-002]** トークンSSOT準拠。`--shadow-focus`/`accent`/`accent-surface` すべて既存。新規トークン・生値追加なし。
- **[N-003]** Tailwind v4 任意セレクタ/variant 記法は正しい（`[&_.ProseMirror]:focus-visible:shadow-none` → `.ProseMirror:focus-visible{box-shadow:none}`、`[&_.ProseMirror>:first-child]:mt-0` 等）。
- **[N-004]** `data-editing=""` は ADR-003 の静的属性規約に準拠。
- **[N-005]** className が `public/styles.ts:150` の transition 前例と一致。`duration-[150ms]` は既存慣習どおり。
- **[N-006]** Wysiwyg/Inline の打ち消しセレクタ差（`[&_.ProseMirror]:focus-visible:shadow-none` vs `[&_:focus-visible]:shadow-none`）は意図的かつ正しい。InlineEditor は host 非contenteditable、子ブロックがフォーカスを得るため子孫スコープが適合。
- **[N-007]** 余白リセットを `[data-editing]` 限定にしたスコープ規律が良い。読み取り系へ非波及を実測確認。

## 回帰 / 横断CSS影響

### Blockers
なし

### Warnings
- **[W-001]** plan/ADR の文言と実装の不一致（**ドキュメント側の誤り、コードは正しい**）
  - 場所: `.issue/522/plan.md:87` / `.issue/522/adr.md`（ADR-007/008）vs 実装 `InlineEditor.tsx`
  - 理由: plan/ADR は「InlineEditor は `focus-visible:shadow-none`（ホスト自身のリングを打ち消す）」と記述。だが host `<section>` は contenteditable でなく（allow-list の p/h2/li 等にだけ付与）、フォーカスを得るのは常に子孫ブロック。実装の `[&_:focus-visible]:shadow-none`（子孫スコープ）が正しく、ドキュメントの「ホスト自身」記述が不正確。
  - 提案: コード変更不要。ADR-007/ADR-008/plan の該当文を「ホスト配下の編集ブロックの `:focus-visible` リングを `[&_:focus-visible]:shadow-none` で打ち消す」に修正。

### Notes
- **[N-001]** `data-editing` 名前衝突なし（Tag 系は別要素。`.note-detail-content[data-editing]` は同一要素にクラス+属性要求で非マッチ）。
- **[N-002]** カスケード打ち消し確実（utilities > base、specificity 不問）。
- **[N-003]** margin リセット specificity（0,0,3,0）が要素型ルール（0,0,1,1）に勝つ。
- **[N-004]** `:first-child`/`:last-child` は要素子のみカウント。空白テキストノード・空ノート・単一段落でも安全。
- **[N-005]** SSR/ハイドレーション影響なし。typecheck 通過。
- **[N-006]** ADR-002 例外範囲内。コメントに WHY 記録あり。

---

## Design Decisions

このラウンドで新規の設計判断なし。W-001 は既存 ADR-007/008 の文言を実装（子孫スコープ）に合わせて補正する。
