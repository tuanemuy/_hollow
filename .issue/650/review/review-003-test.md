# レビュー review-003 — Test 観点（Issue #650 / PR #721, 3周目・ゼロベース）

レビュー対象:
- 実装: `displayPreference.ts` / `useEffectiveDisplayMode.ts` / `listSelectors.ts`（`selectDisplayRaw`） / `DisplayModeSwitch.tsx` / `NoteListViews.tsx`
- テスト: `displayPreference.test.ts` / `displayPreference.ssr.test.ts` / `useEffectiveDisplayMode.test.tsx` / `DisplayModeSwitch.test.tsx` / `NoteListViews.test.tsx` / `listSelectors.test.ts`（`selectDisplayRaw` 追加分） / `index.loaderDeps.test.ts`（回帰・無変更）

実測: 対象 7 ファイル 127 テストすべて green（`pnpm vitest run`、655ms）。node プール既定 + ファイル単位 `@vitest-environment` 上書き（DOM テスト = happy-dom、SSR テスト = node）が効いている。`docs/test.md` の「Frontend: 必要最小限。server function の wire 型境界と UI ロジック」の層分割に沿い、純粋ロジック（selector / wrapper）・フック・コンポーネントを happy-dom 単体で検証する構成は妥当。Blocker 相当の欠陥なし。

Round 2 の Warning（W-001: active 表示＝実効モードの pin）は解消済み（後述 N-001）。

## Test

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Round 2 W-001（segmented の active 表示＝実効モードの pin 欠如）は解消済み。`DisplayModeSwitch.test.tsx:203-227`「marks the active tab from the effective mode」が `currentDisplay=undefined` + `localStorage.setItem(KEY,"calendar")` で render → effect flush 後に「カレンダー」タブが `aria-selected="true"`・「リスト」が `"false"` を assert。これにより関心 (B)（active 表示＝実効モード、`DisplayModeSwitch.tsx:48,72`）が、関心 (A)（navigate 要否＝URL 生値、既存 `:185-201`）と対になって両側から固定された。`current` を `selectDisplayRaw`（URL 生値）に取り違える／`?? "list"` 相当に戻すリグレッション（「永続値 calendar 表示なのに segmented は list がアクティブ」という計画が明示的に防いだ症状）をこのテストが捕捉する。コメント（`:204-213`）も WHY と (A)/(B) の対関係を明記しており、偽陽性に強い。

- **[N-002]** AC-1 の 2 本書き分け（coverage S-001）が維持されている。(1) キー書き込み = `DisplayModeSwitch.test:173-183`（select でキーへ `"calendar"`）、(2) list/tile/calendar の round-trip = `displayPreference.test:27-33`（各値が `DISPLAY_MODES` バリデーションを通り read/write 往復）。書き込み点と値ごとの永続性が責務分離されている。

- **[N-003]** AC-5（#219 整合・loaderDeps の display 除外維持）の回帰担保が堅実。`index.loaderDeps.test.ts` は `main` から無変更（`git diff main...HEAD` で差分ゼロ・コミットは #297 のまま）であり、3 ケース（display strip / 他フィールド保全 / 冪等）で `homeLoaderDeps` を pin。実装側も `homeLoaderDeps` / loader / `shouldRedirectForSavedView` / `viewQueryToSearch` に一切触れていない（PR の変更ファイルは `note/list/` 配下のみ）。「永続値の適用も書き込みも loader に触れない」設計が、コード差分の不在として構造的に担保されている。

- **[N-004]** SSR 分岐（`window` 未定義 / AC-7）を `displayPreference.ssr.test.ts` として `// @vitest-environment node` で物理分離。同一ファイル内で `window` を `delete` する不安定スタブに頼らず、`expect(typeof window).toBe("undefined")`（`:17`）で前提自体も assert（happy-dom が誤って効けば検知）。read → undefined / write → no-op & not-throw の両分岐を固定。実装の早期 `typeof window === "undefined"` ガード（`displayPreference.ts:36,50`）と整合。

