# 実装計画 — Issue #467: refactor(ui): WAI-ARIA Menu パターンを共通プリミティブ（Popover/Menu）に抽出する

**Issue:** #467
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

同一の WAI-ARIA Menu/Popover パターン（roving tabindex・dismiss（外側クリック/Esc/focus-out）・トリガーへのフォーカス復帰・`runAndClose` による Dialog 連携・`aria-haspopup`/`aria-expanded`/`aria-controls` 配線）を、現在4つのコンポーネントがそれぞれインラインで重複実装している。rule of three を超えたので共通プリミティブに抽出し、4コンポーネントすべてを載せ替え、ハイライト/disabled 方針を統一し、共通プリミティブにユニットテストを付ける。

抽出対象:
- `app/components/directory/DirectoryActionsMenu.tsx`（#289、テスト無し）
- `app/components/layout/UserMenu.tsx`（テスト無し、native disabled 使用）
- `app/components/note/detail/NoteActionsMenu.tsx`（#459 / PR #466、テスト済み・基準実装）
- `app/components/note/list/FilterPopover.tsx`（#476 / PR #491、dual-mode menu/dialog・shiftX クランプ）

## スコープ

### 含まれるもの
- 共通プリミティブ（二層構成）を `app/components/common/` に抽出
  - 第1層 `usePopover`（dismiss + ARIA + focus 復帰 + shiftX）／`<Popover>`（dual-mode render-prop ラッパ）
  - 第2層 `useRovingMenu`（roving tabindex）／`<Menu>`・`<MenuItem>`（宣言的 menu）
- 4コンポーネントを共通プリミティブベースに置換
- メニュー項目ハイライトを `focus-visible:` ベースに統一（DirectoryActionsMenu の残存バグ解消、NoteActionsMenu の `focus:` も統一）
- disabled 表現を `aria-disabled` + onClick ガード（roving 残留）に統一（UserMenu の native disabled を廃止）
- 共通プリミティブのユニットテスト追加 + UserMenu/DirectoryActionsMenu のコンポーネントテスト新規追加

### 含まれないもの
- パネル配置の viewport-edge flip 実装（#289 ADR-003 の現状踏襲。shiftX 水平クランプのみ共通化）
- パネル幅・アンカー位置の共通化（4つで異なるため呼び出し側 `panelClassName` に残す）
- #331 の disabled hover 無効化の他箇所への展開（メニュー項目の `not-aria-disabled:` 統一のみ歩調を合わせる）

## 共通プリミティブ API 設計

二層に分離する。dismiss/ARIA は dialog でも menu でも共通なので下層、roving は menu 専用なので上層に置く。

### 第1層: `usePopover` — `app/components/common/usePopover.ts`

責務: document mousedown / Escape / focus-out dismiss、`closeAndRestoreFocus`（トリガーへ focus を戻してから閉じる）、`clampToViewport` 時の shiftX 測定（FilterPopover のロジック移植）、`panelId` 採番、`triggerProps`（`ref`/`aria-haspopup`/`aria-expanded`/`aria-controls`）組み立て。controlled（open/onOpenChange を外部所有）対応。

### `<Popover>` — `app/components/common/Popover.tsx`

`usePopover` を使う dual-mode（role=menu / role=dialog）render-prop ラッパ。現 `FilterPopover` の責務を担う。`trigger` render prop と `children`（`close` 注入）を受ける。

### 第2層: `useRovingMenu` — `app/components/common/useRovingMenu.ts`

責務: Arrow/Home/End で activeIndex 更新、open + activeIndex 変化で `panelRef` 内の `[role=itemRole]` を programmatic focus。`initialIndex`（VisibilityPopover の選択中着地）、`itemRole`（menuitem / menuitemradio）対応。`stopPropagation` は呼び出し側が `onKeyDown` を wrap して付与（Directory のみ）。

### `<Menu>`・`<MenuItem>` — `app/components/common/Menu.tsx`

`usePopover`(haspopup="menu") + `useRovingMenu` + Context を統合した宣言的 API。`<Menu>` が children の `<MenuItem>` を数えて roving を駆動、Context 経由で index / activeIndex / `getItemProps` / `runAndClose` を配る。

