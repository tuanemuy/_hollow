# PR Review #002 — feat(issue/98): ConfirmDialog の in-dialog エラー表示とエラー時フォーカス保持

**PR:** #420
**Date:** 2026-06-02
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（1周目指摘の解消を確認）
- Verdict: **APPROVED**

---

## State Management & Cross-caller Correctness

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **ST-B-001 解消（6ファイル全て正確）**: 削除/破棄/パージ確認を開く onClick に `setError(null)` が入り、別 confirm トリガーには誤付与なし。onClose 側既存 reset と対称化し open＝error破棄の不変条件が両境界で成立。
- **ST-W-001 解消**: BulkActionBar の成功時 close が `invalidate` 後へ統一。
- 排他ガード両輪・SavedViewsList の rename validation 温存・modal backdrop による逆方向リーク防止・新規 regression 無しを確認。スコープ境界（AccountDeleteForm/C 群は新 prop 不使用）も遵守。

---

## Test & Frontend a11y

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **T-W-001 解消**: 「close を所有しない」契約テストへ強化（`open+error`→mount／同一 props 再レンダーでも維持／`open` のみ→alert なし／`open=false+error`→unmount の4段）。空振りでない。
- **T-W-002 解消**: aria-describedby テストが順序非依存（集合検証）に。
- **T-W-003 解消**: IngestionJobRow に discard 失敗の回帰テスト追加（dialog 内 alert／行内0件／非close／キャンセルで両方破棄）。fix を巻き戻すと落ちる構成で脆くない。
- **FA-W-001/W-002/W-003**: ConfirmDialog 本体は round 2 で不変、a11y サーフェス後退なし。ADR-005 の benign 判断は実装と整合。

---

## Design Decisions

新規の設計判断なし（ADR-005 で前ラウンドの判断を記録済み）。
