# ADR — Issue #824: P12 編集中のヘッダー簡略タイトル（モバイル orientation）

## ADR-001: タイトル伝播は client context で行い、portal は採らない

### Status
Proposed

### Context
共有ヘッダー（`AppShellDrawer` が RSC payload として受け取る `Header`）と、深くネストした `NoteEditor`（`main` の children）は疎結合で、per-route の title スロットを持たない。編集中のタイトルをヘッダー中央へ表示するには両者を跨ぐ配管が要る。#818 ADR-001 が提示した選択肢:

- (a) header と editor children を跨ぐ client context provider を新設し、editor が `title` を push、header が slot で consume する。
- (b) header に portal ターゲット（DOM ノード + ref）を設け、editor から `createPortal` で title を注入する。

既存コードには (a) の実証がある: `AppShellDrawer` の `DrawerCtx` を、RSC header payload 内の client island `MenuButton` が `useDrawer()` で consume している（`AppShellDrawer.tsx` / `MenuButton.tsx`）。context 伝播はバンドル境界ではなくランタイム React ツリーの関心事なので、client provider の子孫にある client component は、間に server component が挟まっても context を購読できる。`NoteEditor` は `renderServerComponent` 経由で RSC payload 化されるが実体は `"use client"` であり、client ツリー上は provider の子孫となる。

### Decision
(a) client context を採用する。`EditorTitleProvider` を `AppShellDrawer`（既に client、header と children を両方レンダーする唯一の位置）に mount し、`NoteEditor` が `useSetEditorTitle` で push、`HeaderCenter` が `useEditorTitle` で read する。既存 `DrawerCtx` + `MenuButton` と完全に同型。

(b) portal を採らない理由:
- portal ターゲット DOM が editor mount 時に存在している必要があり、ref のタイミング依存が生じる（宣言的でない）。
- header は RSC payload で、その内部 DOM への ref を editor 側へ渡す経路が context より複雑になる。
- プロジェクトに portal 常設ターゲットの前例がなく、context 常設パターン（`DrawerCtx`）の前例はある。SSOT/規約整合で context が勝る。

### Consequences
- 良い点: 既存パターンに一致。RSC 境界を跨がず、ref タイミング問題なし。SSR は title=null で描画されハイドレーション不整合を起こさない。
- トレードオフ: title をキーストロックごとに context へ push するため consumer（`HeaderCenter`）が毎回再レンダーする（軽量なので許容。ADR-003 で producer 側の波及を遮断）。

---

## ADR-002: モバイル編集中はタイトルが検索を置換する — server 検索を children 透過して実現

### Status
Proposed

### Context
mobile mock 群を調査すると、`.header-doc`（簡略タイトル）を持つのは P12-editor **のみ**で、かつ P12-editor **のみ**がヘッダー中央に検索ボックスを持たない。他 mobile ページ（P10/P11/P13…）は全て検索ボックス。→ 設計意図は「モバイル編集中はタイトルが検索を置き換える／デスクトップは全ページ検索のまま」。

現行 `Header`（server component）は中央列に検索フォームを server-render する。title の有無（client state）で検索を出し分ける必要があるが、実装方式に幅がある:

- (i) 中央列全体を client component 化し、検索 input も client で描画する。
- (ii) 検索フォームは server-render のまま、薄い client island `HeaderCenter` に **children として透過**させ、island は title 表示と `data-*` トグルのみ担う。
- (iii) title を絶対配置オーバーレイで検索の上に被せる。

### Decision
(ii) を採用する。`HeaderCenter`（client island）が `children`（server の検索 `<form>`）を受け取り、`hasTitle` のとき `.header-doc`（`sm:hidden`、`aria-hidden="true"`、`truncate`）を描画し、検索ラッパーには `data-doc={hasTitle || undefined}` + `data-[doc]:max-sm:hidden` を付ける。ルート文字列判定は行わず、title の有無のみをスイッチにする。

- (i) を採らない: 検索 input が client 化され SSR 構造が変わる。「他ページに影響を出さない」観点で不要に侵襲的。
- (iii) を採らない: オーバーレイ下の検索 input がタブフォーカス可能なまま残り a11y/フォーカスの綻びを生む。CSS で片方を flow から外す (ii) が素直。

`data-doc` は「`data-[…]:` バリアントを消費する要素自身に属性を置く」規約（#818 ADR-004）に従い検索ラッパー自身へ付与し、`group-data-*`（プロジェクト未使用）は導入しない。