**index 採番の単一真実源（重要 / レビュー P-001 反映）**: `<Menu>` は `Children.toArray(children)` を走査して `<MenuItem>` 型のノードのみを抽出し、その配列 index を各 `MenuItem` に Context 経由で配る。非 MenuItem children（UserMenu の info ヘッダ・`logoutError`）はそのまま素通しでレンダリングするが roving index からは除外する。`querySelectorAll('[role=menuitem]')` の DOM クエリには依存しない（React 宣言ツリーの index と DOM index がずれる／混在ノードが数に混入する問題を回避）。`useRovingMenu` の `itemCount` はこの抽出後の MenuItem 数を渡す。programmatic focus は panelRef 内の `[role=menuitem]` を DOM 順に拾うが、宣言順＝DOM 順を保証する（MenuItem 以外は role を持たない）。

```tsx
<Menu
  open onOpenChange
  trigger={(props) => <button {...props} className={...}>…</button>}
  ariaLabel="その他の操作"
  onTriggerClick={(e) => e.stopPropagation()}  // Directory 用 opt-in
  panelClassName="absolute right-0 mt-1 min-w-[180px]"  // パネル配置は呼び出し側
>
  <MenuItem onSelect={onDuplicate} disabled={pending} icon={Copy}>複製</MenuItem>
  <MenuItem onSelect={onHistory} icon={History}>履歴</MenuItem>
  <MenuItem separatorBefore danger onSelect={onDelete} icon={Trash2}>削除</MenuItem>
</Menu>
```

- `<MenuItem>` は `aria-disabled` + onClick ガード（disabled 時 `runAndClose` を渡さない）に統一。`data-danger`、`icon`、children を受ける。
- `runAndClose` = `closeAndRestoreFocus()`（トリガー focus → close）の後に `onSelect()` を呼ぶ Dialog 連携順を保持。

### dual-mode / render prop トリガー / shiftX の吸収
- dual-mode は第1層 `usePopover` + `<Popover>` が `haspopup` で吸収。`<Menu>` は `haspopup="menu"` 固定の糖衣、dialog モードは `<Popover>` を直接使う（FilterBar の DatePopover）。
- render prop トリガーは第1層の `triggerProps` を全コンポーネントの基盤にする。**トリガー onClick の責務境界（レビュー S-002 反映）**: 3つの actions メニューは open を内部所有するため、`triggerProps` に open トグル用 `onClick` を含めて `<Menu>` が合成する。Directory のみ追加で stopPropagation+preventDefault が要るので `<Menu onTriggerClick={...}>` opt-in を `triggerProps.onClick` の前に合成する。FilterBar は open を外部所有するため `<Popover>` の `triggerProps.onClick` は呼び出し側のトグルを呼ぶ。
- shiftX は `usePopover({ clampToViewport: true })` の opt-in。actions メニュー3つは `absolute right-0 mt-1`（#289 ADR-003 現状踏襲）なので false、FilterPopover consumer のみ true。

### `menuItem` 共通 styles — `app/components/common/styles.ts` に追加

`USER_MENU_ITEM`（#463 で `focus-visible:` 済み）を SSOT 化して hoist。パネル幅・配置（`min-w-[...]` / `right-0 mt-1` / `left-0 top-full mt-2`）は呼び出し側が `panelClassName` で足す（Directory=160px, User=220px, Note=180px, Filter=280px と差がある）。

## 実装ステップ

### 1. `app/components/common/styles.ts`
- **変更内容:** `menuPanel` / `menuItem` / `menuSeparator` を追加（`focus-visible:bg-surface` + `hover:not-aria-disabled:bg-surface` + `aria-disabled:opacity-disabled` + `aria-disabled:cursor-not-allowed` + `data-[danger]:text-error` + `data-[danger]:hover:not-aria-disabled:bg-error-surface` + `data-[danger]:focus-visible:bg-error-surface` 統一形）。danger hover を `not-aria-disabled:` ガードに統一する点が現 `USER_MENU_ITEM`（ガード無し）からの挙動変化（レビュー P-002 反映 → ADR-003 参照）
- **理由:** ハイライト/disabled 方針の SSOT 化、3ドメイン styles の重複解消

### 2. `app/components/common/usePopover.ts`（新規）
- **変更内容:** FilterPopover の dismiss / focus-out / Escape / `closeAndRestoreFocus` / shiftX クランプ / `triggerProps` / `panelId` ロジックを移植・一般化。`clampToViewport` opt-in
- **理由:** 4つ共通の最下層

### 3. `app/components/common/Popover.tsx`（新規）
- **変更内容:** `usePopover` を使う dual-mode render-prop ラッパ。現 `FilterPopover` の責務を担う
- **理由:** dialog モードと FilterBar consumer の受け皿

