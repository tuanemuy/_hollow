# レビュー review-001 — Test 観点（Issue #650 / PR #721）

レビュー対象:
- 実装: `displayPreference.ts` / `useEffectiveDisplayMode.ts` / `listSelectors.ts`（`selectDisplayRaw` 追加） / `DisplayModeSwitch.tsx` / `NoteListViews.tsx`
- テスト: `displayPreference.test.ts`（新規） / `displayPreference.ssr.test.ts`（新規・計画外の追加） / `useEffectiveDisplayMode.test.tsx`（新規） / `DisplayModeSwitch.test.tsx`（更新） / `NoteListViews.test.tsx`（更新） / `index.loaderDeps.test.ts`（回帰・無変更）

実測: 対象 6 ファイル 26 テストすべて green（`vitest run`）。node プール（`vitest.config.ts`）で実行され、`@vitest-environment` のファイル単位上書きが効いている（既定 node、各 dom テストは happy-dom、SSR テストは node）。

総評: AC-1〜AC-7 を「実コードを通す or 妥当な mock」の使い分けで概ね適切にカバーしている。hydration 回避は「初回レンダー=list」を `observed[0]` で実際に pin できており、mount 後適用との区別が成立している。`useEffectiveDisplayMode` を実コードのまま通す方針（DisplayModeSwitch）と直接 mock する方針（NoteListViews）の使い分けも計画どおりで偽陽性リスクは低い。Blocker 相当の欠陥は無い。localStorage クリーンアップのリークも無い。指摘は Warning / Note レベルにとどまる。

## Test

### Blockers

なし

### Warnings

- **[W-001]** 早期 return パス（クリック=URL 生値と一致）で `writeDisplayPreference` が呼ばれることを pin するテストが無い / 場所: `DisplayModeSwitch.tsx:50-67`, `__tests__/DisplayModeSwitch.test.tsx:141-152` / 理由: 実装は `select(mode)` の先頭で `writeDisplayPreference(mode)` を呼び、その後に `if (mode === urlDisplay) return;` でガードしている（書き込み→ガードの順）。つまり「URL 生値と一致するモードを再クリック」しても localStorage への書き込みは発生する。これは ADR-005「ユーザー明示選択時に書く」の意図に沿った妥当な挙動だが、テストはこの順序を一切固定していない。`does not navigate when the clicked mode equals the URL display value` は `navigateMock` の不発のみを assert し、localStorage には触れない。将来「ガード→書き込み」に並べ替える（=再クリックで書かれなくなる）リファクタや、ガード内に `return` を足して書き込みを巻き込むリグレッションを検知できない。/ 提案: 同テストに `expect(window.localStorage.getItem(DISPLAY_KEY)).toBe("tile")`（再クリックでも書かれる）を 1 行足すか、書き込み点の意図（早期 return より前）をテストの WHY として明記する。

- **[W-002]** AC-3 を pin するテストが「URL あり時に localStorage を改変しない（読み取り専用）」までは見ていない / 場所: `__tests__/useEffectiveDisplayMode.test.tsx:67-74` / 理由: ケース (a) は `currentDisplay="tile"` + localStorage=`calendar` で実効値が `tile` になることを確認しており、AC-3 の主眼（URL 優先）はカバーされている。ただし手動テスト TC-3 が能動的に確認している「URL 由来表示時に localStorage 値が不変（`calendar` のまま）」という不変条件は自動テストに無い。`useEffectiveDisplayMode` は読み取りのみなので現状は壊れようがないが、将来「実効値を localStorage に書き戻す」誤実装が入ると AC-3/ADR-002 の「URL 由来は永続化しない」が崩れる。これを検知する回帰網は無い（書き込み点は `DisplayModeSwitch` 側にあるためフックの責務外という整理も成り立つ）。/ 提案: フック側で `localStorage.getItem` の不変を確認するか、少なくとも「フックは読み取り専用（書き込み点は DisplayModeSwitch のみ）」をコメントで明示し、書き込み点の単一性を `DisplayModeSwitch.test` の AC-1 ケースで担保している旨を相互参照する。

### Notes

- **[N-001]** hydration 回避の検証が正しく「初回レンダー=list」を pin できている。`useEffectiveDisplayMode.test.tsx:82-85` / `:88-95` は `Probe` が毎レンダーで `observed.push(mode)` し、`act` 内で render→effect flush まで進んだ後に `observed[0] === "list"` を assert する。`act` がコミットと `useEffect` を同一フラッシュで走らせるため `observed` には `["list", "calendar"]` の 2 値が積まれ、`observed[0]`（effect 前）と `currentMode()`（effect 後・DOM 反映）の差で「初回=サーバー既定 list」「mount 後=永続値」を明確に区別できている。これは「mount 後に適用された結果だけ見て list を確認する」偽陽性を避けた良い設計。AC-6 の本質（SSR HTML との一致）を node 上の単体で代理検証する妥当なアプローチ。

