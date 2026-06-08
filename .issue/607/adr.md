# ADR — Issue #607: タグ管理(P18) デザイン未追従＋楽観的更新の不統一

## ADR-001: 作成フォームを残し、デザイントークン準拠化のうえ SSOT（デザイン HTML）に反映する

### Status
Proposed

### Context
タグ作成フォームは SSOT である `spec/design/pages/P18-tags.html` / `mobile/P18-tags.html` に描かれていない（ツールバー → 一覧の構成のみ）。一方、実装では `TagList` 内に `CreateTagForm` が後付けされ、admin 用 field primitive（`FIELD_INPUT` / `FIELD_LABEL`）と素の `flex gap-2 items-end mt-4` でタグページの意匠から浮いている。選択肢は3つ:

- 案A: フォームを撤去し、デザイン仕様どおり「本文中の `#tag` 抽出のみ」にする。
- 案B: フォームを残し、デザイントークン準拠化 + デザイン HTML（SSOT）にも反映する。
- 案C: フォームを残すが見た目だけ直し SSOT は触らない。

### Decision
**案B を採用する。** タグの明示的作成は実プロダクトの機能として有用で、空状態文言（`TagList.tsx:150`）も作成導線を案内しており、撤去（案A）は機能後退になる。案C は SSOT と実装の乖離を放置し、将来のデザイン追従監査で再び「未追従」と判定される。よってフォームを残しつつ、(1) ステップ1で `TAG_CREATE_*` トークンを定義してタグページの意匠（`.search` / `.btn-primary` の言語）に揃え、(2) デザイン HTML 2枚にも `page-header` 直下・`tag-toolbar` 上の位置で同意匠のフォームを追記する。配置は縦リズム（`page-header` `--space-6` → フォーム → `tag-toolbar` `--space-5`）に収める。

### Consequences
- 良い点: 機能を維持しつつ意匠統一。SSOT とコードが一致し、以後の乖離監査をすり抜けない。
- トレードオフ: デザイン HTML 2枚への追記が必要。ただし既存トークンのみで構成し、ページ固有スタイルの上書きはしない（HTML 冒頭の方針コメント遵守）ため影響は局所的。

---

## ADR-002: 作成の楽観投影を `TagList` の `useOptimistic` / `reduceTags` に `add` として統合する

### Status
Proposed

### Context
作成は現状 `CreateTagForm` 内の `useActionState` 待機型で、サーバー応答 + `routerInvalidate` 完了まで新規タグが一覧に現れない（最も「楽観的でない」箇所）。リネーム / 削除は `TagList` の `useOptimistic(tags, reduceTags)` 投影で即時反映されている。

### Decision
**`reduceTags` に `add` アクションを追加し、作成も親 `TagList` の同一投影に乗せる。** `CreateTagForm` は独立した楽観 state を持たず、親から渡る `onCreate(name)` コールバックを呼ぶだけにする。`TagList` 側で `startMutation(async () => { applyOptimistic({type:'add', tag: {id: tmpId, name, noteCount:0, lastUsedAt:null}}); await createTag(...); await routerInvalidate(router) })` を実行する。一時 id はクライアント生成（`crypto.randomUUID()`）で、transition 終了時に baseline へ snap back し確定行へ置き換わる。作成エラーはフォーム直下に表示し、楽観追加分は snap back で自動的に消える。

### Consequences
- 良い点: リネーム / 削除と完全に同型。count（`{n} 件のタグ`）も即時に増える。投影が1箇所に集約され一貫。
- トレードオフ: `reduceTags` と `useOptimistic` の baseline 型に「楽観追加された未確定行」が混ざる。`noteCount:0` / `lastUsedAt:null` の見た目は確定後と一致するため違和感は無い。一時 id の `key` 安定性に注意。

---

## ADR-003: 統合は削除と同じ `remove` 投影で楽観化し、楽観反映時は進捗バナーを出さない

### Status
Proposed