### 4. `app/components/common/useRovingMenu.ts`（新規）
- **変更内容:** roving tabindex（Arrow/Home/End, programmatic focus, `getItemProps`, `initialIndex`, `itemRole`）を抽出
- **理由:** menu モード専用ロジックの共通化
- **index 規律（レビュー2周目 S-001 反映）:** `useRovingMenu` 自体は itemCount を呼び出し側から受け取り、DOM の `querySelectorAll('[role=itemRole]')` は programmatic focus の実行専用とする（カウント/index の真実源にはしない）。`<Menu>` 経由では Children.toArray 抽出 index、VisibilityPopover 直接利用では `VISIBILITY_OPTIONS` の map index がそれぞれ真実源になるが、いずれも「呼び出し側が itemCount/index を渡し DOM query は focus のみ」の規律で二系統が破綻しない

### 5. `app/components/common/Menu.tsx`（新規）
- **変更内容:** `usePopover`(menu) + `useRovingMenu` + Context で `<Menu>`/`<MenuItem>` を提供。`runAndClose`・`onTriggerClick` opt-in・`separatorBefore`・`icon`・`danger`・`aria-disabled` ガードを実装
- **理由:** 3つの actions メニューの宣言的土台

### 6. `note/detail/NoteActionsMenu.tsx`
- **変更内容:** `<Menu>`/`<MenuItem>` ベースに置換。ローカル `MENU_*` 定数を共通 `menuItem`/`menuPanel` + `panelClassName` に置換。`focus:`→`focus-visible:` 統一
- **理由:** 基準実装の移行 + 既存テストでリグレッション検出

### 7. `directory/DirectoryActionsMenu.tsx`
- **変更内容:** `<Menu>` に置換。`onTriggerClick={stopPropagation+preventDefault}`、`onKeyDown` wrap で `stopPropagation`（DirectoryTree 二重発火防止）維持。`directory/styles.ts` の `ACTIONS_MENU_ITEM`（`focus:` バグ）削除し共通 `menuItem` 使用、`ACTIONS_MENU_PANEL` は `panelClassName` 幅指定に縮約
- **理由:** `focus:` 残存バグ同時解消

### 8. `layout/UserMenu.tsx`
- **変更内容:** `<Menu>` に置換。info ヘッダと `logoutError` は非 MenuItem children として描画（Children.toArray の MenuItem 抽出により roving index から除外される）。現 `disabled={isPending && item.danger}`（native disabled 属性）を `<MenuItem disabled={isPending && item.danger}>`（内部で `aria-disabled="true"` へ変換、roving 残留）へ変更。pending 中の視覚表現（opacity/cursor）は共通 `menuItem` の `aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed` 経由で再現される。`layout/styles.ts` の `USER_MENU_ITEM`→共通 `menuItem`、`USER_MENU_PANEL`→幅 panelClassName
- **理由:** native disabled の統一、info/error 混在ノードの取り回し
- **受け入れ基準（新規テストで固定）:** ログアウト pending 中にログアウト項目（danger）が `aria-disabled=true`・focusable（roving に残る）・click が no-op、かつ danger×disabled で hover クラスが当たらない（`not-aria-disabled:` ガード）。pending 中に disable されるのは danger 項目のみで他の menu 項目は disable されない（現 `disabled={isPending && item.danger}` の限定条件を維持。レビュー2周目 S-001 反映）