### Consequences
- 良い点: 検索は server-render のまま（SSR/他ページ不変、AC-5）。title=null なら従来と同一 DOM。純 CSS の breakpoint で mobile 限定・検索置換を保証し、ルート結合を持たない。
- トレードオフ: `HeaderCenter` という client island が 1 つ増える（`MenuButton` と同格の薄さ）。新規ノートの空タイトル時は検索が出たまま（progressive、plan のリスク項参照）。

---

## ADR-003: value / setter の context を分離してエディタ本体の再レンダー churn を防ぐ

### Status
Proposed

### Context
タイトルは編集中キーストロークごとに変化する。単一 context に `{ title, setTitle }` を束ねると、value 変化のたびに provider 値が変わり、`useContext` する全 consumer（producer である `NoteEditor` を含む）が再レンダーしうる。`NoteEditor` は TipTap エディタや FrontMatter など重い子を抱えるため、タイトル入力で本体ツリーを再レンダーさせたくない。

### Decision
context を 2 つに分離する:
- `EditorTitleValueCtx: string | null` — 変化する値。read するのは軽量な `HeaderCenter` のみ。
- `EditorTitleSetterCtx: (t: string | null) => void` — `useState` の setter そのまま（参照安定・不変）。`NoteEditor` はこちらのみ purchase する。

`NoteEditor` は setter context だけを購読するので、**value（title）が変わっても `NoteEditor` の context 購読は発火しない**。push は `useEffect([state.title, setTitle])` で行う。

**注意（不変条件の正確化）**: `NoteEditor` はタイトル input を controlled（`value={state.title}`、`onChange` で自 reducer を dispatch、`NoteEditor.tsx` L497-500）で持つため、**キーストロークごとに自身の reducer state で再レンダーする**。これは context 分離の有無と無関係に発生する。したがって「エディタ本体がタイトル入力で再レンダーしない」わけではない。value/setter 分離が実際に防ぐのは、次の 2 点である:
- (a) `NoteEditor` の context 購読を**安定 setter のみに限定**し、キーストロークごとの **context value churn を `NoteEditor` に伝播させない**（value context の変化で `NoteEditor` の再レンダーが上乗せされない）。
- (b) setter 参照が安定するため、push の `useEffect` の再実行が **title 変化時のみ**に抑えられ、後続で value を必要とする consumer が増えても setter-only 購読者（`NoteEditor`）は巻き込まれない。

### Consequences
- 良い点: `NoteEditor` 本体の再レンダーは自 reducer 由来のみ（title 変化で不可避）に留まり、**context value churn は本体へ伝わらない**。value を read する再レンダーは `HeaderCenter`（1 行の軽量 island）に限定される。
- トレードオフ: context が 1 つ増える（provider は同一コンポーネントで 2 段ネスト）。値の debounce は導入しない（読み手が軽量で不要。必要になれば後日）。

なお、この churn 封じ込めが成立する前提として `EditorTitleProvider` は header+main ツリーを **`children` prop として受け取る**（"children as prop" 最適化）必要がある。詳細は ADR-006。

---

## ADR-004: `min-w-0` は中央 grid アイテム自身に置く（descendant だけでは truncate が効かない）

### Status
Proposed

### Context
`APP_HEADER` は `grid grid-cols-[auto_1fr_auto]`。CSS 仕様上 `1fr` は `minmax(auto, 1fr)` であり、中央トラックの最小サイズは**中央 grid アイテムの min-content**で決まる（`minmax(0,1fr)` ではないので content 以下に縮まない）。mock では `.header-doc` が**直接の grid 子**で、そこに `min-width:0`（+ nowrap/ellipsis）が置かれ truncate が成立している（`P12-editor.html` L234）。

本 plan は方式(ii)（ADR-002）に伴い `.header-doc` を `HeaderCenter` root（＝移設した `SEARCH_BOX_WRAPPER` ラッパー）の**一段内側**にネストする。この結果、中央 grid アイテムは `HeaderCenter` root であり、`.header-doc` は grid アイテムでなくなる。`.header-doc` にだけ `min-width:0` を置いても、その要素が**親（grid アイテム）へ寄与する min-content は nowrap テキスト全幅のまま**で、中央トラックが伸びてヘッダーを押し広げる（AC-2 違反）。既存の検索 `<input>` が `min-w-0` 無しで破綻しないのは min-content が `max-w-[460px]` で有界だからで、無限長の nowrap タイトルには当てはまらない。

