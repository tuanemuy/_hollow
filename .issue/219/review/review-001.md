# PR Review #001 — feat(issue/219): make view toggle instant by decoupling display from loaderDeps

**PR:** #295
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 1（B-001: SaveViewDialog の `search.display` stale バグ。Frontend / Performance 双方が独立して検出）
- Warnings: 9
- Notes: 13
- Verdict: **BLOCKED**

---

## Frontend

### Blockers

- **[B-001]** `SaveViewDialog` が **ステイル化した `search.display`** で SavedView を作ってしまう
  - 場所: `app/components/note/list/NoteListToolbar.tsx:112-116` → `SaveViewDialog.submit` → `searchToViewQuery(search)`（`app/components/note/list/listSelectors.ts:134`）
  - 理由: `display` を `loaderDeps` から外したため、ユーザーが list→tile に切替えても server fn は再走せず、`HomePage` → `NoteList` → `NoteListToolbar` → `SaveViewDialog` の `search` プロップは loader 初回ロード時の値で固定される。`searchToViewQuery` は `displayMode: search.display ?? "list"` を読むため、「タイル表示で保存」したつもりが `displayMode: "list"` で永続化される。
  - 提案: `SaveViewDialog`（または `NoteListToolbar` 経由）で `getRouteApi("/").useSearch({ select: s => s.display ?? "list" })` から最新の `display` を取得し、保存時にこの最新値で上書きする。`SaveViewDialog` は既に `"use client"` 境界。

### Warnings

- **[W-001 / FE]** `app/routes/index.tsx:98` の redirect 条件 `search.viewId !== undefined && search.display === undefined` は外側の `if (search.viewId !== undefined)` 配下にあるため冗長。`search.display === undefined` だけに簡約してよい。
- **[W-002 / FE]** `app/routes/index.tsx:193` の `location.search as NoteListSearch` キャストに ADR-004 参照コメントを追加。
- **[W-003 / FE]** `app/components/note/list/NoteListToolbar.tsx:31-55` の `onSelectView` で「viewId 適用時に `display` を URL から落として server redirect で正規化させる」意図のコメント追加。
- **[W-004 / FE]** `DisplayModeSwitch` の `useTransition` は `isPending` を読まないので、`startTransition` をスタンドアロン import する形 (`import { startTransition } from "react"`) で十分。`useTransition` を hook で受ける意義が薄い。

### Notes

- **[N-001]** `NoteListViews.tsx:16-17` と `DisplayModeSwitch.tsx:18-19` で同じ `selectDisplay` 関数が重複定義されている。`listSelectors.ts` に括り出すと両者でデフォルトが揃っていることを構造的に保証できる。
- **[N-002]** `DisplayModeSwitch` / `NoteListViews` がルートキー `"/"` に結合しているのは ADR-005 で承認済み。JSDoc で「ホーム専用」と一言入れるとコピペ事故を防げる。
- **[N-003]** `homeLoaderDeps` のジェネリック `<T extends NoteListSearch>` と `Omit<T, "display">` の組み合わせは綺麗。コメントも明快。
- **[N-004]** `index.loaderDeps.test.ts` の 3 ケース網羅は十分。
- **[N-005]** `loader` 内 `{ ...deps, display: search.display }` に ADR-004 参照コメントを追加するとリファクタ事故を防げる。

---

## Test

### Blockers

なし

### Warnings

- **[W-001 / Test]** SavedView redirect の 4 分岐 (`viewId 有/無 × display 有/無 × view 有/無`) を自動テストでカバーすべき。特に `view === null` 経路は壊れると無限ループに直結する。`renderHome` の handler 全体は重いので、判定ロジックを純粋関数 `shouldRedirectForSavedView({ search, view })` に切り出して単体テストするのが現実的。
- **[W-002 / Test]** `NoteListViews.tsx` のテストが 1 本もない。3 つの `display` 値 × `<ListView>` / `<TileView>` / `<CalendarView>` の分岐 + `undefined → ListView` フォールバックの最小 4 ケースを追加。子コンポーネントは `vi.mock` でスタブ。
- **[W-003 / Test]** `DisplayModeSwitch` のテストモックが `useTransition` を実体で動かしている。`startTransition` の同期発火に依存している旨をコメントで明記。
- **[W-004 / Test]** `loaderDeps` 単体テストが `<T extends NoteListSearch>` ジェネリックの型契約まではテストしていない。`expectTypeOf` 等の型レベル検証は plan 範囲外なので強い要求ではない。
- **[W-005 / Test]** `DisplayModeSwitch.test.tsx` の `getRouteApi` モックが `useSearch` 以外のメソッドを silent fail する。`useServerFnRouter` 風に descriptive error にする方が将来 debug が楽。
- **[W-006 / Test]** 「display 切替時に loader が再走しない」自動テストは構造上難しい（plan 既知）。手動テスト TC-001 で 0 件発火を観測している事実が PR 説明に記載済み。

