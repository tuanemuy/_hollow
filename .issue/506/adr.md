# ADR — Issue #506: 非モーダル Popover（dialog モード）の role=dialog と初期フォーカス方針

## ADR-001: 非モーダルのまま `role="dialog"` を維持し、open 時にパネル内の最初の操作可能要素へ初期フォーカスを移す（3択の「選択肢1」）

### Status
Accepted（計画確定に合わせて 2026-07-01 に Proposed から更新）

### Context
#467（PR #505）で WAI-ARIA Menu/Popover パターンを共通プリミティブ（`usePopover` / `Popover`）へ抽出した際、`Popover haspopup="dialog"` の dialog モードは次の状態だった（`.issue/467/review/review-001.md` Accessibility W-002）:

- パネルは `role="dialog"` を名乗り、トリガーは `aria-haspopup="dialog"` を持つ（＝支援技術には「ダイアログを開く」とアナウンスされる）
- しかし open してもフォーカスはトリガーに留まる（**初期フォーカス移動が無い**）
- フォーカストラップも無い（**非モーダル設計**、`.issue/467/adr.md` で「non-modal by design: no focus trap」と明言）

結果、SR/キーボード利用者に対する「ダイアログが開いた＝コンテキストが移った」という期待と、実体（フォーカスは動かず、トラップも無い）が乖離している。Issue #506 はこの乖離をどう解消するかの**設計判断そのもの**が本質。

選択肢は3つ:

1. 非モーダルのまま `role="dialog"` を維持しつつ、open 時にパネル内の最初の操作可能要素へ初期フォーカスを移す
2. 非モーダルに合わせて軽量な role へ変更する（`role` を外す等）
3. 現状維持（意図的非モーダルとして許容）を明文化する

#### 調査で判明した重要事実

`Popover haspopup="dialog"` の実利用は DatePopover だけではなく **3 か所**ある（`aria-haspopup="dialog"` 全 grep で確認）:

- `app/components/note/list/FilterBar.tsx` の `DatePopover`（初期フォーカス無し）
- `app/components/public/PublicTopControls.tsx` の `DatePopover`（初期フォーカス無し・UI は上とほぼ同一）
- `app/components/note/editor/DirectoryTreeSelect.tsx`（**consumer 側で既に初期フォーカスを自前管理**。open 時に `setTimeout(() => searchRef.current?.focus(), 0)` で検索用 combobox 入力へフォーカスを移している）

すなわち dialog モードのうち DirectoryTreeSelect は既に「開いたらパネル内へフォーカスを移す」を満たしており、乖離しているのは 2 つの DatePopover だけ。

（`aria-haspopup="dialog"` を素の `<button>` に付けて**モーダル** `<Dialog>` を開く箇所 — NotePickerDialog トリガー・モバイル絞り込みシート・SearchFilterDrawer — は本 Popover プリミティブとは別系統でトラップ有り。本 ADR の対象外。）

### Decision
**選択肢1を採用する。** `role="dialog"` と `aria-haspopup="dialog"` はそのまま維持し（role/ARIA 契約は変えない）、open 時にパネル内の最初の操作可能要素へ初期フォーカスを移す挙動を追加する。フォーカストラップは追加しない（非モーダルのまま）。

初期フォーカスの責務は **第1層 `usePopover`（＋ `Popover`）に置く**。理由は #467 ADR-001 の二層設計:

- 第1層 `usePopover` は「dismiss ＋ ARIA ＋ **トリガーへの focus 復帰**」を所有する。初期フォーカス（open 時にパネル内へ focus を移す）は focus 復帰の対称的なカウンターパートであり、同じ層に置くのが自然。パネル要素の ref（`setPanelRef` / `panelRef`）も既に第1層が握っている。
- 第2層 `useRovingMenu`（menu/listbox）は roving tabindex で既に初期フォーカスを持つ（`initialIndex`）。dialog には第2層が無いので、第1層が dialog 用の初期フォーカスを補う。

具体化:

- `usePopover` に opt-in オプション（例 `moveInitialFocus?: boolean`）を追加。true かつ **open の閉→開の立ち上がりエッジ**でのみ、`panelRef.current` 内の最初の focusable 要素を `useEffect`（`[open, moveInitialFocus]` キー）で `.focus()` する。立ち上がりエッジ判定には `prevOpenRef`（`useRef`）を持ち `!prevOpen && open` を条件にする（`useRovingMenu` が同一の「popover を開いたまま filter navigation で effect 再評価」シナリオで `prevOpenRef` により reset effect の再発火を抑止している前例に倣う）。これがないと、DatePopover を開いたまま preset 選択→URL navigation（RSC 再レンダー、popover は閉じない）で effect が再評価されるたびにユーザーの移動先から先頭 focusable へフォーカスを奪い戻す回帰になる。focusable セレクタは `Dialog.tsx` の **非フィルタ版** `FOCUSABLE_SELECTOR` を踏襲した定数を `usePopover` 内に**同名** `FOCUSABLE_SELECTOR` でローカル定義する（Dialog の `INITIAL_FOCUS_SELECTOR` は close ボタン除外付きのフィルタ版で別物）。
- `Popover` は boolean prop（例 `initialFocus`）で受け、`moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` と **`haspopup` でコードゲート**して `usePopover` へ渡す。dialog ブランチでのみ意味を持ち、menu/listbox に誤って渡っても構造的に無効化される（roving との二重フォーカスを表現不能にする）。JSDoc 運用依存にせず、CLAUDE.md「illegal states を型で表現不能に」に沿ってコードの不変条件へ昇格させる。
- consumer 配線: **2 つの DatePopover** が `initialFocus` を opt-in する（最初の focusable ＝ 先頭のプリセットボタン）。**DirectoryTreeSelect は変更しない**（自前の検索 combobox フォーカスを維持）。