### Decision
`min-w-0` を **中央 grid アイテム自身（`HeaderCenter` root）** に付与する。加えて `.header-doc`（`HEADER_DOC`）側にも `min-w-0` + `truncate` を残す。**外（grid アイテム）で最小幅を 0 に解放し、内（`.header-doc`）で ellipsis させる**のが定石で、両方必要。

代替案 `grid-cols` を `minmax(0,1fr)` に変える案は、`APP_HEADER` が全 `/_app` 共有 grid のため他要素への波及があり不採用。アイテムへの `min-w-0` の方が局所的で安全。

### Consequences
- 良い点: 長文タイトルでも中央トラックが伸びず、末尾 ellipsis になる（AC-2）。mock の truncate 挙動を一段ネストした構造でも忠実に再現。
- トレードオフ: `min-w-0` を 2 箇所（root と `.header-doc`）に置く必要があり、片方だけだと破綻する暗黙依存。plan・AC-2 の検証手順（長文入力の目視）で担保する。

---

## ADR-005: title の push/クリーンアップを薄い harness に切り出す

### Status
Proposed

### Context
`NoteEditor` は `useServerFn` を 7 本・`useAutosave`/`useEditLock` を束ねる巨大 client コンポーネント。`useSetEditorTitle` による title push（`state.title` 変化で最新値、unmount で null）を本体に直書きすると、重い依存に orientation 用配管が混ざり、テストも `NoteEditor` フル mount（TipTap/server-fn/jsdom）を要して脆くなる。

### Decision
push/クリーンアップを薄い専用 harness（`useEditorTitleSync(title: string | null)` hook、または effect 専用の子コンポーネント）に切り出す。`NoteEditor` からは `useEditorTitleSync(state.title);` の 1 行呼び出しにする。harness が `useSetEditorTitle` を read し、`useEffect([title, setTitle])` で push、cleanup で null 化する。

### Consequences
- 良い点: `NoteEditor` 本体への結合を最小化。AC-1（edit 初期表示・new 入力）/AC-6（unmount クリア）の検証を harness 単体で駆動でき、フル mount 不要で壊れにくい。
- トレードオフ: ファイル/抽象が 1 つ増える（薄い hook なので許容）。切り出しは推奨であり必須ではない（本体直書きでも機能自体は成立する）。

---

## ADR-006: `EditorTitleProvider` は header+main ツリーを `children` prop として受け取る（"children as prop" 最適化）

### Status
Proposed

### Context
`EditorTitleProvider` は自前の `useState<string | null>` を持ち、`setTitle`（キーストロークごとに呼ばれる）で**自身が再レンダーする**。provider の内側には `{header}`（RSC payload、検索を含む）と `<main>{children}</main>`（`Outlet` → `NoteEditor` を含む全 `/_app` ツリー）という巨大サブツリーがぶら下がる。ADR-003 は「value/setter 分離で `NoteEditor` への context value churn を断つ」ことを担保するが、**provider 自身の再レンダーが下流ツリー全体を再 reconcile する経路**は別途封じる必要がある。この封じ込めが成立するかは、provider がサブツリーを **どう受け取るか**に依存する。

### Decision
`{header}` と `<main>{children}</main>` を包む element は、`AppShellDrawer` の render で生成し、`EditorTitleProvider` へ **`children` prop として渡す**（provider 本体で `{header}`/`{children}` を JSX inline に描かない）。

- provider が `children` prop を透過するだけなら、`setTitle` による自 state 再レンダーでも `children` の element 参照は変わらず、React は該当 subtree の再 reconcile を**スキップ**する（canonical な "children as prop" bailout）。
- 逆に provider 本体で `<>{header}<main>{children}</main></>` のように inline 描画すると、provider が再レンダーするたびにこれらの element が新規生成され、**全 `/_app` ツリーが打鍵ごとに再 reconcile される**（AC-5 の非影響を打鍵中に破る回帰）。

plan step2 は「`DrawerCtx.Provider` の内側の既存 return 全体を（安定した children として）ラップする」と正しい構造を指示している。本 ADR はその構造が**なぜ load-bearing か**を不変条件として固定する。

### Consequences
- 良い点: provider の自 state 再レンダーが下流に波及せず、churn は value を read する `HeaderCenter`（1 行 island）に限定される。ADR-003 の分離と合わせて二重に封じ込まれる。
- トレードオフ: 「children 渡しでなければならない」という暗黙依存が生まれる。将来のリファクタで provider 内へツリーを inline 化すると静かに全ツリー再レンダー回帰を招くため、ADR-006 / plan step2 の不変条件コメントで明示する。

---
