# ADR — Issue #219: リスト／タイル／カレンダー切り替えのUI反映が遅い

## ADR-001: `display` を loader 依存から外し、クライアント `useSearch` 駆動に切り替える

### Status
Proposed

### Context
ホーム `/` の `loaderDeps: ({ search }) => search` が search 全体を返しているため、`display` だけを切替えても loader (`renderHome` server function) が再実行され、ノート一覧 / ディレクトリツリー / タグ / SavedView を `Promise.all` で再フェッチし、RSC ペイロードを再ストリームしている。`display` はビューの形だけを変えるクライアント表示状態で、usecase (`loadOwnedNotes` 他) には到達していない。

選択肢:
- **A**: `display` を `loaderDeps` から除外し、3 ビュー分岐をクライアント境界で行う（クライアント `useSearch` 駆動）
- **B**: server で `display` を引き続き読みつつ `loaderDeps` から `display` のみ除外（クライアント切替時に `notes` を保ったまま分岐するロジックが必要）
- **C**: `display` を URL から外し、`localStorage` 等の永続クライアント状態にする

### Decision
A を採用する。

理由:
- `CLAUDE.md` の「Frontend」節: 「default to async server components for data fetching ... drive client mutations through React 19 primitives directly」。データ取得=サーバー / UI 状態切替=クライアントの分離が原則。
- 「Input validation」節: 「`serverData` is internal-only and intentionally schemaless — never feed unvalidated external input through it」。URL 同期は `validateSearch` 一本でよく、loader 依存と URL 同期は分離できる。
- `display` を usecase 入力に効く search field と同列に扱う理由がない。
- C は「URL 反映してリロード／共有しても同じビューで開ける」という Issue 完了条件を満たせない。

### Consequences
- 良い点:
  - ビュー切替が React 1 フレームで完了し、サーバー往復が消える。
  - `loaderDeps` の意味が「データに効く search だけ返す」に揃い、後続の開発者にとって分かりやすい。
  - 既存の URL 同期・SavedView 互換性をそのまま維持できる。
- トレードオフ:
  - `NoteList` の一部をクライアントコンポーネントに切り出す必要があり、コンポーネント境界が 1 つ増える。
  - SavedView (`viewId`) 復元時に URL を正規化する処理が必要（ADR-002 で対応）。

---

## ADR-002: SavedView (`viewId`) 適用時の `display` URL 反映を server-side redirect で行う

### Status
Proposed

### Context
ADR-001 により `display` はクライアント `useSearch` から読む形になる。SavedView (`viewId`) を適用するときは server 側で `baseSearch.display = view.displayMode` を計算しているが、現状この値は URL には書き戻されていない（HomePage に prop で渡されるのみ）。

クライアント駆動化後、初期表示時に「URL に `display` が無い + ViewId 由来の `display` が prop で渡る」状態になる。その後ユーザーが手動で display を切替えると URL に `display` が乗り、初期 prop と乖離する。

選択肢:
- **A**: server function の handler 内で `redirect({ to: "/", search: { ...baseSearch, display: view.displayMode } })` を呼び、URL を SavedView の `displayMode` に正規化する
- **B**: クライアントマウント時に `viewId` がある & URL に `display` が無ければ `useEffect` で URL を書き戻す

### Decision
A を採用する。**ただし redirect の発動条件は「URL の `display` が未指定 かつ `viewId` が指定 かつ SavedView が取得できた」場合に限定する**。

```ts
if (search.viewId !== undefined && search.display === undefined && view !== null) {
  throw redirect({
    to: "/",
    search: { ...search, display: view.displayMode },
  });
}
```

理由:
- B はマウント直後に URL を書き換える副作用が発生し、flicker の温床になる。
- A は SavedView 適用と同じトランザクションで URL が確定するので、クライアント側はマウント時点から `useSearch` の値だけを信じればよい。
- TanStack Router の `redirect` は server function 内で使える標準パターン。
- 条件分岐により無限 redirect ループを防ぐ（redirect 後は URL に `display` が乗るため `search.display === undefined` に再度入らない）。
- ユーザーが手動で `display` を切替えて URL に display が乗った後の reload では redirect されず、ユーザー操作が尊重される。

