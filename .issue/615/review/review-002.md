# PR Review #002 — feat(settings): #615 P22 セッション一覧の表示リッチ化

**PR:** #775
**Date:** 2026-06-25
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 4（うち actionable 1件 = Test W-001）
- Notes: 18
- Verdict: **BLOCKED**（Test W-001 修正のため round 3 へ）

## レイヤー別ファイル

- Domain & Application: review-002-domain-app.md（B: 0 / W: 0）
- Adapter / Infrastructure: review-002-adapter.md（B: 0 / W: 0）
- Frontend: review-002-frontend.md（B: 0 / W: 2 — 両方確認済み/記録済み）
- Test: review-002-test.md（B: 0 / W: 2 — W-001 actionable / W-002 許容済み）

## 指摘一覧と仕分け

- [W-001:frontend] ADR-005 が計画外追加の事後正当化（将来計画でUIをSSOT同期推奨）→ ADR-005 で記録済み・プロセス注記のため本PRでのコード対応不要
- [W-002:frontend] SessionIcon aria-label → Round 1 で対応済み確認
- [W-001:test] SessionIcon の aria-label を直接検証するテストが無い → **本PRで修正（aria-label アサーション追加）**
- [W-002:test] relativeTime 絶対日付の Node ICU/locale 依存 → ja-JP 明示・日本語UI前提で許容済み
