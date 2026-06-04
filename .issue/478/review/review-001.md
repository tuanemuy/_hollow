# PR Review #001 — fix(ui): ノート一覧フィルタの選択状態を即時反映 (#478)

**PR:** #481
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

複雑度「小規模」のため General Review 1本で実施。レビュアーはコードを3バリアント（修正後 / await 無し（元バグ）/ await 有り try/catch 無し）に差し替えてテストを実走させ、高速ダブルトグルの挙動も自作テストで実測して確認した。

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** await 追加で `useOptimistic` の保持が効くことを実測確認。元バグコードに差し戻すと両テストが fail し、修正の核心が決定論的に証明されている。
- **[N-002]** ADR-001 の「try/catch 必須」判断は empirical に正しい。try/catch を外すと reject テストが fail（unhandled rejection が act を貫通し楽観値が stick）。空 catch は navigate の reject を baseline へ戻す正しい UX に着地させる必須要素で、既存規約（`SavedViewsList` 等の `try/catch + setError`）とも整合。
- **[N-003]** reject テストは rollback を正しく検証（3バリアントを弁別、修正版でのみ pass）。`aria-pressed="false"` と `data-active=null` の両 assert が `data-active={active || undefined}` 規約と整合。
- **[N-004]** 高速トグル（2タグ連続クリック）で両タグとも `aria-pressed="true"` 保持・navigate 2回発火を実測。重なった transition の楽観アクションが正しくスタックされる。
- **[N-005]** NoteListToolbar の変更は search projection ロジック不変で副作用なし。既存テスト含め note/list 全テスト（6 files / 79 tests）pass。
- **[N-006]** テストのクリーンアップは堅牢。pending テストは末尾で `resolveNav()` を呼び transition をリークさせない。flush の 30 回 microtask ループは十分（30 は magic だが許容範囲）。
- **[N-007]** sweep 表のカバレッジ漏れなし。対象3箇所すべて修正済み、`DisplayModeSwitch` のスコープ外判断も妥当。
- **[N-008]** `run` 上の長めコメントは全て非自明な WHY（React 19 transition 終了タイミングと useOptimistic 巻き戻し）で CLAUDE.md 方針に合致、ノイズではない。

---

## Design Decisions

このラウンドで新たな設計判断はなし（ADR-001 が実測で裏付けられたことを確認）。
