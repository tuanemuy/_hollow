# PR Review #002 — refactor(ui): UIコントロールの寸法ばらつきを横断で正規化 (#461)

**PR:** #470
**Date:** 2026-06-04
**Round:** 2回目（最終確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5（全て解消確認・良好）
- Verdict: **APPROVED**

---

## 最終確認（Frontend/Styling ＋ Design-system/spec）

### Blockers
- なし

### Warnings
- なし

### Notes（解消確認）
- **[N-001]** Frontend W-001 解消確認 — `BULK_ACTION` は寸法（h-7/px-3）原型準拠、font-size のみ `text-sm` 維持。ADR-005 の根拠（暗背景バー可読性＋バー内 `BULK_COUNT` text-sm との整合）が実コードと一致し論理も妥当。
- **[N-002]** Design W-001 解消確認 — 寸法ノーマライズ節を無番号トップレベル節へ昇格。§7.1 配下の誤ネスト解消、§8〜§11 番号体系は不変、既存の無番号節「フィードバック・エラー表示原則（#221）」と同じ慣行に一致。§7.1 への相互参照も付与。
- **[N-003]** Design W-002 解消確認 — 入力欄高さ文言を実装射程（fieldControl/FIELD_INPUT/admin/検索=40px）に限定し、残存 h-9 インライン/ツールバー入力（renameInput/NoteListToolbar select/ViewFormDialog inputSm、全て h-9 を実コードで確認）を対象外と明記。矛盾解消。
- **[N-004]** 実装と spec/ADR の整合（追加検証）— text-[13px]/h-[30px] grep 0件、fieldControl/FIELD_INPUT は h-10+py-2.5、icon-only 3ボタン rounded-pill、残存 rounded-full/gap-[5px] は装飾円/バッジ族のみ。全て ADR と一致。
- **[N-005]** 軽微（指摘外）— ADR-001〜004 が Proposed のまま。→ **対応**: 実装確定済みのため Accepted（実装で確定）に更新。

---

## Design Decisions

新規 ADR なし。ADR-001〜004 の Status を Accepted に更新（実装確定の反映）。

## 結論

1回目の Warning 3件はすべて適切に解消。新たな問題なし。**APPROVED** につき PR を Ready for review に切り替える。
