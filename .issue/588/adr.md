# ADR — Issue #588: モバイルモック(#536)の実装追従 ② 画面別レイアウト

## ADR-001: 下部固定CTAバー(`BottomActionBar`)の配置レイヤー

### Status
Proposed

### Context
#587 が提供した `BottomActionBar` frame（fixed/safe-area/blur/`lg:hidden`/z-40）に、各画面が CTA 内容を差し込む。配置を (a) アプリレイアウト共通（全 app-shell 画面の下端に出し CTA を文脈で出し分け）にするか、(b) P10 限定で配置するか、の選択がある。モック上 `.cta-bar` を明示しているのは `mobile/P10-home.html` のみ。

### Decision
**(b) P10 限定で配置**する。`BottomActionBar` frame は #587 が分離提供済みなので、P10（ノート一覧/ホーム）で frame を呼び出し新規作成+アップロードCTAを差し込む。Header の同CTAは `max-lg:hidden`／`lg:` 表示でモバイル時のみ退避。他 app-shell 画面（P11/P12/P14 等）はモックに `.cta-bar` がないため配置しない。

### Consequences
- 良い点: モック(SSOT)に逐語追従。frame/content 分離（#587 ADR-006 の意図）を尊重しつつ、CTA を出す画面を最小限に絞れる。
- トレードオフ: 将来他画面にも下部CTAが必要になれば各画面で frame を呼ぶ追加配線が要る。ただし frame は再利用可能なので追加コストは小さい。

### Implementation notes (Step 1 で具体化)
- **配置位置:** P10 の root は server component の `NoteList.tsx` で、cta-bar/bulk-bar 排他には `useSelection`（client）が要る。そこで新規 client component `note/list/BottomCtaBar.tsx` を作り、`NoteList` の `<SelectionProvider>` 内（`BulkActionBar` の直後）に配置した。`BottomCtaBar` が `BottomActionBar` frame を呼び CTA を差し込む。
- **Header / NoteListToolbar の退避:** `Header.tsx` の新規作成/アップロードに `max-lg:hidden` を付与（`lg:` でのみ inline 表示）。`NoteListToolbar.tsx` も同じ2つの CTA を持っていた（plan のリスク「CTA二重表示」）ため、こちらも `max-lg:hidden`。選択/ビューとして保存は list 固有なので残置。
- **CTA 寸法:** モック `.cta-bar .pill-btn` は `flex:1; height:48px` → `flex-1 justify-center h-12`（h-12=48px はトークンスケール上の値）。`.cta-upload` は `width:52px; padding:0` だが 52px はスケール上のステップが無いため、48px 正方（`h-12 w-12 px-0`）へ写した（44px タッチ床も満たす）。定数 `CTA_BAR_PRIMARY`/`CTA_BAR_UPLOAD` を `layout/styles.ts` に追加。

---

## ADR-002: BulkActionBar の `sticky`→`fixed` 切替方式

### Status
Proposed

### Context
現状 `BULK_BAR` は `sticky bottom-4` の中央ピル（desktop で機能）。モック `mobile/P10-home.html` の `.bulk-bar` は狭幅で `position:fixed; inset-x:0; bottom:0; z-index:45` のフルワイドバー。desktop 挙動を壊さず狭幅だけシート化する必要がある。

### Decision
**`max-sm:` variant のみで切替**え、`sm:` 以上は現状の sticky 中央ピルを維持する（`max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-45` を付与）。JS によるビューポート判定・ランタイム分岐は導入しない（CLAUDE.md「responsive は CSS variant で」方針）。z=45 は cta-bar(z=40) より上だが、選択0件時のみ cta-bar、選択中のみ bulk-bar という排他表示のため積層衝突は実害なし。

### Consequences
- 良い点: desktop 非回帰が CSS だけで保証される。ランタイム分岐ゼロでテストが軽い。
- トレードオフ: cta-bar と bulk-bar の排他表示を SelectionContext の選択件数で正しく出し分ける配線が必要。

### Implementation notes (Step 1 で具体化)
- **排他表示の配線:** SelectionContext の `state.ids.size` を唯一の真実とした。
  - `BottomCtaBar`（cta-bar）: `state.ids.size > 0` で `return null`（=選択中は描画ごと消す）。frame は元々 `lg:hidden` なので影響は mobile のみ。
  - `BulkActionBar`（bulk-bar）: `<section>` に `data-selected={hasSelection || undefined}` を付与。`BULK_BAR` を「`sm:` は従来の sticky 中央ピル維持」「`max-sm:` は `not-data-[selected]:hidden` で未選択時は mobile で非表示 + `data-selected` 時に `fixed inset-x-0 bottom-0 z-45 rounded-t-lg` フルワイドシート」に再構成。
  - 結果、mobile では「選択0件 → cta-bar(z40) のみ」「選択1件以上 → bulk-bar(z45) のみ」が CSS だけで成立。bulk-bar は選択モード全期間マウントのまま（安定アンカー、#354 ADR-005）で、見た目だけ排他。
