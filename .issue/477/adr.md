# ADR — Issue #477: ノート公開設定をインコンテキストUIへ作り変える

## ADR-001: UI形式はモーダル（A-1: Dialog）を採用する

### Status
Accepted

### Context
Issue は A-1（モーダル）〜A-4（インライン展開）から選択を求めている。操作内容は「公開ステータスのラジオ選択 + 限定公開リンクの発行/パスワード/失効/一覧」で、項目数は中程度。プロジェクトには `Dialog`（focus trap / Esc / Portal / showCloseButton / closeOnBackdropClick）と、それを使う `BulkVisibilityDialog` / `MoveNoteDialog` の確立されたパターン、`styles.ts` の `dialog*` プリミティブが既に存在する。

### Decision
A-1（モーダル/Dialog）を採用する。既存 `Dialog` と `BulkVisibilityDialog` の作法をそのまま流用する。

- A-2（ドロワー）は新規プリミティブが必要でコスト過大。情報量はモーダルの `max-h-[90vh] overflow-y-auto` で吸収できるため正当化できない。
- A-3（ポップオーバー）はリンク管理（発行/パスワード/失効/一覧）に手狭。
- A-4（インライン展開）は note detail のレイアウト（`max-w-[760px]` の本文 + `dangerouslySetInnerHTML` 本文）に干渉する。

### Consequences
- 良い点: 実装コスト最小。focus trap / Esc / scroll lock / a11y が `Dialog` で担保済み。他ダイアログと視覚的に一貫。
- トレードオフ: リンクが多数発行されると縦が窮屈になりうるが、`overflow-y-auto` で実用上問題ない。将来リンク管理が肥大化したら A-2 への移行を再検討。

---

## ADR-002: ルート `/notes/$noteId/publish` は廃止する（直リンク互換を持たない）

### Status
Accepted

### Context
インコンテキスト化に伴い既存ルートの扱いを決める必要がある。選択肢は (a) 廃止、(b) intercepting route 的に直リンク互換を残す。Issue の主目的は「独立ページの行き止まり解消」。TanStack Start のこのプロジェクトに intercepting route の前例はなく、(b) は新規パターンの導入を要する。

### Decision
ルートを廃止し、公開設定はノート詳細上の open state に寄せる。`publish.tsx` / `PublishSettingsPage.tsx` / `loader.ts` を削除し、`routeTree.gen.ts` を codegen で再生成する。

### Consequences
- 良い点: 行き止まりルートが消え、保守対象が減る。`PublishSettingsPage`/`loader.ts` の重複データ取得経路も解消（NoteDetail 側 `loadPublishStateForNote` に一本化）。
- トレードオフ: `/notes/$noteId/publish` をブックマーク/共有していた利用者は 404 になる。ただし内部専用ページ（`noIndex` 相当）であり外部直リンク需要は低く、行き止まり解消という目的に整合する。

---

## ADR-003: `appUrl` は route handler → NoteDetail → NoteActions → Dialog で props 引き回す

### Status
Accepted

### Context
発行直後の一回限りURL（`/share/<token>`）の組み立てに `appUrl` が必要（`issueShareLinkFn` は token しか返さず、一覧用 `ShareLinkDTO.url` はサーバ側で組み立て済み）。モーダルは note detail 上で開くため、廃止する `publish.tsx`（`container.config.appUrl` を渡していた）に代わる供給経路が要る。

### Decision
note detail route handler (`_app/notes/$noteId/index.tsx`) 内で `getContainer().config.appUrl` を解決し、`NoteDetail` → `NoteActions` → `PublishSettings`(Dialog) へ props で渡す。`PublishStateForNote` のデータも同様に NoteDetail から引き回し、モーダルの再フェッチを避ける。

### Consequences
- 良い点: server-side で解決した値を SSR 済みデータと一緒に渡せる。再フェッチ不要。`publish.tsx` の `getContainer` 利用パターンと同型で前例に沿う。
- トレードオフ: `appUrl` が4段の props を貫通する。型必須化で `tsgo` が漏れを検出するため実害は小さい。

---

## ADR-004: 行（ShareLinkRow）の pending を親カウンタへ持ち上げて closable を集約する

### Status
Accepted

### Context
モーダルの `closable={!anyPending}` を正しく制御するには、3 種の pending を 1 つに集約する必要がある。`visibilityPending` / `issuePending` は親 `PublishSettings` の `useActionState` から直接取れるが、各 `ShareLinkRow` の操作（失効・パスワード設定/解除）は子ローカルの `useTransition` 由来で、行数も可変。plan.md は「`onPendingChange` で持ち上げて集約」か「行操作中は closable に反映しない割り切り」のいずれかを許容していた。

### Decision
行ごとに `onPendingChange(pending)` コールバックを親へ渡し、親は `useState<number>` のカウンタで集約する（`pendingRows > 0` を `anyPending` に OR）。各 `ShareLinkRow` は `useEffect` で `isPending` の `true` 局面のみ +1 を登録し、cleanup で -1 する。`true` 局面だけを対象にすることで +1/-1 が必ず釣り合い、行が in-flight 中に unmount（失効成功で active 操作群が消える等）してもカウンタが残留しない。

割り切り案（行操作中は closable 反映しない）ではなく持ち上げを選んだのは、行操作も DB 変更を伴う非同期処理であり、その最中に Esc/×/閉じるでモーダルを閉じると中途半端な UX になるため。実装コストは `useEffect` 1 個 + カウンタ 1 個と小さい。

### Consequences
- 良い点: 全フォーム・全行の pending を 1 つの真偽値に集約でき、`BulkVisibilityDialog` と同じ closable 制御に揃う。
- トレードオフ: 子 → 親のコールバック 1 段が増える。`useCallback` で関数 ID を固定し effect の再実行を抑えている。

---