### Consequences
- 良い点:
  - クライアント側のロジックが「`useSearch` の値を読むだけ」に単純化される。
  - SavedView 適用後のユーザー操作でも URL 同期が破綻しない。
  - 無限ループ・ユーザー操作上書きの両方を回避。
- トレードオフ:
  - SavedView 適用時の初回ロード（URL に `display` が無いとき）で 1 回追加の redirect が発生する（既存 SavedView ロードフローへの軽微なコスト増）。

---

## ADR-003: `DisplayModeSwitch` の `disabled={isPending}` / `aria-busy` を撤去

### Status
Proposed

### Context
現状 `DisplayModeSwitch` は `useTransition` の `isPending` 中にボタンを `disabled` にして `aria-busy` を立てている。これは loader 再実行中の連打防止が目的だった可能性が高い。

ADR-001 により loader 再実行は無くなり、切替は React 1 フレーム内で完了する。

### Decision
`disabled={isPending}` と `aria-busy` を撤去する。`useTransition` 自体は React のレンダリング優先度制御に有用なため維持する。

### Consequences
- 良い点:
  - screen reader 体験を悪化させない（短時間の `aria-busy` 立ち上げは reader にとってノイズ）。
  - クライアント切替化後に「ボタン押下 → 一瞬無効化 → 戻る」の余分な状態遷移が消える。
- トレードオフ:
  - 万一クライアント側で重い同期処理を含むビューに切り替えるケースで連打されると、複数 transition が積まれる可能性。実測で問題があれば短時間の連打抑止を再導入する。

---

## ADR-004: server fn には `display` を渡しつつ `loaderDeps` からは除外する（実装時補足）

### Status
Accepted (実装時に確定)

### Context
ADR-002 の redirect 条件 `search.display === undefined` を server fn の handler で評価するためには、ハンドラが現在の URL の `display` を観測できる必要がある。一方 ADR-001 により `display` は `loaderDeps` の戻り値から除外する（=ロードキャッシュキーから外す）方針。

`createFileRoute` の `loader: ({ deps }) => renderHome({ data: deps })` パターンだと `display` はハンドラに届かない。

### Decision
loader 関数で `location.search.display` を deps にマージしてハンドラに渡す。

```ts
loader: ({ deps, location }) => {
  const search = location.search as NoteListSearch;
  return renderHome({ data: { ...deps, display: search.display } });
}
```

ロードキャッシュキーはあくまで `loaderDeps` の戻り値（`display` 抜き）で決まるため、display だけが変わっても loader は再実行されない。redirect 後の URL に display が乗ったタイミングでも、deps が変わらない限り再ロードは発生しない。

### Consequences
- 良い点: server fn の handler が `search.display === undefined` を正しく判定でき、ADR-002 の redirect 条件が機能する。
- トレードオフ: `location.search` は tanstack-router の loader シグネチャ上 `{}` 型に projection されるため `as NoteListSearch` キャストが必要。`validateSearch` が SSOT なので runtime 上の不整合はない。

---

## ADR-005: `DisplayModeSwitch` を URL から `display` を読む形に変える（プロップを撤廃）

### Status
Accepted (実装時に確定)

### Context
ADR-001 で server fn が `display` を扱わなくなった結果、`HomePage` → `NoteList` → `NoteListToolbar` 経由で渡していた `display: DisplayMode` プロップは常に `undefined`（= `"list"`）になる。元の plan は「`DisplayModeSwitch` の `current` プロップを `useSearch` 駆動に差し替える」とまでは明文化していないが、これを残すと「タブの active 表示が常に List」という壊れた UI になる。

### Decision
- `NoteList` / `NoteListToolbar` から `display` プロップを撤去する。
- `DisplayModeSwitch` 自身が `getRouteApi("/").useSearch({ select })` で `display` を読み、`current` プロップを撤廃する。

`NoteListToolbar` はもともと `"use client"` 境界なので、URL → タブ表示の同期はクライアント側で完結する。

### Consequences
- 良い点: `display` の SSOT が URL ひとつになり、サーバー往復なしで active タブの表示も即時反映される。
- トレードオフ: `DisplayModeSwitch` がルート (`/`) に結合する（`getRouteApi("/")`）。他ルートでの再利用は不可だが、現状ホームでしか使われていないため許容。