- **次工程への影響:** mobile の bottom floor は `state.ids.size` で cta-bar↔bulk-bar が切り替わる。他画面で下部固定 UI を足す場合はこの z40/z45 と排他規約を踏襲すること。
- **寸法:** モック `.bulk-bar { padding:10px var(--space-4); border-radius: lg lg 0 0 }` → `max-sm:px-4 max-sm:py-2.5 max-sm:rounded-t-lg` + safe-area `pb-[calc(10px+env(safe-area-inset-bottom))]`。`.bulk-action { height:44px }`（mobile タッチ床）→ `max-sm:min-h-[44px]`。`.bulk-actions` の横スクロール+スクロールバー非表示は共有定数 `scrollbarHidden`（`note/list/styles.ts`）。

---

## ADR-003: FilterBar Popover の `clampToViewport` 狭幅無効化

### Status
Proposed

### Context
#587 は `popoverSheetPanel`（狭幅フルワイドシート用 panel 定数）を提供したが未消費（dead constant）。FilterBar の `FILTER_POPOVER_PANEL`（`w-[280px]` 固定の浮きカード）を狭幅でフルワイドシート化する際、`usePopover` の `clampToViewport`（shiftX による横位置補正）はフルワイド時に不要かつ干渉する。#587 は JSDoc で「実分岐は #588 の FilterBar 側で本定数へ寄せる際に行う」と引き渡した。

### Decision
**FilterBar 側で `popoverSheetPanel` を当てつつ、狭幅では `clampToViewport`（shiftX）を無効化**する。Popover primitive 自体の変更は最小に留め、フルワイド適用時に clamp を切るための分岐は FilterBar の consumer 側（または Popover に最小限の prop 追加）で吸収する。具体方式は実装時に Popover の現行 API を確認して確定する。

### Consequences
- 良い点: #587 の引き渡し方針に沿う。Popover primitive の汎用性を保つ。
- トレードオフ: FilterBar の Popover 呼び出し箇所に狭幅分岐が入る。`popoverSheetPanel` への寄せで `FILTER_POPOVER_PANEL` の独自定義が一部不要になる可能性があり、その整理範囲を実装時に見極める。

### Implementation notes (Step 1 で具体化)
- **clamp 無効化の方式:** Popover に新 prop を足す案も検討したが、consumer 側は viewport 幅を知るのに結局 JS 分岐が要る。そこで `usePopover` の clamp `useLayoutEffect` 内に「`window.innerWidth < POPOVER_SHEET_BREAKPOINT(=640)` なら shiftX を 0 のまま return」を1行追加した。これは**新規のレスポンシブ・ランタイム分岐の導入ではなく、既存の JS 計測（clamp 自体が元から layout effect）を狭幅でゲートしただけ**で、ADR-003 の明示的許可範囲。`POPOVER_SHEET_BREAKPOINT` は `--bp-sm`/`--breakpoint-sm`(640px) と意図的に重複する第3の複製（CLAUDE.md のブレークポイント複製方針に準拠、JSDoc で同期注意を明記）。Popover/Popover の公開 API は無変更。
- **`FILTER_POPOVER_PANEL` の寄せ:** `absolute left-0 top-full mt-2 z-40 ${popoverSheetPanel} sm:w-[280px] sm:max-w-[calc(100vw-2rem)]` に再定義。狭幅は共有定数の `max-sm:left-0 max-sm:right-0 max-sm:w-auto` でフルワイド化、`sm:` 以上は従来の 280px 浮きカード（`w-[280px]` を `sm:w-[280px]` へ移しただけ）を維持。chrome（border/bg/shadow）は共有定数に集約され、独自定義からは除去。
- **filter-bar 本体:** 共有定数 `filterBar`（`note/list/styles.ts`）に集約。`sm:` 以上は従来の `flex-wrap` クラウド、`max-sm:` は `flex-nowrap overflow-x-auto` + `scrollbarHidden` の横スクロール1行（モック `.filter-bar`）。`min-w-0` で grid main 列内に収め内部スクロールを隔離（overflow=0）。
