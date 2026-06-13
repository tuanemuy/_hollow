# PR #721 レビュー（3回目・ゼロベース） — Issue #650 表示モード永続化

対象 PR: #721（branch: `issue/650/persist-display-mode`、HEAD `8d38dae2`、push 済み）
観点: Frontend（コンポーネント設計・hydration・TanStack Router・a11y・#219 整合・aria）
レビュー日: 2026-06-13

## 検証サマリ

- PR 自身のコミット（`e951b58f` / `8d38dae2`）が変更するのは `note/list/` 配下 11 ファイルのみ。`SaveViewDialog.tsx` / `app/routes/_app/index.tsx`（`homeLoaderDeps`）/ `shouldRedirectForSavedView` / `viewQueryToSearch` は無変更（diff に不在）を確認。
- branch HEAD と `origin/issue/650/persist-display-mode` は同一（`8d38dae2`）。`main` は branch の ancestor（branch は up to date、未マージのコミットなし）。
- `pnpm typecheck` クリーン / 変更 5 ソースの biome lint クリーン / `note/list` 配下 unit `Test Files 11 passed, Tests 182 passed`。

## Frontend

### Blockers

なし。

`displayPreference.ts` / `useEffectiveDisplayMode.ts` / `DisplayModeSwitch.tsx` / `NoteListViews.tsx` / `listSelectors.ts` は AC-1〜AC-7 を満たし、ADR-001〜005（localStorage 採用・優先順位・#219 非干渉・hydration 回避・保存タイミングと関心分離）どおりに実装されている。マージを止める欠陥なし。

### Warnings

- **[W-001]（Round 2 Frontend W-001 の解消確認 / 解消済み）** Round 2 で唯一の論点だった「Round 1 の修正（`selectDisplayRaw` 単体テスト・`useEffect` の WHY コメント・補強テスト 2 件）が作業ツリーにのみ存在し PR にコミット／push されていない」は**解消済み**。検証: `git show issue/650/persist-display-mode:.../listSelectors.test.ts | grep -c selectDisplayRaw` = 8 件、同 HEAD の `useEffectiveDisplayMode.ts` に `one-time snapshot` WHY コメントが存在、`DisplayModeSwitch.test.tsx`（コミット版）に early-return write 順序テスト（L154-171）と active=実効モード追従テスト（L203-227）が含まれる。これらはコミット `8d38dae2`（"test: 表示モード永続化のレビュー指摘を反映"）に入り、`origin` へ push 済み。`git status` 上 `note/list/` の作業ツリーは clean。**この PR で対応すべき新規 Warning はなし。**

### Notes

- **[N-001]** hydration 回避（AC-6 / ADR-004）が正しい。`useEffectiveDisplayMode.ts:30-39` は `useState<DisplayMode | undefined>(undefined)` + 空 deps `useEffect(() => setPersisted(readDisplayPreference()), [])`。初回クライアントレンダーは `urlDisplay ?? undefined ?? "list"` = サーバー既定と一致。`useState` 初期化子で localStorage を読む反パターンを回避。`useEffectiveDisplayMode.test.tsx:83,94` の `observed[0] === "list"` が「初回レンダーがサーバー一致」を per-render probe で能動 pin。

- **[N-002]** navigate 要否＝URL 生値 / active 表示＝実効モードの関心分離（ADR-005 / plan arch P-001）が `DisplayModeSwitch.tsx` で正しい。早期 return ガードは `urlDisplay = useSearch({ select: selectDisplayRaw })`（生値, L47）で `if (mode === urlDisplay) return;`（L57）、active は `current = useEffectiveDisplayMode()`（L48, L72）。`writeDisplayPreference(mode)` を guard の前（L56）に置くため「クリックモード＝実効モードだが URL 無指定」でも write と navigate の双方が走る。`DisplayModeSwitch.test.tsx:185-201`（URL 無指定 + 永続値 calendar → calendar クリックで navigate される）が plan の WHY バグ（URL/表示ズレ）の回帰を pin。

- **[N-003]** Round 2 Test W-001（active 表示が実効モードに追従する pin）が `DisplayModeSwitch.test.tsx:203-227` として追加され、コミット済み。URL 無指定 + 永続値 calendar で mount 後に calendar タブが `aria-selected="true"`・list が `"false"` になることを固定。関心分離 (B) 側の能動検証が揃った。

- **[N-004]** `selectDisplayRaw` / `selectDisplay` はともにプリミティブ（`DisplayMode | undefined` / `DisplayMode`）返しの単純 selector で、`useSearch` の referential-equality を壊さない（`listSelectors.ts:38-55`）。JSDoc に「`?? "list"` defaulting を付けない＝生値透過が contract」「referential-equality 維持」の WHY が明記され、誤って defaulting を戻す事故を防ぐ。`listSelectors.test.ts` が生値透過 3 ケース（list/tile/calendar 透過・undefined 透過）を pin。