### Notes

- **[N-001]** `currentDisplay` がモジュールスコープミュータブル変数 — `beforeEach` reset で問題なし。
- **[N-002]** action モジュール 7 個の `vi.mock` は現実的対処。
- **[N-003]** AAA 構造・テスト名・低レベル API のスタイルは既存パターンと整合。
- **[N-004]** 既存テスト修正漏れなし（NoteListToolbar の `display` プロップ削除を参照する既存テストは存在しない）。
- **[N-005]** 新規テスト 6 件 + biome check 0 issues で完全クリーン。

---

## Performance & Risk

### Blockers

- **[B-001 / Perf]** Frontend の B-001 と同一の問題を独立に検出。SaveViewDialog → searchToViewQuery → `displayMode: search.display ?? "list"` の経路で stale な値が保存される。TC-005 では `?display=tile&q=Test` で開いて保存していたため踏まれていない。

### Warnings

- **[W-001 / Perf]** `search` プロップ全体が server side に固定される設計の脆さ。今は他フィールドが loaderDeps に含まれるため安全だが、将来 q を loaderDeps から外す等で同じ stale 問題が再発する潜在リスク。ハイブリッド設計を続けるか統一するか方針を明文化（ADR-006 候補）。
- **[W-002 / Perf]** redirect 条件の `viewId !== undefined` チェック重複（Frontend W-001 と同一）。
- **[W-003 / Perf]** `useTransition` の効果が観測不能（Frontend W-004 と同一）。
- **[W-004 / Perf]** `location.search as NoteListSearch` cast の test 検証なし（実行時は `validateSearch` で安全）。
- **[W-005 / Perf]** DEV モードで `__root.tsx/loadAppContext` が切替のたびに発火する点は本 PR スコープ外だが、開発体験として混乱の元。フォロー Issue 候補。

### Notes

- **[N-001]** redirect ループ防止のロジックは健全。
- **[N-002]** `loaderDeps` 契約テストで担保済み。
- **[N-003]** `useDeferredValue` / フェード追加（plan ステップ 6）は不要と判断。
- **[N-004]** `replace: true` の効果は TC-004 で `history.length` 不変を観測。
- **[N-005]** `getRouteApi("/")` を 2 箇所で呼ぶ点は `select` の戻り値型がリテラル比較なので再レンダリング誘発なし。

---

## Design Decisions

- **ADR-006 候補（W-001 / Perf）**: 「server-rendered `search` prop と URL の最新値の二重管理」をどう扱うか方針を明文化。本 PR では B-001 を解消する最小対処に留め、全面的な統一は別 PR / ADR に委ねる予定。

---

## 修正方針

- **B-001 (SaveViewDialog stale)**: 最小修正として `selectDisplay` を `listSelectors.ts` に括り出し、`SaveViewDialog`（または `NoteListToolbar` 経由）で URL から最新 `display` を取得して `searchToViewQuery` に渡す形に変更。
- **W-001 / W-002 / FE / Perf**: 該当箇所のコメント追加・redirect 条件の冗長削除。
- **W-004 / FE / W-003 / Perf**: `useTransition` を `startTransition` 単独 import に置換（hook の意義が薄い）。
- **W-001 / Test (SavedView redirect)**: `shouldRedirectForSavedView` 純粋関数を切り出して単体テスト追加。
- **W-002 / Test (NoteListViews)**: `NoteListViews.test.tsx` を追加。3 ビュー分岐 + `undefined → ListView` の 4 ケース。
- **N-001 / FE (selectDisplay 重複)**: `listSelectors.ts` に括り出し。
- **W-002 / FE & N-005 / FE (コメント追加)**: ADR-004 参照を追加。
- **W-003 / FE (NoteListToolbar onSelectView コメント)**: 意図コメント追加。
- **W-005 / Perf (DEV mode loadAppContext)**: スコープ外。Phase 4 でフォロー Issue 起票を検討。
- **その他 Warnings (Test の細かい指摘)**: 軽微な改善として可能な範囲で反映。
