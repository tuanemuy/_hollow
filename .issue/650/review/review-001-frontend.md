# PR #721 レビュー — Issue #650 表示モード永続化

対象 PR: #721
観点: Frontend（コンポーネント設計・状態管理・React 19/RSC・hydration・TanStack Router の useSearch/navigate・UX・a11y）
レビュー日: 2026-06-13

## Frontend

### Blockers

なし。

AC-1〜AC-7 はいずれも Frontend 実装で満たされている。設計上の主要論点（hydration 回避・navigate 要否/active 表示の分離・referential-equality・SaveViewDialog 据え置き・#219 整合・aria 契約・フラッシュ扱い）すべてが ADR / plan の意図どおりに実装されている。

### Warnings

- **[W-001]** `selectDisplayRaw` の単体テストが未追加 / 場所: `app/components/note/list/__tests__/listSelectors.test.ts`（`selectDisplay` は L621〜で pin 済みだが `selectDisplayRaw` は無し） / 理由: `selectDisplayRaw` は本 PR で新設され、`useEffectiveDisplayMode` の「URL あり/無し」判定と `DisplayModeSwitch` の navigate 要否ガードの双方が依存する load-bearing な selector。`?? "list"` を**付けない**（生 `undefined` を返す）ことが contract の本質で、誤って `selectDisplay` と同じ defaulting を入れると AC-2/AC-3/ADR-005 の分離が静かに崩れる。フックレベルのテスト（`useEffectiveDisplayMode.test.tsx` / `DisplayModeSwitch.test.tsx`）が実コード経由で間接的にカバーしてはいるが、selector 自体の「undefined 透過」を pin する単体テストが `selectDisplay` と並んで無いのは非対称。 / 提案: `listSelectors.test.ts` に `selectDisplayRaw({ display: "tile" }) === "tile"` と `selectDisplayRaw({}) === undefined` / `selectDisplayRaw({ display: undefined }) === undefined` の 3 ケースを追加し、生値透過を直接固定する。

- **[W-002]** `useEffectiveDisplayMode` の `useEffect` 依存配列が空のため、mount 後に localStorage が更新されても再読込されない / 場所: `app/components/note/list/useEffectiveDisplayMode.ts:33-35` / 理由: 同一マウント中に `DisplayModeSwitch` で別モードを選ぶと `writeDisplayPreference` で localStorage は更新されるが、その後 URL に `display` が乗る（navigate）ので実効モードは URL 値に切り替わり、表示は正しくなる。ただし「URL 無指定のまま localStorage だけが別タブ等で更新された」ケースでは `persisted` state が古いまま残る。現状は単一ページ・同期 navigate 経路に限れば実害は無く、ADR-004 のスコープ（mount 後 1 回適用）とも整合するため Blocker ではない。 / 提案: 現状の割り切り（mount 時 1 回読み）を JSDoc に一行追記して「別タブ同期は非対応（端末ローカル・mount 時スナップショット）」を明示しておくと、将来 `storage` イベント購読を期待されたときの誤解を防げる。スコープ外なので任意。

### Notes

- **[N-001]** hydration 回避が ADR-004 / plan のリスク記述どおり正しく実装されている。`useState<DisplayMode | undefined>(undefined)` + `useEffect(() => setPersisted(readDisplayPreference()), [])` の形（`useEffectiveDisplayMode.ts:30-35`）で、初回クライアントレンダーは必ず `urlDisplay ?? undefined ?? "list"` = サーバーと同じ `"list"`（URL 無指定時）。`useState` 初期化子で localStorage を読む反パターンは回避されている。`useEffectiveDisplayMode.test.tsx` の AC-6 ケース（`observed[0] === "list"`）が初回レンダーのサーバー一致を能動的に pin しており、テスト設計も的確。

- **[N-002]** ADR-005 / plan arch [P-001] の「navigate 要否＝URL 生値 / active 表示＝実効モード」の分離が `DisplayModeSwitch.tsx:47-48` で正しく実装されている。早期 return ガードは `urlDisplay`（`selectDisplayRaw`、生値）で `if (mode === urlDisplay) return;`（L57）、active 表示は `current = useEffectiveDisplayMode()`（L48）。`writeDisplayPreference(mode)` を早期 return の**前**（L56）に置いているため、「クリックしたモード = 実効モードだが URL は無指定」のケースでも書き込みは確実に走り、かつ navigate も走る（URL に pin される）。早期 return ロジックに穴は無い。`DisplayModeSwitch.test.tsx:166-182` の「URL 無指定 + 永続値 calendar で calendar クリック → navigate される」ケースが、まさに plan が WHY として挙げた URL ズレバグの回帰を pin している。

