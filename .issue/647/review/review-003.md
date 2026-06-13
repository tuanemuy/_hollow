# PR Review #003 — feat(observability): SectionErrorBoundary のセクション失敗を本番で観測可能にする

**PR:** #729
**Date:** 2026-06-14
**Round:** 3回目（フル再レビュー）

## Summary

- Blockers: 0
- Warnings: 1（すべて見送り記録済み）
- Notes: 15
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 0 / N: 1）
- Presentation / Security: review-003-presentation.md（B: 0 / W: 0 / N: 5）
- Test: review-003-test.md（B: 0 / W: 1 / N: 9）

## 指摘一覧

- [Frontend N-001] StrictMode 二重 mount の dedup はインスタンス内前提（root に StrictMode 未配線のため非発火・低リスク）— 見送り
- [Presentation N-001〜005] redaction 二重担保・clamp 妥当・logger メタ規約準拠・ADR-006/007 妥当・本番再検証は任意推奨 — いずれも良い点/許容判断
- [Test W-002] handler の `warn`/`event:"section_failure"` メタが自動テスト外 — **見送り（レイヤー方針で許容。ブラウザ E2E（`.issue/647/manual-test/report.md`）で実ログ `Section render failed { event: 'section_failure', ... }` を確認済み）**

## 完了判定

このラウンドで「このPRで直す」と仕分けた指摘はゼロ（Blocker 0、残る Warning は記録済みの見送り）。Round 1 の Blocker 2件（RSC マニフェスト未登録による本番500 / dedup テストの vacuous）および Warning は Round 2 で全解消、Round 2 の Test W-001（clamp 未検証）は Round 3 直前に解消。よって **APPROVED**。

## レビュー経緯

- **Round 1**: Blocker 2（Presentation B-001: RSC 未登録→本番500、Test B-001: dedup テスト空振り）、Warning 5。`pnpm dev` 検証では検出できない本番ビルド固有の Blocker をレビューで捕捉。
- **Round 2**: Round 1 指摘を全修正（`__root.tsx` への副作用 import 登録＋`pnpm build` で server graph 登録を確認、retry 経路での非 vacuous な dedup/count テスト、dedup キー JSON 化、clamp、ADR-006/007）。新規 Blocker 0、残 Warning は Test W-001（clamp 未検証）のみ。
- **Round 3**: W-001 解消（ミューテーション検証付き clamp テスト2本）。全レイヤー Blocker 0 / 修正対象 Warning 0 → APPROVED。
