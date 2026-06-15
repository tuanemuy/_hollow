# PR #744 レビュー — Frontend 観点（review-002 / 2周目フルレビュー）

レビュー対象: PR #744 / Issue #743
視点: RSC・コンポーネント設計・状態・UX・アクセシビリティ・RSC データ取得パターン
日付: 2026-06-15
基準: ゼロベース（1周目の結論を引きずらず、最新の作業ツリーで再検証）

## 結論サマリー

AC-1〜8 はすべて実装で満たされている。1周目 W-001（`styles.ts` のディレクトリ説明コメントが移設前配置を指していた件）は作業ツリーで修正済み（`#743 ADR-002` / 「page header, above the heading」へ更新）。加えて `DirectoryBreadcrumb.test.tsx` の累積 id key テストは `console.error` spy + `vi.restoreAllMocks()` で duplicate-key 回帰を能動的に捕捉する形に強化されている。`treeQuery` 共有参照 dedup・パンくず配置（ViewSwitcher 直前）・tree 失敗時の h1 保持（#649 ADR-009）・`NoteBreadcrumb` との同型化・フォールバックチップ gating の排他性・スタイル規約準拠・不要 import 不在、いずれも問題なし。対象ユニットテスト 34 件すべて green。Blocker・Warning なし。

---

### Frontend

#### Blockers

- なし

#### Warnings

- なし（1周目 W-001 は作業ツリーで修正済みを確認。`app/components/note/list/styles.ts:68-74` のコメントは「renders as a breadcrumb (`DirectoryBreadcrumb`) in the page header, above the heading … #743 ADR-002, moving the breadcrumb out of this filter row; supersedes … the in-filter-row placement of #710 ADR-002」へ更新され、実装の配置と一致。蒸し返しはしない）

#### Notes

- **[N-001]** `treeQuery` 共有参照 dedup は機構として正しい。`loadDirectoryTreeFlat` の引数は `{ actorUserId: string }` 単体（`loaders.ts:309-324`）。`HomePage` 本体の `const treeQuery = { actorUserId: userId }`（`HomePage.tsx:70`）が過不足ない完全な引数オブジェクトで、これを `HeaderSection`（`:172`）と `FilterSection`（`:209`）へ同一参照で配り両者とも `loadDirectoryTreeFlat(treeQuery)` を呼ぶ。`cache()` は参照同一性でキー化されるため I/O は 1 回。`notesQuery` の確立パターンに忠実で、構造同値の別リテラルで二重 fetch になる罠を正しく回避。JSDoc（`:57-61`）と各 await 位置のインラインコメント（`:168-171`, `:207-208`）が参照同一性の必要を明記。

- **[N-002]** パンくず配置・h1 不変条件は AC-4 / #649 ADR-009 と整合。`HeaderSection` は `directorySegments !== undefined && directorySegments.length > 0` のときだけ `<DirectoryBreadcrumb>` を `<ViewSwitcher>`（ページ唯一の h1 を内包）の直前に描画（`HomePage.tsx:184-187`）。`directorySegments` 算出（`:178-181`）は `directoryId === undefined → undefined` / 解決不能 → 空配列、描画条件 `length > 0` と整合。tree await を `HeaderSection` に足したことで tree 失敗時はツールバー境界が fallback に落ちるが、`fallbackHeading`（`:108-112`）が静的 h1 を保持し #649 ADR-009 の「ページが h1 を失わない」不変条件を維持。インラインコメント（`:169-171`）で「tree はパンくず算出専用、ViewSwitcher/count/toolbar に影響させない」と明記。

- **[N-003]** `DirectoryBreadcrumb` の最終形は `NoteBreadcrumb` と同型に揃っている。末尾 = `<span aria-current="page" className="text-ink-secondary">`（リンク化せず, `:62-65`）、祖先 = `{ ...HOME_SEARCH, directoryId: segment.id }` の `<Link className={CRUMB_LINK}>`（`:66-74`）、× ボタン無し、Folder アイコン無し（`Folder` import / `LEADING_ICON` / `CLEAR_BUTTON` 定数を削除）、`Separator` を内部関数化（`:38-44`）、区切りは `index > 0` の要素間のみ、`nav` 自身が `mb-6`（`:50`）、`onClear` props 削除で純表示 server component 化（`"use client"` 不要）。`NoteBreadcrumb`（`SEP`/`CRUMB_LINK` 同一文字列, 末尾 span, 区切り要素間のみ, `mb-6`, アイコン無し）と className レベルで一致。差は `aria-label`（「現在のディレクトリ」vs「パンくず」）と末尾が `noteTitle` ではなく現在ディレクトリ名である点のみで、いずれも意図どおり。アクセシビリティ（nav ランドマーク + aria-current="page" + 区切りは aria-hidden）も適切。