- **[N-005]** AC-6（hydration 回避）の検証が「初回レンダー = list」を偽陽性なく代理検証。`useEffectiveDisplayMode.test.tsx` の `Probe` が毎レンダーで `observed.push(mode)`、`act` がコミットと `useEffect` を同一フラッシュで走らせるため `observed` に `["list","calendar"]` が積まれる。`:82-85`（AC-2）/ `:88-95`（AC-6）が `observed[0] === "list"`（effect 前 = サーバー既定）と `currentMode()`（effect 後 = 永続値）の差で「初回 list / mount 後 永続値」を区別。`useState(undefined)` + `useEffect` 後適用（実装 `useEffectiveDisplayMode.ts:30-39`）という意図を、結果だけ見て list を確認する偽陽性を避けて pin できている。

- **[N-006]** AC-3 の読み取り専用回帰が維持されている。`useEffectiveDisplayMode.test.tsx:110-122` が `Storage.prototype.setItem` を spy し、URL 由来表示時に未呼び出し・`localStorage.getItem(KEY)` が `calendar` のまま、を assert。「実効値を localStorage に書き戻す」誤実装（ADR-002「URL 由来は永続化しない」を崩す）への回帰網。実装も読み取り専用フック（`useEffectiveDisplayMode.ts` に書き込みなし）と整合。

- **[N-007]** モック戦略が実装の本質を迂回していない。`DisplayModeSwitch.test` / `useEffectiveDisplayMode.test` は `useEffectiveDisplayMode` を実コードのまま通し（`@tanstack/react-router` のみ薄く mock し `select` を実評価）、`readDisplayPreference` / `writeDisplayPreference` も実 happy-dom store 経由で動く（arch S-004 方針どおり）。`NoteListViews.test` はフックを直接 mock せず「永続値なし → 実効値 = URL 値」に倒し（`:68` コメントで前提明示）、`ListView`/`TileView`/`CalendarView` を stub して view 分岐（list/tile/calendar/undefined→list）を実フック経由で検証。フック直接 mock より偽陽性に強く、`displayPreference.test` の round-trip と責務が重複していない。

- **[N-008]** `selectDisplayRaw` の単体テスト（`listSelectors.test.ts:643-654`）が undefined-passthrough を直接 pin。`selectDisplay`（`?? "list"`）と `selectDisplayRaw`（生値）の差異を `selectDisplayRaw({})` / `({display:undefined})` → `undefined` で固定し、コメント（`:635-642`）で「同じ defaulting を足すと AC-2/AC-3/ADR-005 の分離が黙って壊れる」WHY を明記。フック・ガードの「URL あり／無し」判定の土台を最小単位で守る。

- **[N-009]** `NoteListViews.test.tsx` は `isLoading` の dim 経路（`NoteListViews.tsx:33,45-48` の `aria-busy` / `data-pending`）を能動的に検証していない（`currentIsLoading` を mock で持つが常に false 固定、`:22,36`）。ただしこれは #354 由来の既存挙動で本 Issue（#650）のスコープ外であり、`useEffectiveDisplayMode` 導入で dim ロジックには手が入っていない。本 Issue の Test 観点では不足とまでは言えず、フォローアップ判断（dim の回帰は別 Issue のテスト責務）。指摘ではなく記録にとどめる。

- **[N-010]（参考）** AC-4（SavedView 優先）は計画どおり新規自動テスト無しで、`useEffectiveDisplayMode.test` ケース (a)（URL display あり → 永続値無視、`:67-74`）が「redirect 後に URL へ display が乗った状態」と等価という間接成立に依存（coverage S-002）。`shouldRedirectForSavedView` が無変更で既存 `listSelectors.test:656-` に守られている点を踏まえ、ADR-002 の設計上の導出として許容範囲。手動 TC-4 は displayMode 付き SavedView のシード未整備で SKIP（`manual-test/results/TC-4.md`）だが実装バグではなく前提データ制約。フォローアップでシード整備時に手動実走させると網が完成する。
