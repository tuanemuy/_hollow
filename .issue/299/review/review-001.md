# PR Review #001 — feat(issue/299): introduce routerInvalidate wrapper to preserve AppShell across mutations

**PR:** #303
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（Type Safety レイヤー）
- Notes: 18+
- Verdict: **BLOCKED**（Warning 全件対応または ADR 記録が必要）

---

## Frontend / Components

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `app/components/common/routerInvalidate.ts` の実装は plan.md / ADR-001 / ADR-002 / ADR-003 と完全一致
- **[N-002]** JSDoc に 3 ルール（rule 1/2/3）と `sync` / `forcePending` 非サポート明記済み
- **[N-003]** 44 箇所の置換と 28 ファイルの import 文一貫性 OK（`@/components/common/routerInvalidate`）
- **[N-004]** 残存 13 箇所の生 `router.invalidate()` は plan.md 分類と一致、WHY コメントが直前行に挿入
- **[N-005]** `ProfileForm` の `updateProfile`（raw）と `changeUsername`（wrapper）の分岐が plan.md と一致
- **[N-006]** 既存テスト（UploadDialog / IngestionPreviewForm）は `router.invalidate({filter})` でも mock がヒットするため破壊されない
- **[N-007]** 余計なリファクタリングは混入していない（純粋な import 追加 + 1 行置換 + WHY コメント追加のみ）
- **[N-008]** 静的検証・本番ビルド手動検証ともに全 PASS

---

## Performance / RSC / TanStack Router

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-009]** `app/routeTree.gen.ts:135` で `id: '/_app'` を確認。フィルタの `!== "/_app"` 厳密一致は意図通り
- **[N-010]** rule 3 / changeUsername の切り分け検証: `Header.tsx:69-72` で `user.displayName` のみ参照、`username` は使用なし → 切り分け正当
- **[N-011]** rule 2 / note 操作の切り分け検証: Sidebar には `loadDirectoryTree` の構造のみ（note count なし、tag 一覧なし）→ 分類正当
- **[N-012]** rule 1 / auth 状態遷移: `_app.loader` は `loaderDeps` なし + `staleTime: Infinity` のため、cached `userDto: null` が `gcTime` 30 分内に残存する。auth 6 箇所 + AccountDeleteForm を rule 1 として raw に分類するのは妥当
- **[N-013]** WHY コメントの 13 箇所配置を目視確認、JSDoc 内の rule 定義と一貫
- **[N-014]** SSR/SPA 挙動差異なし（`router.invalidate()` は client ハンドラ経由のみ発火、SSR 影響なし）
- **[N-015] フォローアップ候補（本 PR スコープ外）**: `IngestionPreviewForm.tsx` の `commit` 完了パスと `IngestionJobRow.tsx:82` の `commit` パスは `directoryNameToCreate` で新規ディレクトリを作る可能性があるが invalidate を呼ばずに `navigate` する。Issue #299 以前から存在する pre-existing な挙動で、本 PR では変更されていない。コミットで directory が作られた場合に Sidebar 上の tree が次の AppShell 影響 mutation までまで stale になるリスクがあるため別 Issue 化を推奨
- **[N-016]** dev mode（`staleTime: 0`）の検証限界はリスク欄と testing.md で明示、本番ビルド検証実施済み

---

## Type Safety / API Design

#### Blockers
なし

#### Warnings

- **[W-001]** `Parameters<AnyRouter["invalidate"]>[0]` 経由の型導出は型安全のロスを伴う（設計判断としては妥当だが要認識）
  - 場所: `app/components/common/routerInvalidate.ts:5-6`
  - 理由: `AnyRouter` を当てているため `MakeRouteMatchUnion<AnyRouter>` に縮退し、`match.routeId` は registered route id の literal union ではなく `string` にフォールバックする。`APP_SHELL_ROUTE_ID` の値が将来 route tree のリネームで乖離しても型レベルで検知できない
  - 提案: ADR-002 で明示的に意図された設計判断なので **対応不要**。ただし ADR-002 の Consequences に「`routeId` が `string` に縮退するため、`APP_SHELL_ROUTE_ID` の値ドリフトは型検知できない」旨を追記する

- **[W-002]** `filter?: InvalidateFilter` の任意性が「default を上書き」する API になっており、`_app` 除外の不変条件をすり抜けやすい
  - 場所: `app/components/common/routerInvalidate.ts:28-30`
  - 理由: 現状 `filter: filter ?? ((match) => match.routeId !== APP_SHELL_ROUTE_ID)` のため、ユーザーが `filter` を渡すと `_app` 除外がまるごと消える。これは JSDoc に明記された「`_app` 除外がデフォルト」というラッパーの存在意義と矛盾しうる。現在の 44 箇所はすべて引数なしで呼んでいる（dead parameter）
  - 提案: `filter` を **追加フィルタ**として AND 合成する: `(match) => match.routeId !== APP_SHELL_ROUTE_ID && (filter?.(match) ?? true)`。これで「`_app` 除外は必ず効く」不変条件が型システム的にではないが意味的に強化される。あるいは引数を削除する選択肢もあるが、将来の拡張余地として AND 合成が無難

- **[W-003]** 生 `router.invalidate()` 残存箇所のカウント検証
  - 場所: grep 結果と plan.md の整合性
  - 理由: レビュアーが grep で 14 件と推測したが、実際は 13 件（plan.md と一致）。コメント `app/components/note/actions.ts:39` を含めるかどうかの混乱
  - 提案: 確認のみ。`rg "await router\.invalidate\(\);" app/components/` は 13 件を返す（コメント `// The client refetches via router.invalidate() rather than...` は文字列「`await router.invalidate();`」を含まないため除外される）。修正不要

- **[W-004]** `APP_SHELL_ROUTE_ID` の export は使い道が現状ない（YAGNI）
  - 場所: `app/components/common/routerInvalidate.ts:3`
  - 理由: `rg APP_SHELL_ROUTE_ID app/` で外部利用は 0 件。`routerInvalidate.ts` 内部だけで使われている。unused export は biome の lint で検出されない
  - 提案: export を外し module-local 定数にする（YAGNI）。将来必要になったら export に戻せばよい

#### Notes
- **[N-017]** `Promise<void>` 戻り型は上流 `InvalidateFn` と完全一致、44 箇所すべて `await` 付き
- **[N-018]** `NonNullable<...>` の二段重ね（`NonNullable<Parameters<...>[0]>` → `NonNullable<InvalidateOpts["filter"]>`）は適切

---

## Design Decisions

このラウンドで見つかった対応必要項目:

1. **W-002**: filter API を AND 合成に変更（不変条件強化）→ コード修正 + ADR 追加
2. **W-004**: `APP_SHELL_ROUTE_ID` の export を外す（YAGNI）→ コード修正
3. **W-001**: 対応不要（ADR-002 の意図通り）→ ADR-002 の Consequences に「`string` 縮退」を追記
4. **W-003**: 確認のみ、修正不要

フォローアップ Issue 候補（本 PR スコープ外）:
- **N-015**: IngestionPreviewForm の `commit` パスで `directoryNameToCreate` がある場合に invalidate なしで Sidebar が stale になる pre-existing 問題（Issue #299 以前からの挙動）