- **[N-003]** `selectDisplayRaw` / `selectDisplay` ともにプリミティブ値（`DisplayMode | undefined`）を返す単純 selector で、`useSearch` の referential-equality を壊さない。JSDoc にも referential-equality 維持の WHY が明記（`listSelectors.ts:50-52`）。不要な再レンダーは生じない。

- **[N-004]** `SaveViewDialog.tsx` は `selectDisplay`（URL 素直値、L48）のまま据え置かれており、永続値オーバーレイ（`useEffectiveDisplayMode`）を適用していない。plan スコープ「含まれないもの」/ coverage [P-002] の意図（URL 無指定 + 永続値 calendar で保存しても calendar が焼き付かない）どおり。PR diff に `SaveViewDialog.tsx` が含まれない＝無変更であることも確認済み。

- **[N-005]** #219 整合（AC-5）。`app/routes/_app/index.tsx`（`homeLoaderDeps`）/ `shouldRedirectForSavedView` / `viewQueryToSearch` はいずれも PR diff に含まれず無変更。`DisplayModeSwitch` の navigate は既存の `homeSearchUpdater` + `replace:true` 経路のまま（L58-66）で、`display` は loaderDeps 除外のため loader 再実行を起こさない。永続値適用（mount 後 state 更新）も URL/loader に一切干渉しない。書き込みは `router.navigate` と同じ同期パスに副作用として乗るのみ。

- **[N-006]** aria 契約維持（`DisplayModeSwitch.tsx:70-93`）。`role="tablist"` + `aria-label="表示形式"`、各 `role="tab"` + `aria-selected={active}` + `aria-label`/`title`（アイコンのみ #626 ADR-001）、`data-active={active || undefined}` の CLAUDE.md 規約準拠。`DisplayModeSwitch.test.tsx:87-115` がこの契約を網羅 pin。active 判定が実効モード `current` ベースになったことで、URL 無指定 + 永続値ありのとき segmented の `aria-selected` が初期表示モードと一致する（永続値 calendar 表示なのに list がアクティブ表示になるズレが解消）— a11y 的にも表示と支援技術への伝達が一致して正しい。

- **[N-007]** フラッシュ（1 フレーム list → 永続値）の扱いは ADR-004 どおり「mount 後 useEffect で適用、list 以外の初回表示で 1 フレームのレイアウト差は許容」。`CalendarView` の `typeof Intl` ガードと同等の割り切りで、データ再取得を伴わないため瞬時。`NoteListViews` は `useEffectiveDisplayMode()` のみを参照しビュー分岐（`ListView`/`TileView`/`CalendarView`）するだけで、`isLoading` dim 処理（#354）等の既存挙動は保持。

- **[N-008]** SSR セーフラッパ（`displayPreference.ts`）が AC-7 を満たす。`readDisplayPreference` は `typeof window === "undefined"` 早期 return → `try/catch` → `DISPLAY_MODES.includes` バリデーションの三段ガード。`writeDisplayPreference` も同様 + 不正 `mode` の早期弾き。テストは happy-dom（`displayPreference.test.ts`: round-trip / 不正値 / getItem・setItem throw）と node 環境（`displayPreference.ssr.test.ts`: window 無し no-op）に分割され、SSR と throw 双方を実環境で検証している。ライブラリ JSDoc に localStorage 採用理由・ガード理由・配置理由（P30 横展開時の見直し）の WHY が記載され CLAUDE.md のコメント方針に合致。

- **[N-009]** 検証状況: `pnpm typecheck` クリーン、`note/list` 配下テスト 177 件 PASS。manual-test は AC-1/2/3/6 PASS、AC-5 簡易 PASS、AC-4 は前提データ（displayMode 付き SavedView）未整備 + 保存 UI disabled により SKIP。AC-4 の SKIP は実装バグではなく、plan coverage [S-002] のとおり `useEffectiveDisplayMode.test.tsx` ケース (a)（URL display あり → 永続値無視）が AC-4 の不変条件（redirect 後 URL に display が乗る → オーバーレイ非発火）を等価にカバーしているため、Frontend 観点で追加対応は不要。

## 総括

Blockers なし。実装は plan / ADR の設計判断（特に hydration 回避・navigate/active の関心分離・referential-equality・#219 非干渉）に忠実で、テスト設計も AC を能動的に pin している。Warning 2 件はいずれも品質向上の任意改善（W-001: selector 単体テストの非対称解消、W-002: mount 時スナップショットの JSDoc 明示）で、マージを妨げない。
