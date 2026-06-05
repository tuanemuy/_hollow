# PR Review #001 — design: デザインモック(spec/design/pages)と現状実装の乖離を解消

**PR:** #507
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 7
- Verdict: **BLOCKED**（Warning 修正のため）→ 修正実施

---

## デザイン/モック忠実性

### Blockers
なし（実装コード app/ は無変更、全36ファイルでタグ開閉バランスOK、:root トークン無改変、index.md §9 維持）

### Warnings
- **[W-001]** P10 `.filter-clear` に旧 px 直値 `font-size: 14px` が残存（`var(--text-sm)` と二重定義）。`diffs/P10-home.md` は変換済みと記録するが HTML に旧宣言が残る。場所: `spec/design/pages/P10-home.html:550`。→ **修正済み**: 旧 `font-size: 14px` 宣言を削除し `var(--text-sm)` のみに。横断監査で他52箇所の `font-size: 14px` を確認したが、それらは A 差分記録に含まれないモック元来のベーススタイルであり、実装確認なしの一律変換（14px→実効13px）は誤りになるためスコープ外として保持。

### Notes
- [N-001] サンプル6ページ+横断3ページで A 分類書き換えは実装に忠実・過剰修正なし。微小任意値（chip-count 11px 等）も実装の arbitrary value をバイト単位で正確再現。
- [N-002] 分類規律が高い。#231公開側空状態は方針2に倒さず decisions-pending へ正しく退避。
- [N-003] 設計意図コメントの実装ファイル名指し参照は全て実在・陳腐化なし。

## 要件カバレッジ・分類妥当性・プロセス整合

### Blockers
なし（受け入れ条件4項目すべて実質充足。app/ 変更0件、スコープ逸脱なし）

### Warnings
- **[W-001/scope]** admin 群（P45/P46 等）で同一機能が A（モックから削除）と B（「モックを正に残置」計上）に二重ラベル。受け入れ条件(3)文言と矛盾（処遇は残置ではなく削除）。判断自体（admin→方針1で A）は妥当、記録の正確化で足りる。→ **修正済み**: followups.md 概要に admin 群の B 項目の扱い注記を追加（「モック残置」ではなく「実装が正として削除済み・将来実装候補（C #8 依存）」と読む旨）。
- **[W-002/scope]** B/C 件数の機械的再検算が困難（手動集約依存）。→ 軽微・将来提案（各 diff の B/C に一意IDを振ると集約検証容易）。本PRの欠陥ではないため記録のみ、変更なし。

### Notes
- [N-001] admin の「意図的改善 vs 未実装退化」の線引きを A + C重要論点#8 の二段構えで処理、方針1→2→3を忠実適用。
- [N-002] SHELL.md 一次判定の適用範囲（P10〜P24認証済みのみ、AuthHeader/公開シェル別物）が plan・mapping・実HTMLで一貫、誤波及なし。
- [N-003] E-no-mock.md（admin/metrics 実装ありモック無し）を必須スコープ外ながら漏れなく拾い別Issue化候補化。
- [N-004] plan のリスク欄 px→fluid 値変化（#461）の事前明記が実作業の diff 注記に反映、計画と実装が整合。

---

## Design Decisions

特になし（既存の方針・ADR 参照で完結。新規設計判断なし）。

## 修正対応

- デザイン W-001: P10 `.filter-clear` のデッド px font-size 削除（→ `var(--text-sm)`）。
- スコープ W-001: followups.md に admin 群 B 項目の処遇注記を追加。
- スコープ W-002: 軽微・将来提案のため変更なし。
