# PR Review #002 — モバイルモック(#536)の実装追従 ② 画面別レイアウト

**PR:** #600
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 確認多数
- Verdict: **APPROVED**

レビュー観点: ①フロントエンド/モック忠実度+スタイリング規約 ②correctness/非回帰（2サブエージェント並列）。前回 review-001 の Warning 5件修正の検証ラウンド。

---

## 確認結果

### review-001 Warning の解消（全件 ✓）

- **W-001 解消 ✓** — `NoteActions.tsx:93` `MENU_RAIL` が `contents` 始まりで裸 `flex` 除去。desktop で `display:contents` が有効化され先頭ピル群が親 MENU の flex-wrap クラウドへ昇格（親が gap-2 を供給するため見た目差なし）。mobile は `max-sm:flex` でレール化。ADR 前提が成立。
- **W-002 解消 ✓** — `FilterBar.tsx:301` タグチップに `max-sm:flex-nowrap max-sm:shrink-0` 付与、desktop は flex-wrap 維持。
- **W-003 解消 ✓** — `scrollbarHidden` を `common/styles.ts:190` へ移設、定義文字列は同一。全 import 元（list/styles・BulkActionBar・editor/styles・NoteActions）が `@/components/common/styles` 経由に統一。cross-folder 旧 import 残存ゼロ、循環依存なし。
- **W-004 解消 ✓** — `BulkActionBar.tsx` が `max-sm:z-[45]`（角括弧記法統一）。残る `z-45` はコメント本文のみ。
- **W-005 解消 ✓** — `FILTER_POPOVER_PANEL` に `sm:p-3` 追加で desktop padding 12px へ非回帰。共有 `popoverSheetPanel`(p-4) は無変更、mobile は p-4 維持。`sm:` レイヤー後段生成で文字列順非依存に上書き成立。adr.md ADR-003 へ一文追記済み。

### 新規問題・副作用

- **なし。** 修正差分は 41bda51 ちょうど（6ファイル +24/-18）で余計な変更なし。desktop への影響は W-001(contents復活)・W-005(p-3復帰)とも「従来挙動への回帰」方向のみ。
- `pnpm typecheck` PASS / `pnpm test:unit` 3429件 PASS / 変更6ファイルの biome lint クリーン。
- className 文字列依存テストは不在で非回帰リスクなし。

---

## Design Decisions

特になし（W-005 の desktop padding 据え置きは adr.md ADR-003 に追記済み）。

## 完了

1ラウンドクリーン（Blocker 0 / Warning 0）で完了条件を満たす。PR を Ready for review に切り替える。