### 9. `note/list/FilterPopover.tsx`
- **変更内容:** consumer（`FilterBar.tsx` の `DatePopover`/`VisibilityPopover`）を直接 `<Popover>` + `useRovingMenu` に載せ替えて `FilterPopover.tsx` 削除。`VisibilityPopover` の roving インライン実装を `useRovingMenu({ itemRole:"menuitemradio", initialIndex:選択中 })` に置換
- **理由:** 4つ目の完全移行と roving 重複解消
- **DOM 不変条件（移行で壊さない）:** VisibilityPopover の `role="menuitemradio"`・`aria-checked`・`data-active`・項目 textContent（「公開状態」等）、DatePopover の `role="dialog"`・フォーム構造。`FilterBar.test.tsx` の既存2ケースはタグ optimistic のみでこれらをガードしないため、移行後動作はステップ10で新規テストを起こして担保する
- **VisibilityPopover のハイライト方針（レビュー2周目 P-001 反映）:** menuitemradio は共通 `menuItem` をそのまま適用しない（`menuItem` に無い `data-[active]:bg-surface data-[active]:font-medium` の選択中表示を消さないため）。現 style（`hover:bg-surface focus:bg-surface data-[active]:bg-surface data-[active]:font-medium`、`FilterBar.tsx:717`）の **`focus:`→`focus-visible:` だけを揃え**て roving programmatic focus 由来の開時グレー化（コメント1 と同型のバグ）を解消し、選択中の `data-[active]` 表示は維持する。menuitemradio 専用 style はインライン or FilterBar ローカル定数として残す
- **トリガー複合構造の維持（レビュー2周目 S-002 反映）:** VisibilityPopover の trigger は chip（applied）/ghost（未選択）の2分岐かつ chip 内に解除（×）ボタンを内包する複合構造（`FilterBar.tsx:660-700`）。`triggerProps`（ref/aria-haspopup/aria-expanded/aria-controls/onClick）は chip 内のトグルボタンにだけ配り、× ボタンには配らない現構造を維持する
- **onMouseDown preventDefault の方針（レビュー2周目 S-002 反映）:** 現 FilterPopover の menu パネルは `onMouseDown preventDefault` を持たない（`FilterPopover.tsx:178-188`）。VisibilityPopover は選択即 close で focus 維持が不要なため、移行後も付与しない現状維持とする（`<Menu>` の actions メニューのみ付与）

### 10. テスト追加
- **変更内容:** `app/components/common/__tests__/` に `Menu.test.tsx` / `Popover.test.tsx`（次節「テスト方針」参照）。UserMenu/DirectoryActionsMenu のコンポーネントテストも追加
- **理由:** 共通プリミティブのロック + Issue 要件「全体のロック底上げ」

### 11. 検証
- `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test:unit`

## 設計判断

詳細は `adr.md` 参照。要点:
- **二層分離**: `usePopover`（dismiss/dialog 共通）と `useRovingMenu`（menu 専用）を分離。単一 `useMenu` だと dialog モードが roving を巻き込み API が濁る
- **宣言的 `<Menu>` を3メニュー、render-prop `<Popover>` を FilterBar に**: 用途に応じて使い分け、土台の `usePopover` は共有
- **NoteActionsMenu の `focus:`→`focus-visible:` 統一**: コメント1 推奨に従う（#463 で UserMenu が `focus-visible:` で問題ないと実証済み）
- **`FilterPopover.tsx` は削除**（re-export 残置は中途半端）

## リスクと注意点

- **runAndClose の Dialog 連携順**: 「トリガー focus → close → fn()」の順序を厳守しないと `ConfirmDialog`/`MoveNoteDialog` の `previousActiveRef` が `<body>` を掴みフォーカス復帰が壊れる。最重要不変条件
- **UserMenu の info/error ノード**: `<Menu>` children に MenuItem 以外が混ざる。`useRovingMenu` の itemCount は `[role=menuitem]` の DOM 数で数える（非 MenuItem を roving カウントに含めない）
- **Directory の stopPropagation/preventDefault**: トリガー click と menu keydown 双方で必要。opt-in 漏れは treeitem ナビ二重発火 / リンク遷移再発
- **onMouseDown preventDefault（パネル）**: focus 維持のため menu パネルに必ず付与。dialog モードは現 FilterPopover が持たない点に注意（挙動を変えないよう menu モードのみ付与）
- **shiftX の reset タイミング**: close で `setShiftX(0)`、open ごとに1回測定の現行不変条件を維持
- **`aria-controls` を open 時のみ出す**現挙動（4つ共通）を triggerProps で保つ

## テスト方針

新規 `app/components/common/__tests__/` に、既存 `NoteActionsMenu.test.tsx` の happy-dom + `createRoot`/`act` 様式で:

- **`Menu.test.tsx`**: 閉時 menuitem 0 / `aria-haspopup=menu`・`aria-expanded` 配線、open で先頭 roving 着地（tabindex 0/-1）、Arrow/Home/End で活性移動、Escape クローズ + トリガー focus 復帰、外側 mousedown クローズ、menuitem click で onSelect 呼び出し + クローズ、**`aria-disabled` 項目が roving に残る（focusable・native disabled でない）+ click が no-op + メニュー開いたまま**、danger の `data-danger` 付与、`separatorBefore` の `<hr>`、`onTriggerClick` の stopPropagation 透過
- **`Popover.test.tsx`**: dialog モードで `role=dialog`・`aria-haspopup=dialog`、focus-out クローズ、Escape クローズ、`closeAndRestoreFocus` のトリガー focus、`children` render-prop の `close` 注入
- **shiftX クランプ（レビュー P-003 反映）**: happy-dom は layout を持たず `getBoundingClientRect()` が全 0 を返すため DOM 結合テストだけでは検証できない。shiftX 算出を純関数（`rect.left/right` + `window.innerWidth` + margin → shift 量）に切り出して単体テストする。DOM 結合は `Element.prototype.getBoundingClientRect` を vi でスタブし `window.innerWidth` を上書きして「open 後に panel の `style.transform` が `translateX(...)` を含む」を1ケースのみ確認
- **`useRovingMenu`**: `<Menu>`/`<Popover>` 経由で間接カバー。`itemRole="menuitemradio"` + `initialIndex` の着地は Popover/FilterBar 経由で1ケース
- **FilterBar 移行ガード（レビュー P-001 反映）**: `FilterBar.test.tsx` の既存2ケースはタグ optimistic のみで Date/Visibility popover を一切カバーしないため「グリーン維持」ではガードにならない。移行後動作を検証するテストを新規追加する — VisibilityPopover（menuitemradio の `initialIndex` 着地・aria-checked・選択で close）、DatePopover（role=dialog / Escape / focus-out / clear / 閉じる）
- **既存テストの扱い**: `NoteActionsMenu.test.tsx`（aria-disabled roving 残留・Escape 復帰の基準）をリグレッションガードとしてグリーン維持。移行で DOM 構造（aria-label・role・textContent）が変わらないよう実装。`FilterBar.test.tsx` の既存2ケースもグリーン維持するが、popover 移行のガードにはならない点に留意

## レビュー履歴

### 1周目
**修正した点**:
- 要件P-001 / アーキP-001（index 採番の単一真実源）: `<Menu>` を `Children.toArray` + MenuItem 型抽出方式に確定。`querySelectorAll` 依存を排し UserMenu の info/error 混在ノード問題を解決（API設計節 + ADR-001 補足）
- 要件P-001（FilterBar ガード不足）: `FilterBar.test.tsx` の既存2ケースは Date/Visibility popover をカバーしないため「グリーン維持」ではガードにならないと訂正。VisibilityPopover/DatePopover の移行テストを新規追加と明記（ステップ9 DOM 不変条件 + テスト方針）
- 要件P-002 / アーキP-002（UserMenu disabled / danger hover）: UserMenu の native disabled→aria-disabled 変換と pending 視覚表現、danger×disabled hover の `not-aria-disabled:` ガード統一の挙動変化を明記。受け入れ基準をステップ8に追加、ADR-003 Consequences に挙動変化を追記
- アーキP-003（shiftX テスト）: happy-dom で getBoundingClientRect=0 のため shiftX 算出を純関数に切り出して単体テスト、DOM 結合はスタブで1ケースに変更（テスト方針）
- アーキS-002（トリガー onClick 責務境界）: 内部 open 所有（3メニュー）と外部 open 所有（FilterBar）で triggerProps.onClick の合成方法を明確化（API設計節）

**見送った提案とその理由**:
- 要件S-001（スコープ拡張の出典明記）: スコープ節は目的節と ADR で出典追跡可能なため軽微。本文に経緯記載済みで対応不要と判断
- アーキS-003（MenuItem key 戦略）: 実装詳細レベル。Children.toArray の index を key に使えば足り、計画段階で固定不要

### 2周目
**修正した点**:
- 要件P-001（VisibilityPopover ハイライト方針）: menuitemradio は共通 `menuItem` をそのまま適用せず `focus:`→`focus-visible:` のみ揃え、`data-[active]` 選択中表示を維持する方針をステップ9に明記

**取り込んだ改善提案**:
- アーキS-001（useRovingMenu index 規律）: itemCount は呼び出し側責務、DOM query は focus 専用の規律をステップ4に明記
- 要件S-001（UserMenu の danger 限定 disable）: pending 中 disable は danger 項目のみという限定条件をステップ8 受け入れ基準に追記
- アーキS-002 / 要件S-002（onMouseDown 方針・トリガー複合構造）: VisibilityPopover は preventDefault 非付与の現状維持、trigger の chip/× 複合構造で triggerProps をトグルボタンのみに配る方針をステップ9に明記

**この周の結論**: アーキ・リスク視点は問題点ゼロ。要件視点の P-001 を反映済み。残課題なし。
