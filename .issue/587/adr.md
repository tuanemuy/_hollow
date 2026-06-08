# ADR — Issue #587: モバイルモック(#536)の実装追従 ① 共通基盤

## ADR-001: Dialog のシート化を responsive variant で表現する（data-* やJS判定を使わない）

### Status
Proposed

### Context
狭幅でダイアログをボトムシート化し、`sm` 以上では従来の中央モーダルに戻す必要がある。表現方法として (a) JS でビューポート幅を判定して `data-*` 属性で切り替える、(b) Tailwind の `max-sm:`/`sm:` responsive variant を `dialogBackdrop`/`dialog` 定数に埋め込む、の2案がある。

### Decision
(b) responsive variant を採用する。シート/中央モーダルの分岐は**ビューポート幅で決まる静的な見た目**であり、ランタイム state ではない。CLAUDE.md styling 規約「条件付き class 文字列を避け variant で表現」に合致し、JS でのモバイル判定を足さないため SSR/hydration の揺れも生じない。`data-*` は動的な開閉 state（drawer の `data-[open]`）にのみ使う。

### Consequences
- 良い点: hydration mismatch なし。JS なしで CSS のみで分岐。既存の Dialog ロジック（focus trap/scroll lock）に手を入れない。
- トレードオフ: `dialog`/`dialogBackdrop` 定数に `max-sm:`/`sm:` の両側 utility が増え、文字列がやや長くなる。

---

## ADR-002: grabber を Dialog.tsx の aria-hidden 装飾 span として描画する

### Status
Proposed

### Context
モックのボトムシートは上部に grabber（つまみ、`::before` 36×4px）を持つ。実装方法は (a) `dialog` 定数に `before:` utility で擬似要素として表現、(b) `Dialog.tsx` に実 DOM の装飾要素を追加、の2案。

### Decision
(b) `Dialog.tsx` の panel **純粋な先頭（close button より前）** に `max-sm:` でのみ表示する `aria-hidden` の非 focusable span を1つ追加する。`before:content-[''] before:w-9 before:h-1 …` を `dialog` 定数へ足すと定数が長大化し可読性が落ちる。実 DOM span のほうが「装飾要素は `aria-hidden`」という意図が明示的で、focus trap の focusable selector（`INITIAL_FOCUS_SELECTOR`/`FOCUSABLE_SELECTOR`）に span は掛からないため a11y に無影響。close button より前に固定することで、既存 `Dialog.test.tsx` が前提とする `focusables[0] === closeBtn` が維持される。grabber の下マージン（`max-sm:mb-4`、モック `margin:0 auto var(--space-4)` 準拠）と、各 consumer の先頭見出し（ConfirmDialog の見出し行・`dialogTitle` の `mb-4`）が二重マージンにならないか agent-browser で目視確認する。

### Consequences
- 良い点: 可読性が高く、a11y 上の意図が明示的。grabber は `max-sm:block sm:hidden` で狭幅のみ表示。`focusables[0]` 不変でテスト退行なし。
- トレードオフ: Dialog の JSX に DOM が1つ増える。`role="alertdialog"`（ConfirmDialog）でも先頭に grabber が出るが、モックの common-confirm-dialog もシート+grabber なので整合。先頭余白の二重化は目視確認が必要。

---

## ADR-003: ボトムシートの max-height はモック逐語追従で 100% を使う（100dvh を使わない）

### Status
Accepted

### Context
ボトムシートの高さ上限をどう表現するか。当初 `max-h-[calc(100dvh-var(--space-8))]` を検討したが、モック実体（`P10-move-note-dialog.html` / `common-confirm-dialog.html`）は一貫して `max-height: calc(100% - var(--space-8))` を使う。`dvh` は一部古い WebKit で非対応という互換懸念もあった。

### Decision
`dvh` をやめ、モック通り `max-sm:max-h-[calc(100%-var(--space-8))]` を採用する。`dialogBackdrop` が `fixed inset-0` でビューポート高に等しいので、panel の `100%` はモックの `100%` と同義に解決される。これによりモック逐語追従になり、`dvh` の互換懸念・lightningcss minify 懸念がいずれも不要になる。`sm:max-h-[90vh]` は従来維持（desktop 無影響）。

