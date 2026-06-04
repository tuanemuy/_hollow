# Issue #478 ADR

## ADR-001: `run` / `onSelectView` は await を `try/catch` でラップする（Issue の最小スニペットからの逸脱）

### 背景

Issue #478 の修正方針は次の最小スニペットを提示していた。

```ts
const run = (action, nav) => {
  startTransition(async () => {
    applyOptimistic(action);
    await router.navigate({ to: "/", search: (prev) => nav(prev) });
  });
};
```

Issue は同時に「navigate reject 時に baseline へ rollback する」をテスト追加対象として挙げている。

### 検証で判明した事実

`try/catch` なしの `startTransition(async () => { ...; await rejectingPromise })` では、React 19 は
transition を**エラー状態**として保持し、`useOptimistic` が baseline へ巻き戻らない。実際に
`FilterBar.test.tsx` の reject テストで、reject 後も `aria-pressed="true"` が固着することを確認した
（楽観値が stick）。これは Issue が期待する「reject 時に baseline へ rollback」と矛盾する。

### 決定

`await router.navigate(...)` を `try { ... } catch {}` でラップする。これにより:

- navigate が reject / cancel しても transition が**正常完了**し、`useOptimistic` が
  server-confirmed baseline へ巻き戻る（Issue 期待どおりの rollback）。
- 高速トグル時に先行 navigation が後続 navigation に supersede されて reject しても、
  未ハンドル rejection を出さず、後続の楽観アクションだけが正しく残る。

`catch` の本体は空（コメントのみ）。`FilterBar` / `NoteListToolbar` は filter/view 切替専用で
独自のエラー表示面を持たず、フィルタ navigation の失敗は「baseline へ戻す」のが正しい UX のため。
これはコードベースの navigate-in-transition 規約（`NoteActions` / `BulkExportDialog` 等が
`try/catch + setError` でラップ）とも整合する（error UI が無い分だけ catch が空になる差異）。

### 影響

- `app/components/note/list/FilterBar.tsx` の `run`
- `app/components/note/list/NoteListToolbar.tsx` の `onSelectView`（早期 return パス / ビュー選択パス）
