# PR Review #001 — refactor(ui): WAI-ARIA Menu パターンを共通プリミティブに抽出

**PR:** #505
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（Frontend 1 / Accessibility 2 / Test ※W-001/W-002 の3）
- Notes: 多数
- Verdict: **BLOCKED**（Warning を潰すため）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** `useRovingMenu` の roving focus は activeIndex が同値だと再フォーカスしない（`useRovingMenu.ts`）。現 consumer 4つは「open ごとに先頭/選択中へ着地」しか要求しないため実害なし。設計前提の確認レベル。→ **対応不要**（実害なし・確信度中）

### Notes
- N-001: `<Menu>` が roving に渡すのは `containerRef`（パネルでなくラッパ）。querySelectorAll は role 無しトリガーを拾わず正しいが命名にズレ。
- N-002: `_rovingIndex` 注入は直下 MenuItem のみ（ADR-004 で受容済み制約）。
- N-003〜N-005: styling 規約準拠・dead code なし・runAndClose 順序厳守・DOM/props 非破壊。良好。

## Accessibility

### Blockers
なし

### Warnings
- **[W-001]** VisibilityPopover（`<Popover haspopup="menu">` 経由）のパネルに `onMouseDown preventDefault` が無く、Safari/FF でマウス選択時に mousedown→focus body→onFocusOut→unmount で click がドロップしうる（`FilterBar.tsx`）。`<Menu>` は同ガードを持つ。plan ステップ9 は「選択即 close で focus 維持不要」と判断したが、リスクは focus 維持でなく click ドロップ。→ **このPRで対応**（menu モードの Popover パネルに `onMouseDown preventDefault` を付与し `<Menu>` と一貫させる）
- **[W-002]** dialog モード（DatePopover）に初期フォーカス移動が無く、`role="dialog"` 非モーダル無トラップの SR 体験が中途半端（`Popover.tsx` / `FilterBar.tsx`）。→ **現状維持**（ADR で「non-modal by design: no focus trap」と明言済みの意図的設計、FilterPopover からの既存挙動踏襲で退行でない。リファクタのスコープ外。Phase 4 で follow-up 検討）

### Notes
- N-001: roving panelRef = containerRef（Frontend N-001 と同旨）。
- N-002: menuitemradio 4つを role=menu 直下に配置（WAI-ARIA 妥当、group 化は任意）。
- N-003: UserMenu の logoutError に aria-live 無し（既存挙動踏襲、新規退行でない）。
- N-004: 中核配線（focus復帰順・aria-disabled roving残留・dismiss・focus-visible・initialIndex）は仕様どおりでテスト固定。

## Test

### Blockers
なし

### Warnings
- **[W-001]** Popover の focus-out（onBlur）クローズが未テスト。plan「テスト方針」§Popover が明示要求。移植で `relatedTarget` 判定を壊しても緑のまま通る。→ **このPRで対応**（Popover.test に onBlur→外部 relatedTarget でクローズするケース追加）
- **[W-002]** DatePopover の clear と focus-out が未テスト。plan「テスト方針」§FilterBar 移行ガードが明示要求。trigger 複合構造・triggerProps スプレッド化で配線が変わった箇所。→ **このPRで対応**（DatePopover の clear ケース追加。focus-out は Popover 側で担保）

### Notes
- **[N-001]** ArrowUp ラップ（index 0 → 末尾）が未検証。安価に塞げる。→ **このPRで対応**（Menu.test に ArrowUp ラップ1アサート追加）
- N-002: menu パネル `onMouseDown preventDefault` がユニット未ガード（happy-dom で再現困難、manual-test に委譲。Accessibility W-001 の修正後も同様）。
- N-003: useRovingMenu 単体テストは consumer 経由の間接カバー（plan 許容方針）。
- N-004: テスト様式・独立性・偽陽性回避・runAndClose 順序固定は良好。

---

## Design Decisions

- Accessibility W-002（dialog 非モーダル）は ADR の意図的設計のため現状維持。Phase 4 で follow-up を検討。