### なぜ opt-in（default-on ＝ opt-out ではなく）か
1. **ブラスト半径の最小化。** DirectoryTreeSelect は bespoke な `setTimeout(0)` タイミングで検索入力へ自前フォーカスしている。プリミティブが無条件にフォーカスすると二重フォーカス／タイミング回帰のリスクがあり、Issue #506 のスコープ外の consumer を壊しかねない。opt-in なら DirectoryTreeSelect を一切触らずに済む。
2. **第2層との一貫性。** roving（menu/listbox）の初期フォーカスは `initialIndex` として**明示的に**設定する設計。dialog の初期フォーカスも明示的 opt-in にするのが二層設計の思想と揃う。
3. **menu/listbox への漏れ防止。** dialog 専用の責務であることを prop で明示でき、roving の初期フォーカスと二重にならない。

### なぜ選択肢2（role を外す/軽量化）を採らないか
- トリガーの `aria-haspopup="dialog"` が既に「ダイアログを開く」とアナウンスしており、role を外すと haspopup 側との不整合が生じる（両方を整合的に外すと、まとまった補助 UI が「ただのボタン群」に退化し、SR 利用者がパネル境界を把握しづらくなる）。
- DatePopover はプリセット群・日付入力・クリア/閉じるを内包する「まとまった補助操作領域」であり、`role="dialog"`（非モーダル可）で名前（`aria-label="期間フィルタ"`）を与える意味論は妥当。
- 乖離の主因は「role が過剰」ではなく「初期フォーカスが欠けている」こと。欠けている半分を足すのが最小かつ意味論を保つ解。

### なぜ選択肢3（現状維持を明文化）を採らないか
- 明文化だけでは SR/キーボード利用者の実体験の乖離（開いてもフォーカスが動かない）が残る。Issue の「やりたいこと」を満たさない。

### なぜフォーカストラップを入れないか（非モーダルを維持する根拠）
- **意図的な非モーダル設計**（#467 ADR）。FilterBar の DatePopover は「開いたまま外側の他チップ／本文を操作でき、外側 mousedown・Tab-out・Escape で閉じる」非モーダル dismiss を前提にしている。トラップを入れると Tab-out で閉じる既存挙動と矛盾し、背景の inert 化も必要になり、フィルタバーの操作フローを壊す。
- **WAI-ARIA APG 上、非モーダル dialog は許容**される（トラップは modal dialog の要件）。非モーダルでは「初期フォーカスを中へ移す」＋「閉じたらトリガーへ復帰」で十分。後者は `usePopover` の `closeAndRestoreFocus` ＋ Escape ハンドラで既に成立している。
- したがって本 Issue で足りないのは初期フォーカスの片側だけ。トラップ追加はスコープ外かつ設計思想に反する。

### Consequences
- 良い点:
  - `role="dialog"` の意味論（haspopup でのアナウンス）を保ったまま「開いたのにフォーカスが移らない」乖離を解消。
  - 既存の Escape クローズ・トリガーへの focus 復帰・非モーダル dismiss を一切変えない。
  - 責務が二層設計に沿って第1層へ集約され、menu/listbox の roving 初期フォーカスと二重化しない。`Popover` の `haspopup === "dialog"` コードゲートにより、menu/listbox への誤配線でも二重フォーカスが構造的に発生しない。
  - `prevOpenRef` の立ち上がりエッジガードにより、DatePopover を開いたまま filter navigation が起きても初期フォーカスがユーザーの移動先を奪い戻さない。
  - DirectoryTreeSelect（自前フォーカス）を触らずに済む。
- トレードオフ:
  - `usePopover`/`Popover` に opt-in prop が1つ増える（dialog 専用、default no-op）。
  - focusable セレクタ定数が `Dialog.tsx` と `usePopover.ts` に二重に存在する。共有モジュール抽出は「Dialog が使うのは close ボタン除外の**フィルタ版**（`INITIAL_FOCUS_SELECTOR`）、本用途が必要とするのは close 除外不要の**非フィルタ版**（`FOCUSABLE_SELECTOR`）で必要形が異なり、共有すると呼び出し側で分岐が要る」ため見送り、ローカル定義＋相互参照コメントで許容（純粋な文字列定数の二重定義は YAGNI 上許容範囲）。
  - opt-in ゆえ「haspopup="dialog" にしたが initialFocus を渡し忘れる」と乖離が再発しうる。プリミティブの JSDoc で「dialog は初期フォーカスを opt-in する（自前管理する場合を除く）」と明記して緩和する。

### 実装時の補足（2026-07-01）
- **`PublicTopControls.test.tsx` を happy-dom 化**: AC-4 の初期フォーカスは effect 駆動で SSR マークアップには現れないため、従来 node 環境で `renderToStaticMarkup` のみだった同ファイル冒頭に `// @vitest-environment happy-dom` を付与し、`createRoot` による動的マウント→`期間`トリガー click→先頭プリセットボタンへの `document.activeElement` 移動を検証する describe を追加した。既存の SSR（`renderToStaticMarkup`）系アサーションは happy-dom 下でも不変で全て緑。`FilterBar.test.tsx` / `Popover.test.tsx` は既に happy-dom のため据え置き。

---
