# PR Review #001 — fix(ui): ノート詳細アクションメニューをオーバーフローメニューで再構成 (#459)

**PR:** #466
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 多数（良い点の確認）
- Verdict: **BLOCKED**（Warning を潰すまで）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** disabled な menuitem が roving tabindex のサイクルに残り、フォーカスできず行き止まりになる
  - 場所: `app/components/note/detail/NoteActionsMenu.tsx`（roving effect / onMenuKeyDown / menuitem の `disabled`）
  - 理由: `isPending` 中は 複製(0)・削除(2) が `disabled` になり、`<button disabled>` はフォーカスを受け取れないため roving の focus が取り残される。Arrow/Home/End も disabled をスキップしない。
  - 提案: `disabled` 属性ではなく `aria-disabled` ＋ onClick ガードでフォーカス可能なまま無効化（WAI-ARIA 準拠）。
- **[W-002]** トリガーの `data-open` が無効（dead attribute）
  - 場所: `app/components/note/detail/NoteActionsMenu.tsx`（トリガー）
  - 理由: 雛形 `DirectoryActionsMenu` は `TREE_ACTION_BUTTON` に `data-[open]:opacity-100` を持つが、本コンポーネントのトリガークラス（`pillBtn`/`pillBtnIcon`）には `data-[open]:` 変種が無く、属性が何も発火しない。
  - 提案: 開状態ハイライトを足して属性を意味あるものにするか、不要なら削除。

### Notes（抜粋）
- WAI-ARIA Menu パターン本体（roving 初期化・実フォーカス同期・外側クリック/Esc・onMouseDown preventDefault・onFocusOut・aria-*）は参照実装と一致。
- `runAndClose` の順序が正しく、削除 → ConfirmDialog のフォーカス復帰先がトリガーになる（TC-5 PASS）。
- アイコンのみ a11y（aria-label+title・Icon decorative）、size=20、履歴の router.navigate 化、UrlCopyButton の sr-only aria-live、既存挙動（trashed/copyUrl/error 表示）の温存はすべて妥当。

---

## Styling / デザインシステム準拠

### Blockers
なし

### Warnings
- **[W-001]** §7.1「混在禁止」規範との乖離が現状 spec のまま残る（icon-only 多数 + 公開設定のアイコン+ラベル）
  - 理由: §7.1 の許容例外 (a)(b) のどちらにも厳密には当てはまらない混在。
  - 判断: ADR-003 で「状態ピルは状態表示が主役の例外」と意図を文書化し、§7.1 規範そのものの見直しは #460 に委譲済み。**計画通りの判断**。本PRで spec(§7.1) は触らない（#460 のスコープ）。→ コード修正なし。

### Notes（抜粋）
- `pillBtnIcon` の data-variant 化は `pillBtnSm`(#416 ADR-005)/`pillBtnDanger`(#273 ADR-003) と一貫し技術的に正当。
- `rounded-pill`×36px=円形、primary/danger との合成、44×44 タップ領域、メニュースタイルのトークン使用、utility-first・barrel import 回避・data-* 規約すべて準拠。

---

## Test

### Blockers
なし

### Warnings
- **[W-001]** `NoteActionsMenu` のキーボード操作・dismiss・`runAndClose` がユニットで未検証
  - 判断: 既存 DirectoryActionsMenu/UserMenu にもテストが無い慣行だが、回帰防止価値が高い。→ `NoteActionsMenu.test.tsx` を追加する。
- **[W-002]** `UrlCopyButton` のアイコン化・sr-only 化・label 変更に直接テストが無い（NoteActions テストではモック）
  - 判断: aria-live 配線・構造ロックの価値あり。→ `UrlCopyButton.test.tsx` を追加する。

### Notes（抜粋）
- #382 ロック維持・menuitem の順序/danger 検証は適切。NoteDetail/NoteMetaPanel への波及なし。

---

## Design Decisions

- 混在禁止規範（§7.1）に対する本変更の立ち位置は ADR-003 で文書化済み、#460 に委譲。新規 ADR 追記は不要。

## 対応方針（このラウンドで直す）

1. Frontend W-001: menuitem を `aria-disabled` ＋ onClick ガードに変更、MENU_ITEM の CSS を `not-aria-disabled:` ガードへ
2. Frontend W-002: トリガーに `data-[open]:bg-surface-hover` を付与し data-open を有効化
3. Test W-001: `NoteActionsMenu.test.tsx` 追加（roving / Esc / 外側クリック / menuitem クリック / aria-disabled）
4. Test W-002: `UrlCopyButton.test.tsx` 追加（aria-label・可視テキストなし・status の sr-only/role/aria-live）
5. Styling W-001: 対応なし（#460 へ委譲・ADR-003 記録済み）