### Context
統合（merge）は統合元タグを削除し参照ノートを統合先へ移管する操作。現状は `MergeTagDialog` の `useTransition` 待機型で `routerInvalidate` 全体リロードまで反映されない。`MergeTagDialog` は `sourceNoteCount > 0` のとき同期処理の所要時間を示す進捗バナー（`progressTrack` / `progressBarIndeterminate`）を表示する。

### Decision
**統合元タグの消去を `reduceTags` の既存 `remove` 投影で楽観化する**（削除と同型）。確定時にダイアログを即座に閉じ、統合元 id を `applyOptimistic({type:'remove', id})` で一覧から消す。楽観的に消した後はダイアログ自体が unmount されるため、**進捗バナーは表示しない**（即時反映を優先）。統合エラーは削除と同じく `TagList` の `actionError` 機構（行が snap back した後に `FORM_ERROR` で表示）に乗せる。進捗バナー UI（`progressTrack` 等のトークン）はコードから削除せず温存する（将来の非同期ジョブ化 #563 で再利用余地）。

### Consequences
- 良い点: 削除と一貫した即時反映。実装も `runDelete` のパターンを踏襲でき単純。
- トレードオフ: `sourceNoteCount` が大きい統合でも進捗の可視フィードバックが消える。ただし楽観的に元タグが即消えること自体が進捗の代替となり、確定は `routerInvalidate` 後に反映される。大量ノート統合の進捗は本来 #563 の非同期ジョブ＋バナーで扱う領域で、本Issueの同期 UX では即時反映を優先する。

---

## ADR-004: 並び替え / 検索は `FilterBar` パターンで「選択状態のみ楽観即時・一覧データは loader 確定」とする

### Status
Proposed

### Context
並び替え / 検索は現状 `TagListToolbar` の `useTransition` + `router.navigate` でローダー再実行を待ち、`isPending` 中は全コントロールが `disabled`。Issue は「全件クライアント保持時にサーバーラウンドトリップを避けられないか」の検討を求めている。

調査結果:
- 一覧は `TagList` が全件 `optimisticTags` として保持し、各行は `name` / `noteCount` / `lastUsedAt` を持つ。
- しかし `createdAt` はクライアントに供給されていない（`Tag` DTO に無い）ため、`createdAt` ソートはクライアントで実行不能。
- `lastUsedAt` は backend 集約（`MAX(notes.updatedAt)`、#569 ADR-001）由来で、NULL 並び順の仕様も backend がテストで固定している。
- 検索は backend の部分一致（LIKE）ロジック。
- 既に同型の課題を `note/list/FilterBar.tsx` が解決済み: `useOptimistic(baseline, reducer)` + `startTransition` 内で `applyOptimistic` → `await router.navigate`、コントロールは pending 中も **enabled** に保つ。

### Decision
**`FilterBar` の確立パターンに合わせる。** `TagListToolbar` に `useOptimistic` baseline（`sort` / `order`）を持たせ、segmented・方向トグルの選択状態を楽観 state から描画する。`disabled={isPending}` は撤廃し（rapid 操作を落とさない）、`aria-busy` をツールバーに付ける。**一覧の即時クライアント並び替えには踏み込まない** — `createdAt` 供給追加 = backend 変更でスコープ外、かつ `lastUsedAt` の NULL 並び順仕様をクライアントで再現する責務分散も避ける。

**検索（q）は楽観化対象から外す（レビュー P-002 を受けて確定）。** 検索入力は uncontrolled（`defaultValue` + `key={query ?? ""}`）のままとし、`key` には確定済み `query`（props）を据え置く。理由は2つ: (1) `q` を `useOptimistic` baseline に乗せて `key` に使うと submit 直後に入力が即再マウントされ打鍵値が `defaultValue` で上書きされる干渉が起きる。(2) タグツールバーの検索には「適用済みクエリ」を示すチップ等の可視表示が無く、楽観化しても即時フィードバックの対象が実質存在しない（`FilterBar` も検索入力の楽観化は持たないため先例も無い）。よって検索は uncontrolled + submit 時 navigate のまま維持し、`disabled` 撤廃のみ適用する（IME 入力保護も兼ねる）。

