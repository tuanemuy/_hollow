# PR #682 レビュー（2回目・フル / Frontend 観点）

対象: Issue #671 公開検索(P32)フィルターUIの改善
基点: `.issue/671/plan.md`（AC-1〜15）/ `.issue/671/adr.md`（ADR-001〜004）
検証: `pnpm typecheck` 通過 / 変更ファイルの `biome lint` クリーン / `test:unit` 全 3697 件通過

## Frontend

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** period チップ描画ガードの冗長な二重判定 / `SearchFilterDrawer.tsx:359` /
  `{periodIsActive && optimistic.period !== null ? ...}`。`periodIsActive`（:168-169）は
  既に `optimistic.period !== null && optimistic.period !== "all"` を含むので、後段の
  `&& optimistic.period !== null` は論理的に常に冗長。ただしこれは TypeScript の絞り込み
  目的（チップ内で `PERIOD_LABELS[optimistic.period]` を non-null として扱うため）であり、
  `periodIsActive` を `boolean` 変数に畳んだことで型ナローイングが効かなくなった分を補う
  実装上の必要悪。動作・型とも正しい。気になるなら `const activePeriod =
  (optimistic.period !== null && optimistic.period !== "all") ? optimistic.period : null;`
  のように「値」を保持してナローイングと判定を一本化すると冗長式が消えるが、現状でも
  可読性・正しさに問題はないため任意。

- **[N-002]** RSC / client island 境界は ADR-003 どおり健全。`PublicSearch`（サーバー）は
  `resultsCount`/`countIsLowerBound`（シリアライズ可能プリミティブ）を props、
  `<SearchSortToggle>` を `children` で渡すのみで、`activeCount`（楽観状態依存）に触れる
  DOM 組み立てはすべてアイランドに閉じている（`SearchFilterDrawer.tsx:293-326`）。
  `FILTER_BAR`/`FILTER_BAR_LEFT`/`RESULTS_COUNT` の import 所有者がアイランド側へ移った点も
  plan ステップ6 の「作業漏れ防止メモ」どおりで、`PublicSearch` 側の import から落ちている
  ことを確認（旧 `FILTER_BAR` 等の未使用 import 残りなし）。AC-11 の構造要件（チップ行が
  filter-bar の兄弟＝全幅独立行）は満たされている。

- **[N-003]** AC-13/coverage S-004 のリグレッションテストが「文書順」ではなく「包含関係」で
  アサートされている点を確認（`SearchFilterDrawer.test.tsx:77-92` の `filterBarCloseIndex`
  が `<div>`/`</div>` の深さを数えて filter-bar の対応する閉じタグ位置を求め、:206-208 で
  sort スロットが閉じ前・チップ行が閉じ後にあることを検証）。素朴な `indexOf` 比較では
  「FILTER_BAR_RIGHT 末尾にネストしたチップ行」と「真の兄弟」を区別できないため、この
  実装は構造バグの再発を正しく捕捉できる。良い。

- **[N-004]** 期間ラジオの曖昧一致回避（arch-risk S-001 / ADR-004）も実装・テストとも適切。
  ラジオに `value={p}`（`SearchFilterDrawer.tsx:704`）が付き、テストは
  `isPeriodRadioChecked(html, value)`（:62-71）で `name="search-period"` ＋ `value` ＋
  `checked` を属性ベースに特定。「すべて」が「すべて解除」「すべてリセット」に部分一致して
  誤 green になる懸念は解消されている。AC-2/3/5 のテストも `all` と他期間を明示的に
  対比（:131-132, :162-163, :169-170）しており堅牢。

