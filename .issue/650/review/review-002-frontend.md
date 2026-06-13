# PR #721 レビュー（2回目・ゼロベース） — Issue #650 表示モード永続化

対象 PR: #721（branch: `issue/650/persist-display-mode`）
観点: Frontend（コンポーネント設計・状態管理・React 19/RSC・hydration・TanStack Router・UX・a11y・#219整合・aria）
レビュー日: 2026-06-13

## Frontend

### Blockers

なし。

実装ロジック自体（`displayPreference.ts` / `useEffectiveDisplayMode.ts` / `DisplayModeSwitch.tsx` / `NoteListViews.tsx` / `listSelectors.ts`）は AC-1〜AC-7 を満たし、ADR-001〜005 の設計判断（hydration 回避・navigate 要否/active 表示の分離・referential-equality・SaveViewDialog 据え置き・#219 非干渉・aria 契約）どおりに正しく書かれている。マージを止める実装欠陥は無い。

### Warnings

- **[W-001]** Round 1 で出た修正（selectDisplayRaw 単体テスト・useEffect の WHY コメント・追加テスト 2 件）がローカル作業ツリーにしか存在せず、PR にコミット／push されていない / 場所: `app/components/note/list/__tests__/listSelectors.test.ts`、`app/components/note/list/useEffectiveDisplayMode.ts`、`app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`、`app/components/note/list/__tests__/useEffectiveDisplayMode.test.tsx`（いずれも `git status` で `M`＝未コミット） / 理由: `gh pr view 721 --json files` のファイル一覧に `listSelectors.test.ts` が含まれず、`git show issue/650/persist-display-mode:.../listSelectors.test.ts | grep selectDisplayRaw` は 0 件。一方ローカル作業ツリーには selectDisplayRaw テスト（生値透過 3 ケース）・useEffect の「mount 時 1 回スナップショット／別タブ非同期」WHY コメント・DisplayModeSwitch の early-return write 順序テスト・useEffectiveDisplayMode の read-only テストが揃っている。つまり Round 1 の Warning（W-001 selectDisplayRaw テスト / W-002 useEffect WHY コメント）への対応は**作業ツリー上は完了しているが、PR の HEAD コミット `e951b58f` には入っていない**。このまま push せずマージ／push すると、レビューで確認した改善がすべて PR から脱落する。 / 提案: 未コミットの 4 ファイル（`listSelectors.test.ts` / `useEffectiveDisplayMode.ts` / `DisplayModeSwitch.test.tsx` / `useEffectiveDisplayMode.test.tsx`）を PR ブランチにコミットして push する。push 後に `gh pr view 721` のファイル一覧へ反映されることを確認すること。（補足: 作業ツリー込みで `note/list` 配下 6 ファイル 123 テストは全 PASS を確認済み。実装・テストの中身そのものは問題なし。コミット漏れのみが論点。）

### Notes

- **[N-001]** hydration 回避（AC-6 / ADR-004）が正しく実装されている。`useEffectiveDisplayMode.ts:30-40` は `useState<DisplayMode | undefined>(undefined)` + `useEffect(() => setPersisted(readDisplayPreference()), [])` の形で、初回クライアントレンダーは `urlDisplay ?? undefined ?? "list"`＝サーバーと同じ（URL 無指定時 `"list"`）。`useState` 初期化子で localStorage を読む反パターンは回避。`useEffectiveDisplayMode.test.tsx:88-95` の `observed[0] === "list"` が初回レンダーのサーバー一致を能動的に pin しており、テスト設計も的確（"use client" 境界では useEffect が SSR で走らず、hydration 後初回に発火する React 19/RSC の挙動どおり）。

- **[N-002]** navigate 要否＝URL 生値 / active 表示＝実効モードの関心分離（ADR-005 / plan arch P-001）が `DisplayModeSwitch.tsx:47-57` で正しい。早期 return ガードは `urlDisplay = useSearch({ select: selectDisplayRaw })`（生値、L47）で `if (mode === urlDisplay) return;`（L57）、active 表示は `current = useEffectiveDisplayMode()`（L48）。`writeDisplayPreference(mode)` を guard の**前**（L56）に置くため「クリックモード＝実効モードだが URL 無指定」でも書き込みと navigate の双方が走り、URL がズレない。`DisplayModeSwitch.test.tsx:185-201`（URL 無指定 + 永続値 calendar で calendar クリック → navigate される）が plan の WHY バグの回帰を pin。

- **[N-003]** `selectDisplayRaw` / `selectDisplay` はともにプリミティブ（`DisplayMode | undefined`）を返す単純 selector で、`useSearch` の referential-equality（構造比較メモ化）を壊さない。`listSelectors.ts:42-55` の JSDoc に「`?? "list"` defaulting を付けない＝生値透過が contract」「referential-equality 維持」の WHY が明記されており、誤って defaulting を入れる事故を防ぐ意図が読み取れる。不要な再レンダーは生じない。

