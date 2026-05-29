# PR Review #002 — feat(ingestion): owner が failed ジョブを再試行できるようにする

**PR:** #326
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 軽微なもののみ
- Verdict: **APPROVED**

レイヤー: Frontend + Test 再レビュー / 総合再レビュー（要件・アーキ・回帰）の 2 並列。

---

## Frontend + Test 再レビュー

#### Blockers / Warnings
- なし

レビュー1周目の 4 修正がすべて正しく適用され指摘を解消していることを確認:
- spec admin retry エラーコードは `assertAdmin`（`FORBIDDEN_ADMIN_ONLY` / `USER_NOT_FOUND`）・`retryIngestionJob`（`INGESTION_JOB_NOT_FOUND`）と完全一致
- `llm_failure` は failed ジョブの errorCode としてのみ出る（live な BusinessRuleError 経路なし）ため「再試行」文言で齟齬なし
- Link の `aria-disabled` + `pointer-events-none` + `tabIndex` が Tailwind variant として正しく機能。retry 成功時はアンマウント、失敗時は再有効化
- retry 失敗テストは 2 つの `role="alert"` を全取得して join し retry 専用メッセージを assert。偽陽性なし

#### Notes
- opacity-50 が pillBtn の opacity-55 と重複（→ 本ラウンドで `pointer-events-none` のみに整理して解消済み）
- retry 失敗時に「失敗理由」と「操作結果」の 2 alert が出るが意味的に別物で誤解なし

## 総合再レビュー（要件・アーキ・回帰）

#### Blockers / Warnings
- なし

- 要件カバレッジ: Issue #254 の 4 項目（usecase / モーダル retry / Row retry / spec）すべて充足
- アーキ整合性: 認可は application 層、transport 境界バリデーション、actor は server 取得、UoW/outbox、dispatch 既存利用で変更ゼロ、errorReason 非投影 — 規約準拠
- 回帰: admin retry usecase は diff ゼロ、regenerate/discard/ポーリングループ無変更、全テストグリーン（unit 2743 / integration 457 PASS）
- spec と実装の乖離なし

#### Notes
- `{ jobId }` 出力は呼び出し側未使用（regenerate と対称のため）— 害なし
- 二重 retry は OCC + pending disable で担保

---

## 本ラウンドの対応

- N-001（opacity 重複）を解消: FailedView の Link className を `aria-disabled:pointer-events-none` のみに整理（opacity は pillBtn 既存の `aria-disabled:opacity-55` が担保）。typecheck / unit 23 PASS / biome clean。

## 結論

Blocker 0・Warning 0 でクリーン。**APPROVED**。Ready for review に切り替える。

## Design Decisions

特になし。
