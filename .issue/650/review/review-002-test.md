# レビュー review-002 — Test 観点（Issue #650 / PR #721, 2周目・ゼロベース）

レビュー対象:
- 実装: `displayPreference.ts` / `useEffectiveDisplayMode.ts` / `listSelectors.ts`（`selectDisplayRaw`） / `DisplayModeSwitch.tsx` / `NoteListViews.tsx`
- テスト: `displayPreference.test.ts` / `displayPreference.ssr.test.ts` / `useEffectiveDisplayMode.test.tsx` / `DisplayModeSwitch.test.tsx` / `NoteListViews.test.tsx` / `listSelectors.test.ts`（`selectDisplayRaw` 追加分） / `index.loaderDeps.test.ts`（回帰・無変更）

実測: 対象 7 ファイル 126 テストすべて green（`pnpm vitest run`、611ms）。node プール（`vitest.config.ts`）で実行され `@vitest-environment` のファイル単位上書きが効いている（既定 node、各 DOM テストは happy-dom、SSR テストは node）。`docs/test.md` の「Frontend: 必要最小限。server function の wire 型境界と UI ロジック」の層分割に沿い、純粋ロジック（selector / wrapper）・フック・コンポーネントを happy-dom 単体で検証する構成は妥当。

Round 1 の Warning 2 件はいずれも解消済み（後述 N-001 / N-002 参照）。新観点でゼロベースに見たうえで、Blocker 相当の欠陥は無い。指摘は Warning 1・Note 数件にとどまる。

## Test

### Blockers

なし

### Warnings

- **[W-001]** segmented の active 表示が「実効モード（永続値オーバーレイ）」に追従することを pin するテストが無い / 場所: `DisplayModeSwitch.tsx:48,73`（`const current = useEffectiveDisplayMode()` → `const active = mode === current`）, `__tests__/DisplayModeSwitch.test.tsx:87-115` / 理由: 計画ステップ 5 と ADR-005 は「(A) navigate 要否＝URL 生値」「(B) segmented の active 表示＝実効モード」の 2 関心分離を本 Issue の核心バグ回避（arch P-001）として導入している。このうち (A) は `DisplayModeSwitch.test.tsx:185-201`（URL 無指定 + 永続値 calendar で calendar クリック → navigate 1 回。実効モードでガードしていたら early-return する反証ケース）で能動的に固定されている。しかし (B) を pin するテストが存在しない。唯一の `aria-selected` アサーション（`:110`）は `currentDisplay="list"` かつ永続値なしの初期状態で `["true","false","false"]` を確認するだけで、「URL 無指定 + 永続値 calendar → mount 後に calendar タブが `aria-selected="true"` になる」という (B) の本質（active 表示が初期表示モードと一致）を一切踏んでいない。ファイル先頭コメント（`:24-28`）は「active-tab state is driven by the effective mode ... so the two concerns are exercised separately」と宣言しているが、実テストでは (B) 側が trivial ケースしか通っていない。仮に `current` を `useEffectiveDisplayMode()` から `selectDisplayRaw`（= URL 生値）に取り違える／`?? "list"` 相当に戻すリグレッションが入っても、「永続値 calendar 表示なのに segmented は list がアクティブ」というズレ（計画が明示的に防いだ症状）をこのテスト群は検知できない。`useEffectiveDisplayMode.test` は実効値そのものは pin するが、それが `DisplayModeSwitch` の active 判定に結線されていることまでは保証しない。/ 提案: `DisplayModeSwitch.test.tsx` に 1 ケース追加 — `currentDisplay=undefined` + `localStorage.setItem(KEY,"calendar")` で render → `act` で effect flush 後に `tabByLabel("カレンダー").getAttribute("aria-selected")` が `"true"`、`tabByLabel("リスト")` が `"false"` になることを assert する。これで (B)（active 表示＝実効モード）が (A)（navigate 要否＝URL 生値、既存 `:185-201`）と対になって両側から固定される。

### Notes

- **[N-001]** Round 1 W-001（早期 return パスでの書き込み pin）は解消済み。`DisplayModeSwitch.test.tsx:154-171`「still writes to localStorage on the early-return path」が `currentDisplay="tile"` で tile 再クリック → `navigateMock` 不発かつ `localStorage.getItem(KEY) === "tile"` を確認し、「`writeDisplayPreference(mode)` が早期 return ガードより前に走る」順序を明示的に pin している。コメント（`:155-159`）でも「write-before-guard ordering against a refactor that moves the guard ahead of the write」と WHY を残しており、ガード→書き込みへの並べ替えリグレッションを捕捉できる。実装（`DisplayModeSwitch.tsx:56-57`、`writeDisplayPreference(mode)` の直後に `if (mode === urlDisplay) return;`）と整合。

