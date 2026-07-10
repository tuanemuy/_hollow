# Review 002 (2周目フルレビュー) — Frontend / React / RSC / 再レンダー / Styling / A11y（PR #828 / Issue #824）

**対象:** `app/components/layout/{EditorTitleContext,HeaderCenter,AppShellDrawer,Header}.tsx`, `styles.ts`, `app/components/note/editor/{NoteEditor,useEditorTitleSync}.ts(x)`
**視点:** Frontend / React 設計・RSC 境界・再レンダー churn・スタイル/a11y/レスポンシブ・mock 準拠
**レビュー日:** 2026-07-10（プロダクションコードは1周目から不変。フレッシュな目でゼロベース再走査）

## 総評

ゼロベースで実コード・ランタイム React ツリー・RSC 境界・CSS を再走査した。ADR-001〜006 の設計意図が忠実かつ最小侵襲に実装されており、churn 封じ込め（value/setter 分離＋children-as-prop bailout）、RSC payload 内 client island の context consume、effect の push/cleanup 分割、grid truncation の二段 `min-w-0`、mock `.header-doc` 完全準拠、a11y（`aria-hidden` + display:none による検索置換）がいずれも正しく成立している。**Blocker/Warning ともにゼロ。** 1周目で挙がった唯一の Warning（共有中央 grid アイテムへの `min-w-0` 追加）は ADR-004 の AC-5 caveat 補足（adr.md L103）で明示的に取り込み済みで、未解決事項ではない。

## Frontend / Styling / A11y

### Blockers

なし。

### Warnings

なし。（1周目 Frontend W-001 は adr.md ADR-004 の「AC-5 の caveat 補足」に明文化され resolved。下記 N-002 参照）

### Notes

- **[N-001]** churn 封じ込めが二重に load-bearing で成立（設計の要、再確認）。`EditorTitleProvider`（`EditorTitleContext.tsx:43-52`）は自 `useState` を持ち `setTitle` で自身が再レンダーするが、`{header}`＋`<main>{children}</main>` を `AppShellDrawer.tsx:193-217` で生成し **`children` prop として透過**（provider 本体で inline しない）ため、自 state 再レンダーで `children` element 参照が変わらず React が subtree をスキップする（ADR-006 の "children as prop" bailout）。加えて value/setter を別 context に分離し（setter provider を外・value provider を内にネスト、`EditorTitleContext.tsx:46-50`）、`NoteEditor` は `useEditorTitleSync` → `useSetEditorTitle`（setter のみ）を購読するのでキーストロークごとの value churn が本体へ伝播しない。churn を read するのは `HeaderCenter`（1 島）のみ。`AppShellDrawer.tsx:188-192` に不変条件コメントが残り将来の inline 化回帰の防波堤になっている。ADR-003/006 どおり。

- **[N-002]** 1周目 W-001（`HeaderCenter.tsx:30` の `${SEARCH_BOX_WRAPPER} min-w-0` が全 `/_app` の中央 grid トラック最小値を `auto`→`0` に変える）は resolved。ADR-004 Consequences の「AC-5 の caveat 補足（round-1 review Frontend W-001）」（adr.md L103）が、この差分は overflow 抑制方向の改善で視覚・挙動不変であること、`/`・`/settings` で回帰確認済みであることを明記して取り込んでいる。ADR-004 が要求する編集画面 truncation にも必須。コード変更不要。再指摘しない。

- **[N-003]** RSC 境界の構成が既存実証パターンと完全同型で正しい。`Header`（server、`_app/route.tsx` で `renderServerComponent` により RSC payload 化）が server の検索 `<form>` を client island `HeaderCenter`（`Header.tsx:29-47`）へ `children` として透過し、`HeaderCenter` は `EditorTitleValueCtx` を consume する。`MenuButton`×`DrawerCtx` と同じ「RSC payload 内 client island が親 client provider の context を購読」構図で、ランタイム client ツリー上は provider の子孫。検索 input は server-render のまま維持され（AC-5）、title の read だけが client 化される最小島。RSC 境界を跨がない。

- **[N-004]** `useEditorTitleSync`（`useEditorTitleSync.ts:17-23`）の effect 分割が正しく取りこぼしなし。push を deps `[title, setHeaderTitle]`（cleanup なし）、unmount クリアを deps `[setHeaderTitle]` の cleanup-only effect に分離しているため、打鍵ごとの null フラッシュが起きない（単一 effect の cleanup で null 化すると打鍵ごとに null→title 往復が生じる）。`setHeaderTitle` は `useState` setter で参照安定ゆえ cleanup-only effect は mount 1 回登録・unmount 1 回発火。呼び出し `useEditorTitleSync(state.title)` は `NoteEditor.tsx:221` にあり、コンポーネント唯一の `return` は L443。L117〜221 間に component-level 早期 return は無く（awk 走査で確認）Rules of Hooks 準拠。AC-1（mount 時 initialTitle 即 push）／AC-6（unmount で null）を満たす。

