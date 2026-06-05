# ADR — Issue #467: WAI-ARIA Menu パターンを共通プリミティブに抽出

## ADR-001: dismiss プリミティブと roving プリミティブを二層に分離する

### Status
Proposed

### Context
抽出対象の4コンポーネントは「dismiss（外側クリック/Esc/focus-out）+ ARIA + フォーカス復帰」を全員が持つが、roving tabindex は `role=menu` の3つ（+ FilterPopover の VisibilityPopover モード）だけが持ち、FilterPopover の `role=dialog`（期間フォーム）モードは roving を持たない。単一の `useMenu` フックに全責務を詰めると、dialog モードでも roving 用の API（activeIndex / getItemProps）が露出し、illegal state（dialog なのに roving）が型に表れてしまう。

### Decision
二層に分ける:
- 第1層 `usePopover` / `<Popover>` — dismiss + ARIA + focus 復帰 + shiftX。menu/dialog 両モード共通。
- 第2層 `useRovingMenu` + `<Menu>`/`<MenuItem>` — roving tabindex。menu モード専用。第1層を内部で使う。

FilterPopover が既に「dismiss だけ」を切り出してインライン実装していた事実が、この境界の自然さを裏付ける。

### Consequences
- 良い点: dialog モードに roving API が漏れない。`<Menu>`（宣言的・actions メニュー向け）と `<Popover>`（render-prop・FilterBar 向け）が同じ第1層を共有するので重複が出ない。テストも層ごとに分けられる。
- トレードオフ: ファイル数が増える（usePopover / Popover / useRovingMenu / Menu の4ファイル）。ただし各々が単一責務で読みやすく、共通化のメリットが上回る。

### 補足: roving index 採番の単一真実源
`<Menu>` は `Children.toArray(children)` から `<MenuItem>` 型のノードのみを抽出し、その配列 index を Context 経由で各 MenuItem に配る。`querySelectorAll('[role=menuitem]')` の DOM クエリには依存しない。UserMenu の info ヘッダ・`logoutError` のような非 MenuItem children は素通しでレンダリングするが roving index からは除外される。React 宣言ツリーを単一の真実源にすることで、宣言順と DOM 順のずれ・混在ノードの数混入を型と実装の両面で防ぐ。

---

## ADR-002: メニュー項目ハイライトを `focus-visible:` ベースに統一する

### Status
Proposed

### Context
3つの actions メニューでハイライト方針が分岐していた（#467 コメント1）:
- UserMenu（#463 対応）: `focus-visible:bg-surface` — マウス開時グレー化しない
- DirectoryActionsMenu: `focus:bg-surface` — 開いた瞬間グレー化バグ残存
- NoteActionsMenu: `focus:bg-surface` を「roving 着地のため非ガード」と意図的に維持

roving tabindex は open 時に先頭項目へプログラム的 `.focus()` するため、`focus:` だとマウス開時に先頭がグレー化する（#463 ADR-001 の知見）。

### Decision
共通 `menuItem` style を `focus-visible:bg-surface`（+ danger は `data-[danger]:focus-visible:bg-error-surface` 併記）に統一する。NoteActionsMenu の「非ガード」方針も統一形に寄せる。#463 で UserMenu が `focus-visible:` でもキーボード移動時にハイライトが付くと実証済み。

### Consequences
- 良い点: 3メニューでハイライト挙動が一致。DirectoryActionsMenu の開時グレー化バグが同時解消。SSOT 化で再発防止。
- トレードオフ: NoteActionsMenu の既存挙動（マウス開時に先頭グレー化）が変わる。移行後に手動でキーボード Arrow 移動のハイライト視認性を確認する。

---

## ADR-003: disabled 表現を `aria-disabled` + onClick ガードに統一する

### Status
Proposed

### Context
disabled の表現が分岐:
- UserMenu: native `disabled` 属性 — フォーカス不可になり roving から外れる
- NoteActionsMenu: `aria-disabled` + onClick ガード（#459 review-001 W-001）— フォーカス可能なまま roving に残る
- DirectoryActionsMenu: disabled 項目なし

native disabled だと roving のインデックス計算から項目が抜け、キーボードナビが飛ぶ。WAI-ARIA Menu パターンでは disabled 項目もフォーカス可能に保つのが推奨。

