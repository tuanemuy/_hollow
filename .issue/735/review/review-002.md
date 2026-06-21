# PR Review #002 — fix(public): #735 公開系ルートで存在しない/非公開リソースに HTTP 404 を返す

**PR:** #768
**Date:** 2026-06-21
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1（TOCTOU、Round 1 から据え置き・許容済み）
- Notes: 16
- Verdict: **APPROVED**（このラウンドで「直すべき指摘」ゼロ）

## レイヤー別ファイル

- Presentation: review-002-presentation.md（B: 0 / W: 0）
- Security: review-002-security.md（B: 0 / W: 1 = 既知の TOCTOU）
- Test: review-002-test.md（B: 0 / W: 0）

## 指摘一覧と仕分け

- [Security W-001] TOCTOU 競合時のみ 404→200（**見送り継続**: ADR-003/ADR-004/AC-5 で許容済みの既知リスク）

## Round 1 対応の確認

- [Test W-001] `check()` 呼び出し assert 追加 → 対応済み・妥当（`vi.fn` + `toHaveBeenCalledTimes(1)`）
- [Presentation W-001] 404+gone 画面の意図的乖離に明示コメント追加（note 系2ルート）→ 対応済み・妥当
- 見送り（Presentation W-002 / Test W-002）も妥当と再確認

## 完了判定

直すべき Blocker・Warning がゼロのラウンドに到達 → **APPROVED**。Ready for review に切替。