- **[N-004]** FilterBar のフォールバックチップ gating は排他で正しい。`optimisticDirectoryId !== undefined && segments.length === 0` のときだけチップを描画（`FilterBar.tsx:444-458`）。`segments = directorySegments ?? []`（`:310`）は props 由来で `undefined`（未選択）と `[]`（選択済みだが解決不能）を 1 形に正規化（コメント `:307-309`）。解決可能時はヘッダのパンくずが出てフィルタ行のチップは出ない（`length > 0` で gating 外）＝パンくずと排他。解除遷移中は `directoryId` optimistic が「解除のみ」（reduceFilters の `clearDirectory` / `clearAll` は undefined 化のみ, `:108-118`）なので optimistic で undefined 化 → `optimisticDirectoryId === undefined` でフォールバックも消え過渡表示が出ない。`clearDirectory`（`:253`）はフォールバックチップの × のみが使用。`DirectoryBreadcrumb` import 削除済みで未使用 import 残存なし（`FilterBar.tsx` の import 群を確認）。

- **[N-005]** 1周目 W-001 修正を確認。`styles.ts:68-74` のディレクトリ説明コメントが「its own nav row / #710 ADR-002」から「in the page header, above the heading / #743 ADR-002, moving the breadcrumb out of this filter row; supersedes … the in-filter-row placement of #710 ADR-002」へ更新され、フィルタ行に残るのは解決不能時のフォールバックチップのみである旨も明記。コメントと実装配置が一致した。

- **[N-006]** テスト強化を確認（1周目以降の作業ツリー修正）。`DirectoryBreadcrumb.test.tsx` の累積 id key テストが `vi.spyOn(console, "error")` + `afterEach` の `vi.restoreAllMocks()` を導入し、全 4 セグメントが同名「Notes」のとき duplicate-key 警告（"the same key"）が出ないことを `errorSpy` で能動的に検証する形に強化（`:171-195`, `:64`）。1周目の「stable render で間接確認」より回帰検出力が高い。Folder アイコン撤去・root crumb 不採用に伴う separator カウント（N-1, 先頭前に無し）も `NoteBreadcrumb` と同じ素直な数え方で検証（`:135-169`）。

- **[N-007]** テスト構成の移設が AC-7a/b/c に正しく対応し、移設漏れなし。新規 `DirectoryBreadcrumb.test.tsx`（祖先=リンク / 末尾=aria-current 非リンク / × 不在 / 区切り N-1・先頭前無し / 累積 id key / 先頭 Folder アイコン無し）= AC-7a。`FilterBar.test.tsx`（`:711-807`）は「resolvable segments を渡しても nav が出ない（ヘッダへ移設, `:721`）」「resolvable 時はフォールバックチップも出ない（`:730`）」「解決不能時のみフォールバックチップが nav の外に出る（`:740-749`）」「フォールバック × で `clearDirectory` navigate（`:751-767`）」「clear-all が directory 含め全消去（`:769-806`, AC-5 回帰）」を網羅。対象 2 ファイル 34 テスト green。AC-7c は async server component の DOM 順序単体テストが現実的でないため「単体（描画構造）＋手動ブラウザ確認」で担保する計画どおりの構成で妥当。

- **[N-008]** スタイル規約準拠。utility-first（`nav` className に `mb-6` 直書き）、`data-active`（フォールバックチップ `:446`）、繰り返し文字列のモジュール定数（`SEP`/`CRUMB_LINK`）、`aria-current` は属性で表現、いずれも規約どおり。削除済み定数（`LEADING_ICON`/`CLEAR_BUTTON`）の残骸・新規ハンドライト CSS・`@apply` の導入なし。