### Decision
共通 `<MenuItem disabled>` は `aria-disabled="true"` + onClick ガード（`runAndClose` を渡さない）に統一し、フォーカス可能なまま roving に残す。UserMenu の native disabled を廃止する。hover は `not-aria-disabled:` でガード（#459 / #331 方針踏襲）。

### Consequences
- 良い点: 4メニューで disabled 項目の roving 挙動が一致。#331 の disabled hover 無効化と歩調が合う。
- トレードオフ: UserMenu のログアウト pending 中の挙動が native disabled → aria-disabled に変わる。新規テストで固定する。
- 挙動変化（レビュー P-002 反映）: 現 `USER_MENU_ITEM` の danger hover（`data-[danger]:hover:bg-error-surface`）には `not-aria-disabled:` ガードが無い。共通 `menuItem` で `data-[danger]:hover:not-aria-disabled:bg-error-surface` に統一すると、UserMenu のログアウト pending 中（danger かつ disabled）に初めて hover が抑制される。望ましい統一だが厳密には挙動変更を伴うため、「disabled な danger 項目で hover クラスが当たらない」を新規テストで固定する。

---

## ADR-004: `<MenuItem>` の roving index は `cloneElement` で注入する

### Status
Accepted（実装時の確定事項）

### Context
ADR-001 補足で「`<Menu>` は `Children.toArray(children)` から `<MenuItem>` 型ノードを抽出し、その配列 index を Context 経由で各 MenuItem に配る」と決めた。実装に落とす際、Context だけで「この MenuItem は何番目か」を各子が自己解決する手段が無い（Context は全 MenuItem に同じ値しか配れない／各子が自分の宣言順を知る術が無い）。当初 `ctx.indexOf(<MenuItem {...props}/>)` で同一要素を再構築して照合する案を試したが、`Children.toArray` が付与する内部 key により参照・構造が一致せず破綻した。

### Decision
`<Menu>` 側で `Children.toArray(children)` を走査し、`<MenuItem>` 型ノードにだけ `cloneElement` で内部 prop `_rovingIndex`（宣言順カウンタ）を注入する。非 MenuItem ノードは素通し。`itemCount` も同走査のカウンタを使う。`<MenuItem>` は注入された `_rovingIndex` で `ctx.getTabIndex(index)` を引く。`_rovingIndex` は `MenuItemProps` とは別の internal 型に切り出し、consumer が渡さない（型に露出しない）契約とする。

### Consequences
- 良い点: index 採番の単一真実源（React 宣言ツリー）を保ったまま、DOM query 非依存で各 MenuItem が自分の index を確定できる。非 MenuItem 混在（UserMenu の info/error）も自然に除外される。
- トレードオフ: 内部 prop の注入というやや暗黙的な仕組み。`MenuItem` を `<Menu>` の直下以外に置くと index が付かない（`_rovingIndex` のデフォルト 0 にフォールバック）。現状の全 consumer は直下配置なので問題ない。

---

## ADR-005: Directory の keydown stopPropagation は `onPanelKeyDown` opt-in で配線する

### Status
Accepted（実装時の確定事項）

### Context
DirectoryActionsMenu は Arrow/Home/End の roving keydown が囲みの treeitem へ伝播すると DirectoryTree の兄弟ナビが二重発火する。旧実装は `onMenuKeyDown` 内で `event.stopPropagation()` を呼んでいた。共通 `<Menu>` ではパネルの `onKeyDown` を roving が所有するため、呼び出し側が stopPropagation を差し込む口が必要になる。

### Decision
`<Menu>` に opt-in prop `onPanelKeyDown?(event)` を追加し、パネルの `onKeyDown` で roving 本体の前に呼ぶ。Directory だけが Arrow/Home/End に対して `stopPropagation()` する handler を渡す（Escape は document レベル dismiss に委ねるため対象外）。トリガー click 側の stopPropagation+preventDefault は計画通り `onTriggerClick` opt-in で配線する。

### Consequences
- 良い点: stopPropagation の責務が呼び出し側に閉じ、他メニューは無指定で素の挙動を保つ。トリガー click と keydown の双方を同じ opt-in パターンで扱える。
- トレードオフ: `<Menu>` に opt-in prop が2つ（`onTriggerClick` / `onPanelKeyDown`）増える。いずれも Directory 固有の要件で、デフォルトでは no-op。