### Consequences
- 良い点: モック逐語追従。`dvh` 互換・minify の懸念が消える。desktop は従来通り。
- トレードオフ: `100%` は親（backdrop）が `fixed inset-0` である前提に依存する（backdrop の構造を変えると壊れる）が、その前提は既存テスト `getBackdrop()` が担保している。

---

## ADR-004: safe-area の下パディングを arbitrary calc で max-sm 限定導入する（新規トークンは作らない）

### Status
Proposed

### Context
ボトムシート/下端固定要素（CTAバー含む）は iOS notch 機で `env(safe-area-inset-bottom)` を考慮しないと実用に耐えない。safe-area はデザイントークン化されておらず（`tokens.css` に無く、モックも生の `env()` を使用）、本来 #271 のスコープ。tokens.md 準拠（リテラルpx・新規トークンを避ける）との緊張がある。

### Decision
ボトムシートの基盤実装で下パディングを無視できないため、`max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]` の arbitrary calc を `max-sm:` 限定で導入する。新規トークンは作らず、`env()` は CSS 環境変数でありリテラルpx ではないため tokens.md の趣旨（マジックナンバー散乱の防止）には反しない。#271（safe-area 横展開）の土台を兼ねる。

### Consequences
- 良い点: ボトムシートが notch 機で実用に耐える。#271 が継承できる基盤になる。
- トレードオフ: arbitrary value が1つ増える。将来 safe-area をトークン化する場合は #271 で集約する。

---

## ADR-005: Popover フルワイド化は common primitive と共通定数の提供までをスコープとする

### Status
Proposed

### Context
Popover の狭幅フルワイドシート化が要件。実際にフルワイドになる Popover は `FilterBar` の `FILTER_POPOVER_PANEL`（`w-[280px]` 固定）等だが、これは domain-owned（`app/components/note/list/`）で #588 のスコープ。

### Decision
本Issue（共通基盤）は `common/styles.ts` に狭幅フルワイドを表現できる共通 panel 定数を新設し、`Popover.tsx`/`usePopover.ts` の JSDoc に狭幅シート方針を記載するまでをスコープとする。domain-owned の `FILTER_POPOVER_PANEL` の置換は #588 が共通定数を継承して行う。

### Consequences
- 良い点: スコープ境界が明確（共通基盤 vs 画面別）。#588 が共通定数を継承するだけで済み、ブロッカー責務を果たす。
- トレードオフ: 本Issue単体では Popover のフルワイド化が画面上で完結しない（#588 完了まで FilterBar は従来幅のまま）。本Issueでは新定数が dead constant（未消費）になるため、Biome の未使用 export 検知に引っかからないか確認する。

---

## ADR-006: 下部固定CTAバーは共通 frame（chrome）のみ提供し、CTA 内容の配置は #588 に引き渡す

### Status
Accepted

### Context
当初計画は下部固定CTAバーを「list系画面固有 = #588」として共通基盤スコープから外していた。しかし Issue 本文スコープ②は「下部固定 CTA など」を `layout/{Header,UserMenu,MenuButton}.tsx` の実装対象として明記し、受け入れ基準2は「下部固定 CTA が**共通コンポーネント側**で表現され、各画面が継承できる」と要求している。モック `P10-home.html` でもヘッダー CTA を下端 `.cta-bar`（`position:fixed`・safe-area・`--header-bg`/blur・`border-top`・z-index40）へ退避する構成が明記されている。一方で CTA の中身は画面ごとに異なる（P10=新規/アップロード、P11/P21=なし）。

### Decision
**frame（chrome）と内容を分離する**。本Issue（共通基盤）は `layout/` に再利用可能な下部固定CTAバーの枠（`BottomActionBar` コンポーネント + `BOTTOM_ACTION_BAR` 定数）を提供する。枠は `position:fixed`・safe-area 下パディング・`bg-[--header-bg]` + backdrop-filter・`border-top`・`lg:hidden`・z-index 40 を持ち、`children` で CTA 内容を画面が差し込む。どのボタンを載せるか・Header の既存 CTA をどう退避するかは画面別 #588。