- **[N-005]** `SaveViewDialog.tsx` は `selectDisplay`（URL 素直値）据え置きで永続値オーバーレイ非適用（PR diff に同ファイル不在＝無変更を確認）。plan スコープ「含まれないもの」/ coverage [P-002] の意図（URL 無指定 + 永続値 calendar で「ビューとして保存」しても calendar が焼き付かない）どおりで、ADR-005 の不変条件を保持。

- **[N-006]** #219 整合（AC-5）。`app/routes/_app/index.tsx`（`homeLoaderDeps`）/ `shouldRedirectForSavedView` / `viewQueryToSearch` は PR diff に不在＝無変更。`DisplayModeSwitch` の navigate は既存の `homeSearchUpdater` + `replace:true` のまま（`DisplayModeSwitch.tsx:58-66`）で、`display` は loaderDeps 除外ゆえ loader 再実行を起こさない。永続値適用（mount 後 state 更新）も URL/loader に干渉しない。`homeSectionResetKey`（`listSelectors.ts:555-568`）も `display` を除外し続け、表示切替が SectionErrorBoundary reset を誘発しない点も #219 の趣旨と整合。

- **[N-007]** aria 契約維持（`DisplayModeSwitch.tsx:70-93`）。`role="tablist"` + `aria-label="表示形式"`、各 `role="tab"` + `aria-selected={active}` + `aria-label`/`title`（アイコンのみ #626 ADR-001）、`data-active={active || undefined}`（CLAUDE.md ADR-003 準拠）。active 判定が実効モード `current` ベースになり、URL 無指定 + 永続値ありのとき `aria-selected` が初期表示モードと一致（永続値 calendar 表示なのに list が active というズレが解消）— 視覚と支援技術の伝達が一致。`DisplayModeSwitch.test.tsx:87-115` が icon-only aria 契約を網羅 pin。

- **[N-008]** SSR セーフラッパ（`displayPreference.ts`）が AC-7 を満たす。`readDisplayPreference` は `typeof window === "undefined"` 早期 return → `try/catch` → `DISPLAY_MODES.includes` バリデーションの三段ガード（L35-43）。`writeDisplayPreference` は SSR ガード + 不正 `mode` 早期弾き + setItem throw 握り潰し（L49-58, best-effort 永続でナビゲーションを壊さない）。`displayPreference.test.ts`（happy-dom: round-trip / 不正値 / getItem・setItem throw）と `displayPreference.ssr.test.ts`（node: window 無し no-op）の 2 環境分割で SSR と throw を実環境検証。ライブラリ JSDoc に採用理由・ガード理由・P30 横展開時の配置見直しが記載され CLAUDE.md コメント方針に合致。

- **[N-009]** `NoteListViews.tsx:29` は `useEffectiveDisplayMode()` のみを参照しビュー分岐し、`isLoading` dim 処理（#354）等の既存挙動を保持。フラッシュ（1 フレーム list → 永続値）は ADR-004 どおり mount 後 useEffect 適用に限定され、データ再取得を伴わないレイアウト切替のみで瞬時。`CalendarView` の `typeof Intl` ガードと同等の割り切り。

- **[N-010]** `useEffect` の WHY コメント（`useEffectiveDisplayMode.ts:33-39`）が「mount 時 1 回スナップショット／別タブ `storage` 同期は設計上非対応（低頻度・端末ローカルゆえ購読コストに見合わない）」を明記。将来 `storage` イベント購読を期待されたときの誤解を防ぐ。本 Issue のスコープ（端末ローカル・mount 時スナップショット）として割り切りは妥当。

- **[N-011]** 検証状況: `note/list` 配下 unit 11 ファイル 182 件 PASS、`pnpm typecheck` クリーン、変更 5 ソース biome lint クリーン。AC-4（SavedView 優先）は `useEffectiveDisplayMode.test.tsx:67-74`（URL display あり → 永続値無視）が不変条件（redirect 後 URL に display が乗る → オーバーレイ非発火）を等価カバーし、Frontend 観点で追加対応は不要（plan coverage [S-002] と整合）。

## 総括

Blockers なし、新規 Warning なし。Round 2 の唯一の論点（Frontend W-001 の未コミット・未 push）は commit `8d38dae2` の push で解消済み（branch HEAD = origin = `8d38dae2`、作業ツリー clean）。Round 2 Test W-001（active=実効モード追従の pin）も同コミットに取り込み済み。実装・テストは plan / ADR に忠実で、hydration 回避・関心分離・#219 非干渉・aria 整合・SSR セーフ性のいずれも適切。Frontend 観点でマージ可能。
