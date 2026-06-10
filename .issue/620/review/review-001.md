# PR Review #001 — feat(note): P10 表示モードスイッチを segmented control に統一 (#620)

**PR:** #624
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12（Frontend 6 / Design・Docs 6）
- Verdict: **APPROVED**

レイヤー: Frontend / Design Mock・設計ドキュメント整合性 の2視点で並列レビュー。両視点とも Blocker・Warning ゼロ。

---

## Frontend

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** `DISPLAY_SEGMENTED`/`DISPLAY_SEGMENTED_BTN`（`note/list/styles.ts:14-16`）が P30 `SEGMENTED`/`SEGMENTED_BTN`（`public/styles.ts:97-99`）とバイト単位で完全一致。複製コメント（ADR-001）も付与。
- **[N-002]** lucide 直描画が P30 `PublicTopControls` と同形（`size-[var(--icon-xs)]` strokeWidth 1.8 aria-hidden、Icon 非経由 = ADR-002）。
- **[N-003]** a11y 契約不変（`role="tablist"`/`role="tab"`/`aria-selected`）。`data-primary`→`data-active={active||undefined}` で CLAUDE.md ADR-003 厳守。
- **[N-004]** ナビゲーション挙動完全不変（`router.navigate`/`replace: true`/`homeSearchUpdater`/early-return）。
- **[N-005]** テスト破壊なし。`DisplayModeSwitch.test.tsx` の `tabByLabel` は textContent ベースで、aria-hidden SVG は非寄与。4 tests 緑。
- **[N-006]** モック・実装・ドキュメントの三者一致を達成。

## Design Mock / 設計ドキュメント整合性

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** desktop モック segmented は P30 SSOT と CSS・SVG・寸法すべてバイト一致。`.display-tabs`/`.display-tab` 残骸なし（repo 全体 grep 済み）。
- **[N-002]** 実装 styles 定数が public SSOT と文字列一致。トークン `--icon-xs`/`--shadow-xs` 実在。
- **[N-003]** mobile モック `.tool-btn` 完全除去・pill-btn 統一・保存ビュー文言一致。Issue 不整合 #1/#2/#3 解消、許容差分はスコープ厳守で未変更。#292 コメントも #620 上書きに更新。
- **[N-004]** index.md §7.1 書き換えは「選択 UI は別カテゴリ」分類を維持しつつアイコン併用可へ拡張（S-003 意図どおり）。#292/#620 への相対リンク正常。
- **[N-005]** 些細: desktop `P10-home.html` のツールバーマークアップコメントが旧「表示モードタブ」表記 → **本ラウンドで「表示モードスイッチ(segmented)」に修正済み**。
- **[N-006]** 影響ユニットテスト含む全 3464 件パス。

---

## Design Decisions

このラウンドで新規の設計判断なし。既存 ADR-001〜004（`.issue/620/adr.md`）どおりに実装されていることを確認。

## 対応

- [N-005]（軽微・コメント表記）: その場で修正（`表示モードタブ` → `表示モードスイッチ(segmented)`）。
- 他の Notes は良い点・参考情報のため対応不要。

**1ラウンドで Blocker 0 / Warning 0 → APPROVED。**