- **[N-005]** モバイル対応（AC-6〜9/14/15）は ADR-002 の「`max-sm:` バリアント＋`data-[open]`
  軸差し替え＋`env(safe-area-inset-bottom)`」方式で既存先例（`common/styles.ts` modal/dropdown,
  `BulkActionBar`）と一貫。`DRAWER`（:279）で `max-sm:translate-x-0 max-sm:translate-y-full
  max-sm:data-[open]:translate-y-0` と既定 `data-[open]:translate-x-0` を併記しており、
  リスク欄で指摘された translate 軸の併存も正しく処理されている。`DRAWER_APPLY` の
  `max-sm:flex-1 max-sm:min-h-[48px]`（AC-7）、`ACTIVE_CHIPS` の横スクロール＋スクロールバー
  非表示（AC-8）、`ACTIVE_CHIP`/`ACTIVE_CHIPS_CLEAR` の `max-sm:h-8 max-sm:shrink-0
  max-sm:whitespace-nowrap`（AC-9/14）、`DRAWER_RESET` の `max-sm:min-h-[44px]`（AC-15）まで
  全 AC が styles.ts に反映済み。SSR では検証不可な開閉/横スクロール挙動は manual-test
  （`.issue/671/manual-test/`）に委ねられており、TC-1〜7 で確認済みと記録あり。

- **[N-006]** AUTHOR_AVATAR のサイズ分離（AC-10 / ADR-001）は完遂。全 5 消費者
  （`ACTIVE_CHIP_AVATAR` 16px / `TOKEN_AVATAR` 16px / `SUGGESTION_AVATAR` 20px /
  `PublicSearch` ヒット行 18px / `PublicNoteDetail` 28px=`AUTHOR_AVATAR_MD`）がベース＋
  単一サイズで合成され、`w-7 h-7` と `w-4 h-4` の同一プロパティ二重指定は構造的に消滅。
  bare `AUTHOR_AVATAR`（サイズなし）を素のまま使う消費者は残っていない（grep 確認済み）。
  波及漏れなし。

- **[N-007]** アクセシビリティは既存水準を維持・向上。フォーカストラップ（Tab/Shift+Tab）、
  Esc クローズ、`inert={!open}`＋`aria-hidden`（閉時の off-screen combobox 不可達）、
  `role="dialog"`/`aria-modal`/`aria-labelledby`、各 remove ボタンの `aria-label`、
  combobox の `role`/`aria-expanded`/`aria-controls`/`aria-autocomplete` が揃っている。
  チップ行を兄弟に移しても backdrop/drawer は `fixed` のため DOM 位置非依存で挙動不変
  （plan リスク欄どおり）。モバイルのタップターゲット（適用48px・リセット44px・
  filter-btn `max-sm:h-11`）も確保されており UX 上の後退なし。

## AC カバレッジ判定

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | OK | `navigate` period 分岐 `all`/`null`→`undefined`（:213-219） |
| AC-2 | OK | `checked={(selected ?? "all") === p}`（:707）＋テスト :166-171 |
| AC-3 | OK | `periodIsActive` ガード（:359）＋テスト :153-164 |
| AC-4 | OK | `activeCount` の period 項 `periodIsActive ? 1 : 0`（:170-173） |
| AC-5 | OK | テスト :107-137（7d/30d/1y のチップ・バッジ・radio） |
| AC-6 | OK | `DRAWER` `max-sm:` ボトムシート＋軸差し替え（styles :279） |
| AC-7 | OK | `DRAWER_APPLY` `max-sm:flex-1 max-sm:min-h-[48px]`（:291） |
| AC-8 | OK | `ACTIVE_CHIPS` `max-sm:flex-nowrap/overflow-x-auto`（:260） |
| AC-9 | OK | `ACTIVE_CHIP` `max-sm:h-8` / `ACTIVE_CHIP_REMOVE` `max-sm:w/h-[22px]`（:262,264-265） |
| AC-10 | OK | サイズ分離完遂（styles :162-165, 263, 306, 321 ほか） |
| AC-11 | OK | チップ行が filter-bar の兄弟（:328-380 がフラグメント直下） |
| AC-12 | OK | typecheck 通過・変更ファイル lint クリーン |
| AC-13 | OK | テスト :153-209（all デフォルト＋包含関係アサート） |
| AC-14 | OK | `ACTIVE_CHIPS_CLEAR` `max-sm:h-8 shrink-0 whitespace-nowrap`（:267） |
| AC-15 | OK | `DRAWER_RESET` `max-sm:min-h-[44px]`（:289） |

全 15 AC 充足。Frontend 観点での Blocker・Warning なし。
