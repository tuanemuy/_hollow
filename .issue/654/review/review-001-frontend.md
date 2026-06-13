# PR #691 レビュー — Frontend

対象: Issue #654「公開ページ(P30)の『タグを追加(＋)』UI」
観点: React/TanStack・コンポーネント設計・UX・楽観更新・スタイリング規約
検証コマンド: `pnpm typecheck`（pass）/ `vitest run PublicTopControls.test.tsx`（11 pass）

## 結論

AC-1（モック一致・CHIP 実線）/ AC-5（楽観更新・URL 反映・cap=8 抑止）/ AC-6（既存 chips 整合）はいずれも満たしている。
実装は計画・ADR の意図に忠実で、`filterChipGhost` 誤用なし・`mergeTagChips` 流用なし・cap 抑止の純関数切り出しまで計画通り。**Blocker なし**。a11y まわりの小さな乖離（disabled option のロービング挙動・重複ラベル）を Warning/Note で挙げる。

## 検証サマリ

- **AC-1**: `TagAddPopover` のトリガーは公開面 `CHIP`（`styles.ts:105`、実線 pill）を使用。`note/list/styles.ts:80` の破線 `filterChipGhost` は public 配下で未 import（grep 確認済み）。Plus アイコン `size-[11px]` / `strokeWidth={2.2}`、ラベル「タグを追加」、配置はタグ chips の後・期間 chip の前。モック `P30-user-public-top.html` 570-573 と構造・見た目一致。✅
- **AC-5**: option クリック → `onToggle`(=`toggleTag`) → `setTags(toggleTagSet(...))` → `run` で `applyOptimistic` ＋ `router.navigate(nextFilterSearch)` を1 transition でラップ。既存タグ chips・期間と同一フローに合流。cap=8 到達時は `isTagAddSuppressed` で未選択 option を `aria-disabled` ＋ click ガード。`isTagAddSuppressed` を export しユニットテスト済み（8/false→抑止, 8/true→非抑止, 7/false・0/false→通過）。✅
- **AC-6**: chips 行は `mergeTagChips(tagOptions, [...optimisticTags])` のまま不変。母集合 `allTags` は ＋chip にのみ供給。「allTags の `extra` が chips 行(#extra)に漏れない」テストあり（`PublicTopControls.test.tsx:152`）。母集合 option は `allTags` を直接 map し、選択判定のみ `selected`(=`optimisticTags`)共有。母集合文字列＝`toggleTag` 引数＝URL `tags` 値で閉じている。✅
- **母集合の不変性**: `loadPublicTags` は loader dep に依らず `username` のみ入力。`Promise.all` の第3レーンで並列ロード、`isNotFoundError`→`notFound()` 変換は `loadProfile`/`loadNotes` と同形。`serverData` にユーザー入力（tags/sort/from/to）を流していない。✅

## Frontend

### Blockers

なし

### Warnings

#### [W-001] cap=8 抑止時、`aria-disabled` option がロービングフォーカスの対象に残り、キーボード操作で「焦点は当たるが何も起きない」死に option になる

場所: `app/components/public/PublicTopControls.tsx:688-697`（`useRovingMenu({ itemCount: tags.length })`）, `731-760`（option レンダー）

理由:
`useRovingMenu` は `itemCount: tags.length`（全 option）でインデックスを張り、`querySelectorAll('[role="option"]')` で**全 option**（disabled 含む）を順に `.focus()` する。cap=8 到達後、未選択 option は `aria-disabled` になるが `role="option"` のまま DOM に残るため、ArrowDown/Up でこれらにフォーカスが移動する。フォーカスは当たるのに Enter/Space では click ハンドラが `if (disabled) return` で早期 return するので**何も起きない**。auth 側 `TagPickerPopover` は option を disabled にしない設計（FilterBar.tsx:529-559）なので、この「focusable だが非操作」な状態は本 PR で新たに生じた a11y 乖離。APG Listbox パターンでは disabled option も移動先に含めてよい（`aria-disabled` で告知）ので致命ではないが、現状 `TAG_ADD_OPTION_ITEM`（656行）の `aria-disabled:opacity-40` は視覚表現のみで、ロービングが disabled をスキップしない点はユーザーに「押せそうで押せない」混乱を与える。

提案（いずれか）:
- 最小: 現状維持でも APG 準拠なので可。ただし `aria-disabled` option に到達したことが SR で伝わるか手動確認（VoiceOver 等）を完了基準に追記。
- より良い UX: cap 到達時は未選択 option を**そもそも非表示**にせず disabled のまま残す現方針なら、ロービングの移動対象から disabled を除外する（`useRovingMenu` に skip-disabled を持たせるのはスコープ拡大なので、本 PR では「現状で APG 上許容」と判断し N 扱いに落としてもよい）。判断を ADR-004 か ADR-006 に一行残すと親切。

#### [W-002] ＋chip トリガーに可視ラベル「タグを追加」と同一文言の `aria-label="タグを追加"` が二重付与されており、冗長（可視テキストがアクセシブルネームを提供するため `aria-label` 不要）

場所: `app/components/public/PublicTopControls.tsx:712-725`

理由:
トリガー `<button>` は子に可視テキスト「タグを追加」を持つため、アクセシブルネームは可視テキストから供給される。そこへ同一文言の `aria-label="タグを追加"` を重ねると、(1) 冗長、(2) 将来ラベル文言を変えたとき可視と aria が乖離する保守リスク、が生じる。auth 側 `TagPickerPopover` が `aria-label`/`title` を付けるのは**可視テキストが「タグ」だけでアイコンの意味が伝わりにくい**ケースの補完だが、こちらは可視テキストが既に完全な名前なので状況が異なる。

提案: トリガーの `aria-label="タグを追加"` を削除する（可視テキストで十分）。`Popover` の `label="タグを追加"` はパネル側のアクセシブルネームなので別物・残してよい。

### Notes

#### [N-001] `restoreFocusOnCommit` で cap 抑止により option 集合が縮まないか確認（本 PR は縮まないので問題なし、記録のみ）

場所: `useRovingMenu.ts:107-121`, `PublicTopControls.tsx:696`

`restoreFocusOnCommit` のクランプは「commit で option 数が減ったとき」を想定するが、本 ＋chip の母集合 `allTags` は loader dep 非依存で URL 変化に対し**不変**（option 数は変わらず、disabled 切替のみ）。よって `items.length` は安定し、クランプは発火しない。auth 由来の安全弁がそのまま効くだけで実害なし。記録のみ。

#### [N-002] `Plus` を lucide から、mock は inline `<svg>`。レンダリング結果は同等

mock 571 行は `stroke-linecap="round"` の素の SVG、実装は lucide `Plus`（既定で `stroke-linecap="round"`、`strokeWidth={2.2}` を明示）。視覚的に一致。`size-[11px] shrink-0` で 11px 固定＋chip 内の縮みも防げており良い。問題なし。

#### [N-003] `TAG_ADD_PANEL` の左アンカー（ADR-007）と `max-h-[min(60vh,400px)] overflow-y-auto` は auth `TagPickerPopover` のパネル chrome（FilterBar.tsx:506）と同寸法で一貫

母集合 cap=1000 規模でもスクロールに収まる。モバイルは sort panel と同じ bottom-sheet 化。スタイリング規約（utility-first・`data-[active]:`・`aria-disabled:` バリアント）順守。新規ハンドCSS無し。問題なし。

#### [N-004] option の選択表示が `aria-selected`＋`data-active`＋末尾「✓」の三重表現

`aria-selected={active}`（a11y）, `data-active`（`bg-surface`/`font-medium`）, 「✓」（視覚）の三層は auth `TagPickerPopover`（FilterBar.tsx:536-556）と同形でブレなし。chips 行の `data-active={active || undefined}`（ADR-003 の falsy 消去）と異なり option は `aria-selected={active}` を常時出すが、これは listbox option の正しい慣習（選択状態は false でも明示すべき）。意図的で妥当。

#### [N-005] `roving.setActiveIndex(index)` を click 内で disabled 判定の**前**に呼んでいる

`PublicTopControls.tsx:744-748`。disabled option をクリックしてもロービング index は更新されるが onToggle は走らない。auth と同じ「クリック位置にロービングを同期」する作法を踏襲しており、disabled option にマウスで触れてもインデックスだけ追従するのは自然。問題なし。

## 補足分析: 楽観更新フローの健全性

`run(action, patch)` は `applyOptimistic`（即時 state 反映）→ `await router.navigate`（loader 再フェッチ）を1 transition でラップし、navigate を transition 内で await することで `useOptimistic` が baseline へ snap back する前に新 props が commit される設計（PublicTopControls.tsx:234-256）。＋chip の `toggleTag` はこの既存フローへ素直に合流しており、二重ソース・状態不整合は生じない。cap=8 到達時に9件目が `nextFilterSearch` に渡らないことで `tags.max(8)` の `.catch(undefined)` 全消失（route schema 38行 / server-fn 53行）が構造的に回避される。AC-5 のサイレント全消失防止は UI 側で正しく閉じている。
