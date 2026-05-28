# PR Review #002 — feat(issue/219): make view toggle instant by decoupling display from loaderDeps

**PR:** #295
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 21
- Verdict: **APPROVED**

review-001 で挙げた Blocker 1 件・Warning 9 件はすべて適切に解消され、修正過程で新規の Blocker / Warning は混入していない。3 視点（Frontend / Test / Performance & Risk）が独立に APPROVED。

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** B-001 修正は正しく機能。`SaveViewDialog.tsx:48` の `homeRoute.useSearch({ select: selectDisplay })` で最新 `display` を取得 → line 69 の `displayMode` 変数で `payload.displayMode` を上書きする構造。
- **[N-002]** redirect の冗長な `viewId !== undefined` チェックが `shouldRedirectForSavedView` 純関数化で解消（`app/routes/index.tsx:97`）。
- **[N-003]** ADR-002 / ADR-004 参照コメントが loader / redirect 周辺に追加。意図が明快。
- **[N-004]** `NoteListToolbar.onSelectView` に「display is intentionally dropped」の意図コメント追加。
- **[N-005]** `DisplayModeSwitch` から `useTransition` / `isPending` / `aria-busy` / `disabled` が全て除去。
- **[N-006]** `selectDisplay` 重複定義は `listSelectors.ts:24-26` に集約され、3 箇所から import。
- **[N-007]** 新規テスト 11 件（5 NoteListViews + 4 shouldRedirectForSavedView + 2 selectDisplay）追加。138 files / 2680 tests pass、typecheck clean。

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** `NoteListViews.test.tsx` のモック戦略がクリーン。`getRouteApi("/")` の `useSearch({ select })` プロトコルを忠実に再現し、子ビューを `data-view` 属性 stub に置換。
- **[N-002]** `shouldRedirectForSavedView` の 4 分岐テスト（`listSelectors.test.ts:473-505`）は redirect ループ / 上書きリスクを invariant コメント付きで表現。
- **[N-003]** `selectDisplay` の 5 値カバレッジ（explicit 3 mode + `{}` + `undefined`）。3 箇所共有 SSOT のフェンスとして妥当。
- **[N-004]** `currentDisplay` モジュールスコープ変数 + `beforeEach` reset パターンは既存テストと整合。
- **[N-005]** `SaveViewDialog` component test は追加されていないが、core ロジックは `selectDisplay` + `searchToViewQuery` の合成として既にテスト済み。コストリターンで現状で十分。
- **[N-006]** 既存テストの修正漏れなし。
- **[N-007]** 全 138 files / 2680 tests pass を確認。

---

## Performance & Risk

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** B-001 修正の再レンダリング影響は限定的。`selectDisplay` はリテラル文字列を返すので `useSearch` の referential 比較が安定。`SaveViewDialog` は `open=false` でも mount するが、3 値しかないため負荷無視可能。
- **[N-002]** ADR-006（server prop vs URL 二重管理）は本 PR で明示化されていないが、B-001 修正経路が事実上の方針例として確立。完全な ADR 化はフォロー Issue 候補。
- **[N-003]** `shouldRedirectForSavedView` 切り出しで redirect 判定の 3 条件が単体テストでピン留め。`view === null` の redirect ループ防止が自動回帰テストに乗った点が大きい。
- **[N-004]** `getRouteApi("/")` 3 箇所利用は各々モジュールトップレベル定数で、`select` も安定参照、戻り値もリテラル比較。不要な再レンダー誘発なし。
- **[N-005]** 1 ラウンド目 W-004 / W-005 / Perf は許容 / スコープ外として確認済み、新規 risk なし。

---

## Design Decisions

このラウンドで新規に確定した設計判断:

- **ADR-006 候補（server prop vs URL 最新値の二重管理）** は本 PR では明示的 ADR 化を見送り。B-001 の修正経路（`SaveViewDialog` が必要箇所のみ `useSearch` で最新値を取得する）が事実上の方針例として確立。完全な ADR 化が必要になったら別 PR で対応。
