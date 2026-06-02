# PR Review #002 — feat(#396): プロンプト設定で operator が触るのは「分析の意図」だけにする

**PR:** #429
**Date:** 2026-06-03
**Round:** 2回目（収束確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 複数（確認結果）
- Verdict: **APPROVED**

---

## Adapter / Domain

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- A-W-001 解消。`operatorIntentSection` が `const trimmed = prompt.trim(); return trimmed.length > 0 ? [OPERATOR_INTENT_LABEL, trimmed] : []` となり、追記本文が前後空白除去済みで出力される。
- トリム後も①固定先頭 / ②中間挿入 / ③末尾保護の不変性を維持。空文字フォールバック契約（ADR-002/006）不変。`trim()` は新規ローカル変数で入力非破壊。
- 非回帰: prompts.test.ts 11件・3プロバイダ 225件パス。

## Test

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- T-W-001 解消（`prompts.test.ts:97-110`）: operator が③ literal を埋め込んでも本物③が末尾かつ後方にあることを `endsWith` + `lastIndexOf > indexOf(LABEL)` で固定。
- T-W-002 解消（`:112-122`）: 前後空白付き入力でトリム挙動を positive/negative assert で pin。
- T-W-003 解消（`:124-156`）: 非空 prompt × existingDirectories × locale=en の交差ケースで role→intent→directory→locale→contract の全順序を検証。
- 全11ケース＋llm アダプタ全体 45件パス。assert スタイルは既存と統一。

## Frontend

（前ラウンドで Blocker 0・FE-W-001 は確認事項で修正不要・要件充足。本ラウンドで Frontend ファイルは未変更のためクリーンを維持。）

---

## 完了判定

**Blocker 0件 / Warning 0件 → APPROVED。** 1ラウンドクリーンで完了（Step 7）。レビューラウンド計2回。

## Design Decisions

特になし。
