# PR Review #002 — feat(speech): #766 Gemini audio 文字起こしプロバイダを registry に追加

**PR:** #794
**Date:** 2026-06-27
**Round:** 2回目

## Summary
- Blockers: 0
- Warnings: 1（carry-over・見送り記録済み）
- Notes: 13
- Verdict: **APPROVED**（直すべき指摘ゼロのラウンドで完了）

## レイヤー別ファイル
- Adapter / Infrastructure: review-002-adapter.md（B: 0 / W: 1 carry-over）
- Test: review-002-test.md（B: 0 / W: 0）
- Domain / Frontend 配線: review-002-domain-frontend.md（B: 0 / W: 0）

## 指摘一覧
- [W-001/adapter] speech probe の workerd AbortError reason 非対称（1周目からの carry-over・見送り継続。共有 pingGemini 由来・ok/not-ok 不変）

## 1周目指摘の解消
- adapter W-001（headroom）→ MAX_REQUEST_BYTES を 18MiB に下げ解消。境界テスト両側 pin。
- test W-001（ステータス文言）→ 401/403/429 に "HTTP <status>" アサート追加で解消。
- test W-002（境界 pin）→ 上限直下 pass の境界テスト追加で解消。
- domain W-001（コメント乖離）→ INVARIANT コメントを実態（DI bootstrap 非参照・UI ミラー）に修正で解消。

## マージ判定
コード品質は APPROVED。ただし **AC-1（実 Gemini での webm/opus 受理）が未検証のマージ前提条件**のため、PR は Draft のまま据え置く（`.issue/766/progress.md` 参照）。
