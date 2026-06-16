# PR #744 レビュー — Frontend 観点（review-001）

レビュー対象: PR #744 / Issue #743
視点: RSC・コンポーネント設計・状態・UX・アクセシビリティ・RSC データ取得パターン
日付: 2026-06-15

## 結論サマリー

AC-1〜8 はすべて実装で満たされている。`treeQuery` 共有参照 dedup・パンくず配置・末尾 aria-current 非リンク化・×廃止・Folder アイコン撤去・フォールバックチップ gating はいずれも計画／ADR どおりで、`NoteBreadcrumb` と対称化されている。typecheck / 対象ユニットテスト（34）/ 全ユニット（4017）すべて green。Blocker は無い。スタイル規約違反・不要 import の残存も無い。軽微な doc 不整合と将来の保守メモのみ。

---

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** `styles.ts` のディレクトリ説明コメントが移設前の配置を指したまま / 場所: `app/components/note/list/styles.ts:68-72` / 理由: 「it renders as a breadcrumb (`DirectoryBreadcrumb`, its own nav row)」「(#710 ADR-002 ...)」と書かれているが、本 PR でパンくずは FilterBar の「自分の nav 行」から **ヘッダ（見出し上）** へ移り、参照すべき ADR は #743 ADR-002 になった。`filterChip` がフォールバック用に再利用される旨は正しいが、location パンくずの所在記述が実装とズレている。誤読すると「directory パンくずは今もフィルタ行にある」と取られうる。 / 提案: 「renders as a breadcrumb in the page header (above the heading) — see #743 ADR-002」へ更新し、フィルタ行に残るのは解決不能時のフォールバックチップのみである旨に直す。設計の誤りではなくコメント追従漏れ。

#### Notes

- **[N-001]** `treeQuery` 共有参照 dedup は機構として正しい。`loadDirectoryTreeFlat` の引数は `{ actorUserId: string }` 単体（`loaders.ts`）で、`HomePage` 本体の `const treeQuery = { actorUserId: userId }`（`HomePage.tsx:70`）が**過不足ない完全な引数オブジェクト**。これを `HeaderSection`（`:172`）と `FilterSection`（`:209`）へ同一参照で配り、両者とも `loadDirectoryTreeFlat(treeQuery)` を呼ぶ。`cache()` は `Object.is`（参照同一性）でキー化されるため I/O は 1 回に保たれる。`notesQuery` の確立パターン（同 JSDoc）に忠実で、構造同値の別リテラルで二重 fetch になる罠を正しく回避している。JSDoc（`:57-61`）と各 await 位置のインラインコメントが参照同一性の必要を明記しており、将来のリグレッション防止として有効。

- **[N-002]** パンくず配置・h1 不変条件は AC-4 / #649 ADR-009 と整合。`HeaderSection` は `directorySegments !== undefined && directorySegments.length > 0` のときだけ `<DirectoryBreadcrumb>` を `<ViewSwitcher>`（h1 を内包）の直前に描画（`HomePage.tsx:184-187`）。`directorySegments` の算出（`:178-181`）は `directoryId === undefined → undefined` / 解決不能 → 空配列（`directoryAncestorSegments`）で、描画条件 `length > 0` と整合。詳細側 `NoteDetail`（`<NoteBreadcrumb mb-6/>` → `<h1 mb-[10px]>`）と、一覧側（`<DirectoryBreadcrumb mb-6/>` → `<ViewSwitcher>` の `<div mb-[10px]><h1>`）が上下対称。tree await を `HeaderSection` に追加したことで tree 失敗時はツールバー境界が fallback に落ちるが、`fallbackHeading`（`:108-112`）が静的 h1 を保持し #649 ADR-009 の不変条件を維持。インラインコメント（`:169-171`）で「tree はパンくず算出専用、ViewSwitcher/count/toolbar に影響させない」を明記しており、AC-7c の方針どおり。

- **[N-003]** `DirectoryBreadcrumb` の最終形は `NoteBreadcrumb` と同型に揃っている。末尾 = `<span aria-current="page" className="text-ink-secondary">`（リンク化せず）、祖先 = `{ ...HOME_SEARCH, directoryId }` の `<Link className={CRUMB_LINK}>`、× ボタン無し、Folder アイコン無し（`Folder` import と `LEADING_ICON`/`CLEAR_BUTTON` 定数を削除）、`Separator` を内部関数化、区切りは `index > 0` の要素間のみ、`nav` 自身が `mb-6`、`onClear` props 削除で純表示 server component 化（`"use client"` 不要）。`aria-label="現在のディレクトリ"` も維持。`NoteBreadcrumb`（末尾 span / 区切り要素間のみ / mb-6 / アイコン無し）と並べて齟齬なし。アクセシビリティ（nav ランドマーク + aria-current="page" + 区切りは aria-hidden）も適切。

- **[N-004]** FilterBar のフォールバックチップ gating は排他で正しい。`optimisticDirectoryId !== undefined && segments.length === 0` のときだけチップを描画（`FilterBar.tsx:441 付近`）。`segments = directorySegments ?? []`（`:310`）は props 由来。解決可能時はヘッダのパンくずが出てフィルタ行のチップは出ない（length>0 で gating 外）= パンくずと排他。解除遷移中は `directoryId` optimistic が「解除のみ」（#710 ADR-002）なので、optimistic で undefined 化 → `optimisticDirectoryId === undefined` でフォールバックも消える。`clearDirectory`（`:253`）はフォールバックチップの × のみが使用し、navigate で `directoryId` を落とす（FilterBar テストで検証済み）。`DirectoryBreadcrumb` import を削除し未使用 import 残存なし。

- **[N-005]** テスト構成の移設が AC-7a/b/c に正しく対応。新規 `DirectoryBreadcrumb.test.tsx`（祖先=リンク / 末尾=aria-current 非リンク / × 不在 / 区切り N-1・先頭前に無し / 累積 id key / 先頭 Folder アイコン無し）= AC-7a。`FilterBar.test.tsx` の #710 パンくず群を再構成し「resolvable segments を渡しても nav が出ない（ヘッダへ移設）」「フォールバックチップ × で clearDirectory navigate」「clear-all が directory 含め全消去」= AC-7b/AC-5 回帰。手動テスト（TC-1〜7、全 PASS）が AC-4 の h1 上配置・TC-6 の location/filter 棲み分け・TC-7 の未選択時パンくず無しを補完。AC-7c の「DOM 順序単体テストが書けない場合は単体＋手動で担保」という逃げ道どおりの構成で妥当。

- **[N-006]** スタイル規約準拠。utility-first（`nav` の className に `mb-6` 直書き）、`data-active`（フォールバックチップ）、繰り返し文字列のモジュール定数（`SEP`/`CRUMB_LINK`）いずれも規約どおり。`aria-current` は属性で表現。削除済み定数（`LEADING_ICON`/`CLEAR_BUTTON`）の残骸なし。