- **[N-002]** Round 1 W-002（AC-3 localStorage 不変回帰）は解消済み。`useEffectiveDisplayMode.test.tsx:110-122`「does not write to localStorage when the URL carries a display (AC-3, read-only)」が `Storage.prototype.setItem` を spy し、URL 由来表示時に `setItemSpy` 未呼び出し・`localStorage.getItem(KEY)` が元の `calendar` のまま、を assert。「実効値を localStorage に書き戻す」誤実装（ADR-002「URL 由来は永続化しない」を崩す）への回帰網ができている。コメント（`:105-109`）も「The hook is read-only — the only write point is `DisplayModeSwitch`」と書き込み点の単一性を明記。

- **[N-003]** hydration 回避（AC-6）の検証が正しく「初回レンダー = list」を pin できている。`useEffectiveDisplayMode.test.tsx` の `Probe` が毎レンダーで `observed.push(mode)` し、`act` がコミットと `useEffect` を同一フラッシュで走らせるため `observed` に `["list","calendar"]` の 2 値が積まれる。`:82-85`（AC-2）/ `:88-95`（AC-6）は `observed[0] === "list"`（effect 前 = サーバー既定）と `currentMode()`（effect 後 = 永続値）の差で「初回 = list」「mount 後 = 永続値」を区別。`useState(undefined)` + `useEffect` 後適用（リスク節「初期化子で localStorage を読むと SSR/CSR 割れ」）という実装意図を、結果だけ見て list を確認する偽陽性を避けて代理検証できている。

- **[N-004]** SSR 分岐（`window` 未定義）を `displayPreference.ssr.test.ts` として `// @vitest-environment node` で物理分離しているのが堅実。同一ファイル内で `window` を `delete` する不安定スタブに頼らず、実 node 実行で `typeof window === "undefined"` を踏ませ、`expect(typeof window).toBe("undefined")`（`:18`）で前提自体も assert（happy-dom が誤って効けば気付ける）。read → undefined / write → no-op & not throw の両方を AC-7 として固定。

- **[N-005]** `selectDisplayRaw` の単体テスト（`listSelectors.test.ts:643-654`）が undefined-passthrough を直接 pin。`selectDisplay`（`?? "list"`）と `selectDisplayRaw`（生値）の差異を「`selectDisplayRaw({})` / `({display:undefined})` が `undefined`」で固定し、コメント（`:635-642`）で「`selectDisplay` と同じ defaulting を足すと AC-2/AC-3/ADR-005 の分離が黙って壊れる」という WHY も明記。フック・ガードの「URL あり／無し」判定の土台を最小単位で守っている。

- **[N-006]** モック戦略の使い分けが実装の本質を迂回していない。`DisplayModeSwitch.test` / `useEffectiveDisplayMode.test` は `useEffectiveDisplayMode` を実コードのまま通し（`@tanstack/react-router` のみ薄く mock し `select` を実評価）、`readDisplayPreference` も実 happy-dom store 経由で動く（arch S-004 の方針どおり）。一方 `NoteListViews.test` はフックを直接 mock せず「永続値なし → 実効値 = URL 値」に倒し（`:68` コメントで前提明示）、`ListView`/`TileView`/`CalendarView` を stub して view 分岐（list/tile/calendar/undefined→list）を実フック経由で検証。計画の「フック直接 mock 推奨」とは別解だが、実フックを通す分むしろ偽陽性に強く、AC-2 の round-trip（`displayPreference.test`）と責務が重複せず棲み分いている。

- **[N-007]** AC 網羅の整理:
  - AC-1（select で localStorage 書き込み）: `DisplayModeSwitch.test:173-183`（キー書き込み）+ `displayPreference.test:27-33`（list/tile/calendar round-trip）の 2 本書き分け、計画 coverage S-001 どおり。
  - AC-2（URL/view 無指定 + 永続値 → 永続値）: `useEffectiveDisplayMode.test:76-86`。
  - AC-3（URL 明示 > 永続値）: `useEffectiveDisplayMode.test:67-74` + 読み取り専用回帰 `:110-122`。
  - AC-5（loaderDeps の display 除外維持 = #219）: `index.loaderDeps.test`（無変更・3 ケース）。PR は `loaderDeps`/`homeLoaderDeps`/loader/`shouldRedirectForSavedView`/`viewQueryToSearch` に一切触れておらず回帰なく担保。
  - AC-6: N-003 参照。AC-7: `displayPreference.test:39-56`（不正値→undefined / getItem throw / setItem throw）+ `.ssr.test`。
  いずれも検証可能な形で固定されている。

- **[N-008]（参考）** AC-4（SavedView 優先）は計画どおり新規自動テスト無しで、`useEffectiveDisplayMode.test` ケース (a)（URL display あり → 永続値無視）が「redirect 後に URL へ display が乗った状態」と等価という間接成立に依存する（coverage S-002）。`shouldRedirectForSavedView` が無変更で既存テスト（`listSelectors.test:656-`）に守られている点も踏まえ、ADR-002 の設計上の導出として許容範囲。フォローアップで displayMode 付き SavedView のシード整備時に手動 TC-4 を実走させると網が完成する。
