# PR Review #002 — feat(issue/253): regenerateIngestionPreview の LLM 再駆動を復活させる

**PR:** #318
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0（in-scope）
- Notes: 多数
- Verdict: **APPROVED**

1周目で指摘された Warning への対応を検証。Domain / Application は1周目でクリーンのため再レビュー対象外（差分なし）。本ラウンドは修正を入れた Test 層を重点再レビューし、見送った Frontend Warning の判断妥当性を確認した。

---

## Test層（2周目）

### Blockers
なし

### Warnings
なし

### Notes
- **W-T1 完全解消**: `UploadDialog.test.tsx` に「editing で 再生成 クリック → waiting 再遷移 → ポーリング再開 → editing 復帰」の全フローを検証する新規テストを追加（ADR-003 が要求していたケース）。ファイル全20ケース PASS。
- `regenerateMock` の配線（useServerFnRouter + `../actions` mock + beforeEach reset）が既存パターンと一貫。
- 検証が実装詳細でなく観測可能な契約（status region の ARIA live テキスト、regenerate 呼び出し payload、ポーリング回数の相対比較）に紐付き脆くない。フレーキー要因なし（タイマー1回分のみ進め timedOut 誤遷移を回避）。
- W-F1 / W-F2 の見送り判断は妥当（Test 層責務外、progress.md に内容・理由・影響・フォローアップ明記、回帰ガードを要する振る舞い変更を含まない）。

## 見送った Warning の扱い（1周目 Frontend）

- **W-F1**（`IngestionJobRow.onRegenerate` のハンドラスタイル不揃い）: 全ボタンが `disabled={isPending}` で二重押下は既に抑止済み・ファイル内3ハンドラは一貫・計画で「コード変更なし」スコープのため見送り。`progress.md` に記録。軽微につき別 Issue 化はしない。
- **W-F2**（再生成後 fatal poll で `select` view へ戻る UX）: ジョブはキュー永続化され消失しない・fatal は稀・出し分けは waiting view machine 全体に波及し Issue 意図外のため見送り。`progress.md` に記録、Phase 4 で別 Issue 化を検討。

---

## Design Decisions

特になし。

## 結論

Blocker 0 / in-scope Warning 0 で **APPROVED**。1ラウンドクリーン（2周目）の完了条件を満たす。見送った2件はスコープ外として適切に triage 済み。PR を Ready for review に切り替える。