- **[N-002]** SSR 分岐（`window` 未定義）の検証を `displayPreference.ssr.test.ts` として `// @vitest-environment node` で物理的に分離しているのが良い。計画（ステップ 6）には happy-dom 1 ファイルしか挙がっていなかったが、同一ファイル内で `window` を `delete` する不安定なスタブに頼らず、環境を分けて `typeof window === "undefined"` を実際の node 実行時条件で踏ませている。`expect(typeof window).toBe("undefined")` で前提自体も assert しており、happy-dom が誤って効いた場合に気付ける。計画を上回る堅実な追加。

- **[N-003]** localStorage のテスト間リークは無い。`displayPreference.test.ts` は before/after 両方で `window.localStorage.clear()`、`useEffectiveDisplayMode.test.tsx` / `DisplayModeSwitch.test.tsx` / `NoteListViews.test.tsx` も `beforeEach` で `clear()`（DisplayModeSwitch は after でも root unmount）。`vi.spyOn(...).mockImplementation` を使う throw 系ケースも `afterEach(vi.restoreAllMocks)` で巻き戻しており、getItem/setItem の差し替えが後続テストへ波及しない。`module-scope` の `currentDisplay` / `observed` も `beforeEach` でリセットされておりミュータブル mock 状態のリークも無い。

- **[N-004]** mock 戦略の使い分けが実装の本質を迂回していない。`DisplayModeSwitch.test` / `useEffectiveDisplayMode.test` は `useEffectiveDisplayMode` を実コードのまま通し（`@tanstack/react-router` のみ薄く mock し `select` を実評価）、`readDisplayPreference` も実 happy-dom store 経由で動く。一方 `NoteListViews.test` はフックを直接は mock せず「永続値なし → 実効値=URL 値」に倒して `useSearch` 経由で分岐を駆動する（計画の「フック直接 mock 推奨」ではなく実コード通しを選択）。`NoteListViews.test.tsx:68` のコメントで「永続値なしゆえ実効値=URL 値」と前提を明示しており、view 分岐（list/tile/calendar/undefined→list）の検証が実フックを通って成立する点でむしろ偽陽性に強い。`ListView`/`TileView`/`CalendarView` は子の描画詳細を切り離すための妥当な stub。

- **[N-005]** `selectDisplayRaw` のガード分離（navigate 要否=URL 生値 / active 表示=実効モード、ADR-005 / arch P-001）を能動的に pin できている。`DisplayModeSwitch.test.tsx:166-182`（URL 無指定 + 永続値 calendar で calendar クリック → navigate 1 回）が「実効モードでガードしていたら early-return して navigate 0 回になる」反証ケースになっており、計画 P-001 の核心バグの再発を捕捉できる。`useEffectiveDisplayMode.test` の (a)（URL あり → 永続値無視）と合わせ、生値 selector と実効値の役割分担が両側から固定されている。

- **[N-006]** 回帰担保（AC-5）は維持されている。`index.loaderDeps.test.ts` は無変更で、`display` 除外（`expect(deps).not.toHaveProperty("display")`）と他フィールド保全・冪等性の 3 ケースを pin。PR の変更は `loaderDeps` / `homeLoaderDeps` / loader / `shouldRedirectForSavedView` / `viewQueryToSearch` に一切触れておらず、#219 の deps 除外設計が回帰なく保たれていることをこのテストが引き続き保証する。

- **[N-007]（参考）** AC-4（SavedView 優先）は計画どおり新規自動テスト無しで、`useEffectiveDisplayMode.test` ケース (a)（URL display あり → 永続値無視）が「redirect 後に URL へ display が乗った状態」と等価という間接成立に依存する。手動テスト TC-4 は前提データ未整備で SKIP。自動・手動とも SavedView 文脈での能動検証は無いが、これは ADR-002 の「redirect 経路は不変・永続値は URL 無指定時のみ発火」という設計上の導出であり、計画の判断（新規テスト不要）と整合する。SavedView 経路自体（`shouldRedirectForSavedView`）が無変更で既存テストに守られている点も踏まえ、許容範囲。フォローアップで displayMode 付き SavedView のシード整備時に TC-4 を実走させると網が完成する。
