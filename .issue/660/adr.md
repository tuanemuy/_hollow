# ADR — Issue #660: 表示モード segmented の APG Tabs 不完全パターン解消

## ADR-001: 表示モード segmented を `tablist`/`tab` から `radiogroup`/`radio` へ置き換える

### Status
Proposed

### Context
表示モード segmented（list/tile/calendar）は `role="tablist"` / `role="tab"` / `aria-selected` を持つが、WAI-ARIA APG の Tabs パターンに必要な要素を欠いている:

1. tab 間の矢印キー移動（roving tabindex）が無い — 3 ボタンとも Tab 順に並ぶ
2. `aria-controls` → `tabpanel` の関連付けが無い
3. 非選択 tab の `tabindex="-1"` が無い

さらに本質的な問題として、**list/tile/calendar の切り替えに対応する実体 tabpanel が存在しない**。URL（`?display=`）を書き換えると `NoteListViews` / `PublicNoteViews` が再レンダーされるだけで、segmented の DOM 兄弟に「タブパネル」と呼べる要素は無い。

検討した選択肢:

- **案A: APG Tabs を完成させる（roving tabindex + ArrowLeft/Right + aria-controls + tabpanel 化）**
  実体 tabpanel が無いため、ビュー本体に人工的に `role="tabpanel"` / `aria-labelledby` を付けて関連付ける必要がある。ビュー本体は segmented とは別コンポーネント・別レンダー境界（home では async Suspense 境界の外、public では別 island）にあり、`id` 連携のためにコンポーネント間で id を引き回す結合が増える。「タブを選ぶとパネルが切り替わる」という Tabs の操作モデルは、実際には URL 駆動の画面再構成であって tab/panel の対ではない。
- **案B: `radiogroup` / `radio`（`aria-checked`）へ置き換える + roving tabindex を付ける**
  「相互排他の選択肢から1つを選ぶ」という UI の実体に意味的に一致する。tabpanel を必要としない（radiogroup は対パネルを要求しない）。APG の Radio Group パターンは roving tabindex / ArrowLeft/Right/Up/Down / Home/End / Space|Enter での選択を要求し、これは segmented の横並びと自然に合う。
- **案C: tabs/radio セマンティクスをやめて単純なボタングループ（`aria-pressed` トグル群）にする**
  最小実装だが、「3択から1つだけ選択中」という相互排他の関係を SR に伝えられない（`aria-pressed` は各ボタン独立のトグル状態で、グループとしての単一選択を表現しない）。情報量が後退する。

W-002 レビュアーも「tabpanel が実体として存在しない以上 radiogroup/radio（aria-checked）への置き換えが意味的に正確」と明示的に推奨している。

### Decision
**案B を採用する。** 表示モード segmented を以下のように置き換える:

- コンテナ: `role="tablist"` → `role="radiogroup"`（`aria-label` は「表示形式」を維持）
- 各ボタン: `role="tab"` → `role="radio"`、`aria-selected={active}` → `aria-checked={active}`
- roving tabindex: 選択中のボタンが `tabIndex={0}`、非選択は `tabIndex={-1}`
- キーボード: ArrowLeft/ArrowUp で前、ArrowRight/ArrowDown で次（両端ラップ）、Home で先頭、End で末尾。移動先へ DOM フォーカスを移し、移動と同時に選択を適用する（APG Radio Group の推奨挙動 — 矢印移動で即選択）。ネイティブ `<button>` の Space/Enter は onClick 経由で選択を維持。
- `aria-label`（リスト/タイル/カレンダー）/ `title` の既存契約は維持。

### Consequences
- 良い点: UI の実体（相互排他の単一選択）と ARIA セマンティクスが一致する。tabpanel 不在の矛盾が解消し、コンポーネント間の id 引き回し結合を増やさない。矢印キーで操作でき、SR の告知（「ラジオボタン、選択済み、3 個中 1 個」）が操作モデルと一致する。
- トレードオフ: spec モック（P10/P30）の `tablist`/`tab` 契約注記と、3 つのテスト（DisplayModeSwitch / PublicTopControls / 該当時 TagListToolbar）のロック契約を radiogroup へ更新する必要がある。既存契約の破壊的変更だが、契約自体が不完全だったため正当。

---

## ADR-002: 横並び segmented 用の roving は `useRovingMenu` を流用せず軽量な専用フックを新設する

### Status
Proposed

### Context
roving tabindex の既存プリミティブ `useRovingMenu`（#467）があるが、これは popover/menu/listbox 専用に設計されている:

- `open` 必須（ポップオーバーの開閉に紐づく）— segmented は常時表示で開閉概念が無い
- `panelRef.querySelectorAll('[role=...]')` で DOM フォーカスを実行 — segmented は panel ラッパーを持たない
- 縦方向の ArrowUp/Down/Home/End のみ — segmented は横並びで ArrowLeft/Right が主
- `restoreFocusOnCommit` / `isDisabled` / `initialIndex` など segmented に不要な多数の関心事を抱える

