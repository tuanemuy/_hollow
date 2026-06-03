# PR Review #002 — fix(ui): ノート詳細アクションメニューをオーバーフローメニューで再構成 (#459)

**PR:** #466
**Date:** 2026-06-04
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 解消確認・良い点
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- W-001 解消確認: menuitem を `aria-disabled` + onClick ガードに変更。disabled でもフォーカス可能なまま roving サイクルに残り、hover は `not-aria-disabled:` でガード、`focus:bg-surface` は意図的に非ガード（roving 着地前提）。WAI-ARIA Menu パターン準拠。
- W-002 解消確認: `MENU_TRIGGER` に `data-[open]:bg-surface-hover` を付与。base の `bg-surface` と競合せず data-variant が生成 CSS 順で勝つため `data-open` が有効化。死蔵属性ではなくなった。
- Enter/Space はネイティブ `<button>` が click に変換するため、有効項目は発火・無効項目は no-op で正しく機能（DirectoryActionsMenu 先例と一致）。
- `runAndClose` の順序維持・履歴 router.navigate・UrlCopyButton sr-only に退行なし。リグレッション検出されず。

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- W-001 解消確認: `NoteActionsMenu.test.tsx` が roving（ArrowDown/End/Home）・Esc クローズ＋フォーカス復帰・外側クリック・menuitem クリック（コールバック発火＋クローズ＋他未発火）・aria-disabled（フォーカス可能・click no-op・メニュー維持）を網羅。
- W-002 解消確認: `UrlCopyButton.test.tsx` が aria-label・可視テキストなし・装飾 svg・`role=status`/`aria-live=polite`/`sr-only`/`aria-describedby` 配線・idle 空を検証。
- テストは a11y 契約と挙動に限定され実装詳細に過度依存せず。#382 ロック維持・NoteDetail/NoteMetaPanel 波及なし。`pnpm test:unit` 179 files / 3097 tests green。

---

## Styling / デザインシステム準拠

前ラウンドの W-001（§7.1 混在禁止との乖離）は ADR-003 で意図を文書化し #460 に委譲済み。本ラウンドで styling のコード変更は `data-[open]:bg-surface-hover` 追加のみ（Frontend N-002 で確認）。新規の指摘なし。

---

## Design Decisions

特になし（既存 ADR から変更なし）。

## 結論

2周目で Blocker 0・Warning 0。**APPROVED**（1ラウンドクリーンで完了）。
