# PR Review #002 — fix(issue/290): ディレクトリ操作の business エラーを具体メッセージで表示

**PR:** #337
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## General Review (Round 2)

前ラウンドの [W-001]（テスト code リストの二重管理）修正を確認。

### Blockers
- なし

### Warnings
- なし

W-001 は型レベルのドリフト検出として実効性のある形で解消:
- `EXPLICIT_DIRECTORY_CODES` のメンバー参照化により、enum メンバーの削除・リネーム・タイポが TS2339 で型エラーになることを確認済み。
- `as const satisfies readonly string[]` のイディオムは正しい。
- group (c) は fallback group 5件（InvalidId / RootMustHaveNoParent / NonRootMustHaveParent / DepthMismatch / InvalidSlug）で依然正しく機能。`Set<string>` 化は型 widen のみで挙動不変。
- `pnpm typecheck` クリーン、`errorDisplay.test.ts` 65件 PASS。

### Notes
- **[N-008]** 「実装→テスト」方向（enum 追加 + switch 追加したがテストリスト追加を忘れる）のドリフトは型では捕捉できずコメント運用依存のまま。enum 全網羅の `it.each` に切り替えれば完全に閉じられるが、round1 提案どおりの対応であり追加対応は必須ではない（情報共有）。
- **[N-009]** group (a) の `not.toContain(code)` は内部 code 非 leak を守る望ましいガード。
- **[N-010]** 本ラウンド差分はプロダクション2ファイルと `.issue/` ドキュメントのみ。スコープ creep なし。

---

## Design Decisions

特になし。