- **[N-005]** 遷移時の unmount/mount ordering に null 取りこぼしなし。編集→編集（別 note）や編集→他ページで、React は旧 subtree の effect cleanup（→null）を先、新 subtree の setup（→新 title、非編集なら push なし）を後に走らせるため最終状態は常に「新 title または null」。header は `loadAppShell` がキャッシュする永続要素なので、この unmount クリアが AC-6 リーク防止として必須かつ効いている。

- **[N-006]** mock `.header-doc`（`spec/design/pages/mobile/P12-editor.html` L227-236, 要素 L1045）と `HEADER_DOC = "sm:hidden truncate text-sm font-medium text-ink min-w-0"`（`styles.ts:47-48`）を実値照合し完全一致を再確認: `truncate` = overflow-hidden + text-ellipsis + whitespace-nowrap（mock 3 プロパティ）／`text-sm`→`--text-sm`＝mock `font-size:var(--text-sm)`／`font-medium`→`--weight-medium`(500)＝mock `font-weight:var(--weight-medium)`／`text-ink`→`--color-ink`＝mock `color:var(--color-ink)`／`min-w-0`＝mock `min-width:0`。`text-center` は持ち込まず、mock の text-align 無指定（左寄せ）に準拠（AC-7）。逸脱なし。

- **[N-007]** `min-w-0` の二段配置（ADR-004）が正しく成立。中央 grid アイテムである `HeaderCenter` root に `min-w-0`（`HeaderCenter.tsx:30`）、descendant の `.header-doc` に `min-w-0`（`HEADER_DOC`）。`APP_HEADER` の中央 `1fr`=`minmax(auto,1fr)` の auto 最小をアイテム側 `min-w-0` で 0 に解放し、内側で ellipsize させる定石。片方だけだと長文がヘッダーを押し広げる暗黙依存だが両方存在（AC-2）。検索アイコン `SEARCH_BOX_ICON`（`absolute left-[11px]`）の containing block は `relative` を持つ root（`SEARCH_BOX_WRAPPER`）で、間に挟まる `data-[doc]:max-sm:hidden` の静的 wrapper（非 positioned・全幅）を跨いでもアイコン基準・input 左端は不変（`HeaderCenter.tsx:36-41`）。

- **[N-008]** a11y（AC-3）成立。`.header-doc` は `aria-hidden="true"` の装飾要素（`HeaderCenter.tsx:32`）。読み上げ対象のエディタ本体 `<input id="note-editor-title">` は sr-only `<label>「タイトル」`（`NoteEditor.tsx:496-505`）を持ち `aria-hidden` なし。二重読み上げは発生しない。検索置換は `data-[doc]:max-sm:hidden`（display:none）で行うため、モバイル編集中は検索 input がタブ順・a11y ツリーから外れフォーカスの綻びなし（ADR-002 が (iii) オーバーレイでなく (ii) display:none を採った狙いどおり）。

- **[N-009]** レスポンシブの breakpoint 境界が意図どおり相補的（640 境）: header-doc `sm:hidden`（≥640 非表示）／検索ラッパー `data-[doc]:max-sm:hidden`（title 有りかつ <640 で非表示）。desktop=title 非表示・検索表示（AC-4）／mobile 編集(title 有)=title 表示・検索 display:none（AC-8 検索置換）／mobile 非編集(title=null)=header-doc 未レンダー・検索表示（AC-5/6）。`data-doc={hasTitle || undefined}`（`HeaderCenter.tsx:37`）は「属性を消費する要素自身に付与」規約（#818 ADR-004）に一致し `group-data-*`（未使用）を導入しない。`--breakpoint-*` の二重定義（`tokens.css`/`index.css`）には一切触れず既存 `sm:`/`max-sm:` バリアントのみ使用。CLAUDE.md styling 規約（utility-first / handwritten CSS・`@apply` 追加なし / `.note-detail-content` 例外不接触 / breakpoint 非接触）すべて準拠。

- **[N-010]** `hasTitle` 判定（`HeaderCenter.tsx:28`、`title !== null && title.trim() !== ""`）は空文字・空白のみを「タイトルなし」に落とす（新規ノート未入力＝検索 fallback、AC-1/AC-8）。表示は untrimmed `{title}` だが `.header-doc` は `truncate`(nowrap) で先頭/末尾空白が視覚に出ず実害なし。setter default `() => {}`（`EditorTitleContext.tsx:26-28`）と value default `null` により、provider 不在時（`AppShell.tsx` 旧シェル復活など）も search-only へ安全に degrade。

- **[N-011]** desktop 編集画面でも `useEditorTitleSync` は打鍵ごとに title を push し `HeaderCenter` が再レンダーするが、`.header-doc` は `sm:hidden` で非表示・churn は `HeaderCenter`（1 島）に限定され検索 `children`（server RSC payload、安定参照）は再 reconcile されない。CSS-only（ルート/viewport JS 判定なし）方針の必然的トレードオフで許容範囲。AC-4 成立。テスト 3 本（`EditorTitleContext.test.tsx` / `HeaderCenter.test.tsx` / `useEditorTitleSync.test.tsx`）が setter 安定性・value 伝播・title/検索トグル・whitespace・mount/change/unmount をカバーし、`NoteEditor` フル mount 不要（ADR-005 の狙いどおり）。