**backdrop-filter は SSOT トークン `var(--header-blur)` を使う（既存ヘッダーのリテラル直書きには合わせない）**。`spec/design/tokens.md` とモック `.cta-bar` は `backdrop-filter: var(--header-blur)` が正。既存実装の `APP_HEADER` 群は `--header-blur` を参照せずリテラル `saturate(180%) blur(20px)` を直書きしているが、これは spec から逸脱した既存負債であり、新設コードはそれを継がず CLAUDE.md backdrop-filter パターン（always-on base + `supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]` + `-webkit-` 版）でトークン経由表現する。既存ヘッダー群のリテラル直書きは本Issueでは触らない（負債解消は別Issue）。

**z-index は 40 を採用**。モック P10 は bulk-bar(45) > cta-bar(40) を意図するが、実装の `BulkActionBar` は現状 `z-40 sticky` 中央ピル（fixed full-width でない）。bulk-bar のモバイル fixed 化・z=45 引き上げは #588。CTA と bulk-bar は排他表示（モック注記）のため、本Issueで両者が z-40 同値でも実害は出ない。最終形の 40 を先取りして固定する。

### Consequences
- 良い点: 受け入れ基準2「共通側で表現され各画面が継承できる」を満たす。各画面が中身を差し込む設計で P11/P21 等への副作用を回避。backdrop-filter は SSOT トークン経由でリテラル負債を継がない。
- トレードオフ: 本Issue単体では枠がどの画面にも配置されない（#588 で実消費）。frame の見えはモック単体目視 + 最小サンプルの children 差し込み描画で確認する。z=45 への引き上げ前提（bulk-bar fixed 化）は #588 に依存。

---

## ADR-007: fieldControl のモバイル44px床は全フォームへ横断適用する（シート内限定ではない）

### Status
Accepted

### Context
モックの `field-control { min-height: 44px }` に追従するため `fieldControl`（`h-10`=40px）に `max-sm:min-h-[44px]` を足す。`fieldControl` は common primitive であり、設定画面・auth 等あらゆるモバイルフォームの input に波及する。「シート内のみ」と読める計画文面だと #588 の画面別レビューで混乱しうる。

### Decision
`fieldControl` への `max-sm:min-h-[44px]` 追加は**全モバイルフォームの input 高を 40→44px にする横断適用**であり、これは `index.md §3` のタッチ床横断適用の**意図どおり**（副作用ではない）。admin 専用の `FIELD_INPUT`（`layout/styles.ts`）は密度優先（§7.1）のため据え置く。textarea 合成（`min-h-[320px]`）とは `min-h` 同士で大きい方が勝つため無害。

### Consequences
- 良い点: モバイルのタッチ操作性が全フォームで向上。§3 準拠。
- トレードオフ: 全モバイルフォームの input 高が変わる視覚回帰（意図的）。admin は据え置きで密度優先を維持。

---

## ADR-008: Dialog backdrop と drawer の z-[100] 同値は意図的（排他表示前提）

### Status
Accepted

### Context
PR #596 レビュー（review-001 W-003）で、`dialogBackdrop`（`z-[100]`）と `APP_SIDEBAR` drawer（`max-lg:z-[100]`）が同値である点の積層意図が不明確と指摘された。

### Decision
両者の `z-[100]` 同値は意図的に維持する。Dialog（モーダル）と サイドバー drawer は同一画面で**排他表示**される前提（モック準拠。drawer を開いている間にモーダルを開く動線は無い）。本Issueはスコープを最小に保つため、既存の drawer `z-[100]` を変更しない。両者を同時表示する要件が将来生じた場合の積層調整は別Issueで扱う。

### Consequences
- 良い点: スコープ最小（既存 z 値を触らない）。排他表示前提で実害なし（PR #596 のブラウザ検証で Dialog 表示時に drawer が背後に隠れることを確認済み）。
- トレードオフ: Dialog と drawer の同時表示要件が出た場合は z スケールの再設計が必要（別Issue）。