### Consequences
- 良い点: `FilterBar` と UX が完全に統一（選択は即時・データは loader 確定）。disabled 撤廃で操作レスポンスが上がる。backend 不変でスコープが閉じる。
- トレードオフ: 一覧の再ソート / 再検索結果自体はサーバーラウンドトリップを待つ（loader 確定）。ただし選択状態が即時反映されるため「待機型」の体感は解消される。クライアント即時並び替えは `createdAt` 供給が前提のため別Issue相当。

---

## ADR-005: 実装中に確定した補足判断（トークン配置・余白オーバーライド・進捗トークン温存）

### Status
Accepted（実装で確定）

### Context
ステップ実装中、plan/ADR-001〜004 で「ADR で決める」と委ねられた細部、および非自明な選択をいくつか下した。記録のため集約する。

### Decision
1. **作成入力欄のトークン（ADR-001 委任分）**: `TAG_CREATE_INPUT` は `TAG_SEARCH_INPUT`（ヘッダ `.search input` 系の surface pill + focus shadow）に揃えた。ただし作成フォームには検索アイコンが無いため左 padding を通常の `px-4` に戻し（`pl-[38px]` を使わない）、`flex-1 max-w-[360px]` で行内成長＋上限を持たせた。`FIELD_INPUT`（admin field primitive）は意図的に不採用（タグページの意匠から浮くため。plan ステップ1の理由に従う）。ボタンは新規定数を作らず共通 `pillBtn` + `pillBtnPrimary` を流用。
2. **作成フォームの配置と縦リズム**: `page-header`（title + stats）直下・`tag-toolbar` 上に置く。`stats` 相当の `PAGE_SUBTITLE`（共有トークン、`mb-7`）はタグページでのみ `!mb-6`（`--space-6`）に上書きし、`TAG_CREATE_FORM`／`TAG_TOOLBAR` の `mb-5`（`--space-5`）と合わせて SSOT のリズムに揃えた。リスト直上の二重余白を避けるため、`<ul>` の `mt-6` を撤去し、空状態の `EMPTY_STATE`（共有トークン、`mt-6`）は `!mt-0` で打ち消した（ツールバーの `mb-5` のみがリストとの間隔を担う）。共有トークン自体は他画面に影響するため変更せず、ページ単位の `!` オーバーライドで局所化した。
3. **楽観 add の一時 id**: `tmp-${crypto.randomUUID()}` プレフィックス付きで生成し、確定 id との衝突と `key` 安定性を担保。transition 終了 → baseline 復帰で一時行は消え、loader 確定で本物行が現れる。
4. **進捗トークンの温存**: `progressTrack` / `progressBarIndeterminate` は ADR-003 のとおり統合の同期進捗バナー撤去で参照ゼロになるが、削除せず export を残し、JSDoc に「#563 の非同期ジョブ化で再利用予定」と明記した（再導出コストを避ける）。Biome は未参照 export を警告しないため lint も通る。
5. **`MergeTagDialog` の `closable` 撤去**: `useTransition`/`isPending` を撤去したため `Dialog` の `closable={!isPending}` も外し、常時クローズ可能とした。サーバー呼び出しは親 `TagList.onMerge` に移管され、ダイアログは送信と同時に `onClose()` するため pending 中の閉じ込め制御は不要。

### Consequences
- 良い点: 既存の共有トークン・共通ボタンを最大限再利用し、タグページ固有の新規定数を最小化（`TAG_CREATE_FORM` / `TAG_CREATE_INPUT` の2つのみ）。余白オーバーライドはページ局所で他画面に波及しない。
- トレードオフ: 共有 `PAGE_SUBTITLE` / `EMPTY_STATE` に `!` オーバーライドを足すぶん、当該箇所だけ余白規則が二段（基底トークン + ページ上書き）になる。SSOT の縦リズムに合わせるための意図的な局所化として許容する。