検討した選択肢:

- **案A: `useRovingMenu` を横方向対応・open 任意に一般化する**
  既存の menu/listbox 利用箇所（Menu, SortPopover, TagAddPopover）全てに影響する大改修になり、`open` を optional 化すると既存の closed→open リセット・focus-restore ロジックの不変条件が崩れるリスクが高い。segmented のために汎用フックの複雑度を上げるのは割に合わない。
- **案B: segmented 専用の軽量フック `useRovingTablist`（仮称）を新設する**
  segmented が必要とするのは「ArrowLeft/Right/Up/Down/Home/End で activeIndex を移動し、移動先へ DOM フォーカスを移し、tabIndex を roving させる」だけ。常時表示・横並び・固定要素数という単純な前提に閉じた小さなフックで足りる。本 Issue でラジオグループ化する 2〜4 コンポーネント間で共有できる。

### Decision
**案B を採用する。** `app/components/common/` 配下に segmented 用の軽量 roving フックを新設する。インターフェースは `{ orientation, count, value(index), onSelect(index) }` 程度に絞り、container に `onKeyDown`、各ボタンに `tabIndex` を供給する。`useRovingMenu` は menu/listbox 専用のまま変更しない。

参考: ラジオグループの roving では「選択中の index = フォーカス可能な唯一の index」なので、`activeIndex` は別管理せず選択値（current mode）から導出でき、`useRovingMenu` のような内部 state を持たずに済む可能性が高い（実装時に確定）。

### Consequences
- 良い点: 既存 menu/listbox 利用箇所への波及ゼロ。segmented の単純な前提に最適化された小さなフックで、本 Issue 対象コンポーネント間で再利用できる。
- トレードオフ: roving プリミティブが 2 つ並存する（menu 用と segmented 用）。ただし方向・開閉前提・フォーカス実行手段が本質的に異なるため、無理に統合するより責務が明確。

---

## ADR-003: 共通 `menuItem` の focus-visible 統一は本 Issue のスコープに含める

### Status
Proposed

### Context
Issue コメント（#659 R2 A11y W-001 / ADR-011）が、共通 `menuItem`（`app/components/common/styles.ts`）の focus-visible 表示が `focus-visible:bg-surface` のみで白パネル上 約1.08:1 のコントラストしかなく、roving 移動中の現在位置が知覚困難（WCAG 2.4.7）と指摘。#649 では新規 ViewSwitcher の `OPTION_ITEM` にのみ accent inset outline を適用し、共通 `menuItem` は app 全体の整合に関わるとして未修正のまま「共通課題として別途扱う」とされた。本 Issue がその「別途」にあたる。

`menuItem` の利用箇所は `Menu.tsx`（オーバーフロー/アバター/ディレクトリ操作メニュー）。同種の問題は `SORT_MENU_ITEM`（public）/ `TAG_ADD_OPTION_ITEM`（public）にも存在する（いずれも `focus-visible:bg-surface` のみ）。

### Decision
**本 Issue のスコープに含める。** ADR-011 が ViewSwitcher の `OPTION_ITEM` で確立した方針（`focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2` を既存の `focus-visible:bg-surface` に重ねる）を、共通 `menuItem` に適用して app 全体のメニュー系フォーカス表示を統一する。`bg-surface` は残す（accent outline と併用 — outline がコントラストを担保し、bg はホバー連続性のため）。

スコープ判断: segmented のラジオグループ化（focus-visible outline でのフォーカス表示）と menuItem 統一は「キーボードフォーカスの知覚可能性（WCAG 2.4.7）」という同一テーマであり、コメントで明示的に同時対応を求められている。ViewSwitcher が先行適用した方針の横展開のみで設計判断は既に確定済みのため、別 Issue に切る理由が無い。

`SORT_MENU_ITEM`（`public/styles.ts`）/ `TAG_ADD_OPTION_ITEM`（`PublicTopControls.tsx` 内ローカル定数、`public/styles.ts` には無い）も同テーマのため同時に揃える（いずれも `focus-visible:bg-surface` のみで同じ後退）。

#### danger 項目も accent outline で統一する理由

`menuItem` は ViewSwitcher の `OPTION_ITEM` と異なり danger 変種を持つ（`data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`、NoteActions「削除」等）。一律で `focus-visible:outline-accent` を足すと、danger 項目のキーボードフォーカス時に「error-surface 背景 + accent（青系）outline」という色の混在が出る。

検討した選択肢:
- **案A: danger 時は error 系 outline へ切り替える変種（`data-[danger]:focus-visible:outline-error` 等）を併記する。**
- **案B: danger 項目含め全項目で accent outline に統一する（error 色 outline の分岐を作らない）。**