- **[N-004]** `SaveViewDialog.tsx` は `selectDisplay`（URL 素直値）据え置きで永続値オーバーレイを適用していない（PR diff に同ファイルが含まれない＝無変更を確認）。plan スコープ「含まれないもの」/ coverage [P-002] の意図（URL 無指定 + 永続値 calendar で「ビューとして保存」しても calendar が焼き付かない）どおりで、ADR-005 の不変条件を保っている。

- **[N-005]** #219 整合（AC-5）。`app/routes/_app/index.tsx`（`homeLoaderDeps`）/ `shouldRedirectForSavedView` / `viewQueryToSearch` は PR diff に含まれず無変更。`DisplayModeSwitch` の navigate は既存の `homeSearchUpdater` + `replace:true` 経路のまま（`DisplayModeSwitch.tsx:58-66`）で、`display` は loaderDeps 除外のため loader 再実行を起こさない。永続値適用（mount 後 state 更新）も URL/loader に一切干渉しない。`homeSectionResetKey`（`listSelectors.ts:555`）も `display` を除外し続けており、表示切替が SectionErrorBoundary の reset を誘発しない点も #219 の趣旨と整合。

- **[N-006]** aria 契約維持（`DisplayModeSwitch.tsx:70-93`）。`role="tablist"` + `aria-label="表示形式"`、各 `role="tab"` + `aria-selected={active}` + `aria-label`/`title`（アイコンのみ #626 ADR-001）、`data-active={active || undefined}`（CLAUDE.md ADR-003 準拠）。active 判定が実効モード `current` ベースになったことで、URL 無指定 + 永続値ありのとき segmented の `aria-selected` が初期表示モードと一致する（永続値 calendar 表示なのに list がアクティブというズレが解消）— 視覚と支援技術への伝達が一致して a11y 的に正しい。`DisplayModeSwitch.test.tsx:87-115` がこの契約を網羅 pin。

- **[N-007]** フラッシュ（1 フレーム list → 永続値）の扱いは ADR-004 どおり「mount 後 useEffect で適用、list 以外の初回表示で 1 フレームのレイアウト差は許容」。`NoteListViews` は `useEffectiveDisplayMode()` のみを参照しビュー分岐するだけで、`isLoading` dim 処理（#354）等の既存挙動を保持。データ再取得を伴わずレイアウト切替のみのため瞬時で、`CalendarView` の `typeof Intl` ガードと同等の割り切り。manual-test TC-6 で hydration mismatch 警告なしを実画面確認済み。

- **[N-008]** SSR セーフラッパ（`displayPreference.ts`）が AC-7 を満たす。`readDisplayPreference` は `typeof window === "undefined"` 早期 return → `try/catch` → `DISPLAY_MODES.includes` バリデーションの三段ガード。`writeDisplayPreference` も同様 + 不正 `mode` 早期弾き + setItem の throw を握り潰す（ナビゲーションを壊さない best-effort 永続）。`displayPreference.test.ts`（happy-dom: round-trip / 不正値 / getItem・setItem throw）と `displayPreference.ssr.test.ts`（node: window 無し no-op）の 2 環境分割が SSR と throw を実環境で検証。ライブラリ JSDoc に localStorage 採用理由・ガード理由・配置理由（P30 横展開時の見直し）が記載され CLAUDE.md のコメント方針に合致。

- **[N-009]** Round 1 の W-002（useEffect の WHY コメント）は作業ツリー上では `useEffectiveDisplayMode.ts:33-36` に「mount 時 1 回スナップショット／別タブ同期は設計上非対応」のコメントとして適切に追記済み（ただし W-001 で述べたとおり未コミット）。これにより将来 `storage` イベント購読を期待されたときの誤解を防げる。本 Issue のスコープ（端末ローカル・mount 時スナップショット）として割り切りは妥当。

- **[N-010]** 検証状況: 作業ツリー込みで `note/list` 配下テスト 6 ファイル 123 件 PASS。manual-test は AC-1/2/3/6 PASS、AC-5 簡易 PASS、AC-4 は前提データ（displayMode 付き SavedView）未整備 + 保存 UI disabled により SKIP。AC-4 SKIP は実装バグではなく、`useEffectiveDisplayMode.test.tsx` ケース (a)（URL display あり → 永続値無視）が AC-4 の不変条件（redirect 後 URL に display が乗る → オーバーレイ非発火）を等価にカバーするため Frontend 観点で追加対応は不要。

## 総括

Blockers なし。実装・テストの中身は plan / ADR に忠実で品質が高く、Round 1 で指摘された 2 件の Warning への対応（selectDisplayRaw テスト・useEffect WHY コメント・補強テスト）も内容としては完了している。唯一の論点は **W-001: それらの修正が作業ツリーにしか存在せず PR にコミット／push されていない**こと。push すれば Round 1 の Warning は完全に解消し、マージ可能な状態になる。