**案B を採用する。** focus-visible の outline は「フォーカス位置インジケーター」として accent で統一する。danger のセマンティクスは text 色（error）+ bg（error-surface）が担い、outline はニュートラルなフォーカスリングとして全項目で accent に揃える。参照実装 ViewSwitcher の `OPTION_ITEM` / `TRIGGER` も accent 統一であり、フォーカスリングの一貫性が保たれる。danger に独立した outline 分岐を設けると、フォーカス可視性専用のリングにセマンティクス情報を二重持ちさせることになり、color トークンの増殖と表現の不統一を招く。WCAG 2.4.7（フォーカス可視性）は accent outline で満たされ、error 表現は text/bg が担保するため情報量の後退も無い。

### Consequences
- 良い点: ADR-011 が認めた「共通パターン側の解消までの過渡的な差異」を解消し、メニュー/オプション系のフォーカス表示が app 全体で一貫する。ViewSwitcher だけが浮いた状態が消える。
- トレードオフ: 変更がメニュー系全コンポーネントの見た目（フォーカス時のみ）に波及する。utility 文字列定数の変更なので Tailwind JIT 上の挙動は不変、回帰は focus-visible 時の outline 追加のみ。

---

## ADR-004: `useRovingTablist` は矢印移動時に `onSelect(index)` をフック内で発火する（実装時評価 arch S-001 の確定）

### Status
Accepted（実装で確定）

### Context
plan ステップ1の実装時評価（arch S-001）として、新設 `useRovingTablist` が「フォーカス移動のみを担い選択は caller の onClick に委ねる」（`useRovingMenu` の流儀）か、「矢印移動と同時に `onSelect(index)` も発火する」かを、実装時にどちらが既存プリミティブと整合するか確認して確定する、とされていた。

`useRovingMenu` は menu/listbox 用で「フォーカス移動のみ」だが、これは menu の選択が「フォーカス中の項目で Space/Enter を押す」操作モデルだからである。一方 APG Radio Group は「矢印移動 = 即選択」が標準挙動であり、フォーカス移動と選択が不可分。caller 側で「矢印移動を検知して onClick 相当を別途呼ぶ」配線を持たせると、フック外に選択責務が漏れて二重管理になる。

### Decision
**矢印移動時に `onSelect(next)` をフック内で発火する。** フックは「フォーカス移動 + 選択発火」を一体で担い、caller は `selectedIndex`（現在モードから導出）と `onSelect(index)`（index→既存 select ハンドラへのアダプタ）だけを渡す。ネイティブ `<button>` の Space/Enter / クリックは従来どおり caller の `onClick` が担い、二経路が同じ `select` 系ハンドラへ収束する。

これは `useRovingMenu` の「フォーカス移動のみ」と表面上は異なるが、操作モデルの差（menu = フォーカス→明示確定 / radiogroup = 移動即選択）に忠実であり、責務分担として整合的。フックは内部 state を持たず `selectedIndex` 由来の roving に閉じるため、`useRovingMenu` の open-reset / focus-restore のような複雑性は持ち込まない。

### Consequences
- 良い点: caller は index↔mode のアダプタ1本を渡すだけで radiogroup 全体が成立。矢印移動で navigate（home replace:true）/ useOptimistic（public）が click 経路と同一ハンドラ経由で走り、挙動の不変（AC-5）が自然に保たれる。
- トレードオフ: roving プリミティブが2種（menu=移動のみ / tablist=移動+選択）並存し発火責務が異なる。ただし操作モデルが本質的に異なるため、無理に揃えるより責務が明確（ADR-002 と同じ判断）。

---

## ADR-005: `role="radio"` を `<button>` に付すため `biome-ignore lint/a11y/useSemanticElements` を併記する

### Status
Accepted（実装で確定）

### Context
従来の `role="tab"` は biome の `useSemanticElements` に抵触しなかった（tab に対応するネイティブ要素が無い）。`radio` / `radiogroup` は `<input type="radio">` にマップされるため、segmented の `<button role="radio">` が同ルールでエラーになる。segmented はアイコンのみ（#626 ADR-001）で `<input type="radio">` では design を再現できず、Space/Enter 活性化・focus-visible・data-active 表現を維持するために `<button>` 継続が必要。

### Decision
コードベース既存の慣例（`NoteCheckbox` の `role="checkbox"`、FilterBar の `role="group"` 等）に倣い、各 radio ボタンに `biome-ignore lint/a11y/useSemanticElements` コメントを付して理由（ネイティブ radio で design 再現不可・button で APG Radio Group を表現）を明記する。`radiogroup` を付した `<div>` 側はルール非対象のため ignore 不要。
