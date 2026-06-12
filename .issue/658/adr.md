# ADR — Issue #658: P10 FilterBar「+ タグ」ゴーストチップ / タグピッカー

## ADR-001: タグピッカーは検索入力なしのマルチセレクト listbox（Popover listbox モード）にする

### Status
Proposed

### Context
#626 ADR-008 はトリガーの a11y 契約（`aria-haspopup="listbox"`）のみ定め、ピッカー UI の設計は実装フォローアップに委ねた。選択肢は:

1. `Popover` の listbox モード（#649 ViewSwitcher で実装済み）+ `useRovingMenu({ itemRole: "option" })` によるスクロール式マルチセレクト listbox
2. `NotePickerDialog` / `DirectorySelectField` 流の combobox（検索入力 + listbox）
3. 専用ダイアログ（`NotePickerDialog` の流用）

### Decision
1 を選ぶ。`aria-haspopup="listbox"` というトリガー契約に最も素直に一致し、既存部品（`Popover` listbox ブランチ・`useRovingMenu`・`popoverSheetPanel`）の組み合わせだけで実装でき、新規部品・新トークンが不要（ADR-008 の精神と同じ）。タグはノートと違い件数が人力で付与する規模に収まるため、検索入力よりも「全件を件数バッジ付きで一覧し、複数トグルする」操作が合う。マルチセレクトのため選択後もパネルは閉じず、`aria-multiselectable="true"` を付ける（`Popover` に任意 prop `multiselectable` を追加して listbox 要素へ伝播）。

2 はタグが数百件規模になった時のフォローアップとして残す（combobox 化するとトリガーの `aria-haspopup` も再考が必要）。

### Consequences
- 良い点: 契約準拠・最小差分・既存のキーボード/フォーカス/外側クリック挙動をそのまま継承。モバイルは `popoverSheetPanel` により自動でボトムシート化
- トレードオフ: タグが非常に多いユーザーではスクロールが長くなる（`max-h` + overflow で抑制。検索が要る規模になったら combobox 化を別 Issue で）

---

## ADR-002: 既存「もっと見る (+N)」トグルは残置し「+ タグ」と併存させる

### Status
Proposed

### Context
FilterBar には既に #354 由来の「もっと見る (+N)」ゴーストチップ（13件目以降のタグチップをインライン展開）がある。「+ タグ」ピッカーも全タグへ到達できるため、機能が一部重複する。選択肢は (a) もっと見るを削除してピッカーに一本化、(b) 併存。

### Decision
(b) 併存。理由:
- 本 Issue のスコープは ADR-008 の「+ タグ」追加であり、#354 の挙動変更は要件外。削除はモバイルの横スクロール文脈での回帰検証を別途要する
- 役割が異なる: もっと見るは「件数バッジを見ながらタグ群を一覧する」インライン展開、「+ タグ」は「選択操作に特化したピッカー」。ADR-008 も並び順を「適用中チップ群 → + タグ → …」とし、チップ群（トグル含む）の置換を要求していない

一本化が望ましいと判断されれば別 Issue で扱う。

また、チップ列の表示は既存どおり `tags.slice(0, VISIBLE_TAG_LIMIT)` を選択状態と無関係に維持する。ピッカー導入で「13件目以降のタグを選択する」経路が初めて生まれ、選択中なのに対応チップがバーに現れないケースが新規に露出するが、解除は「もっと見る」展開・ピッカー再オープン・クリア × のいずれでも可能であり、`visibleTags` の並べ替え（選択中タグの繰り上げ）は #354 のチップ列挙動の変更にあたるため初版では見送る（既知の制限として手動テストに明記。繰り上げが必要なら別 Issue）。

### Consequences
- 良い点: スコープ最小・既存テスト非破壊。デザインモックとの差分は「+ タグ」の追加のみで完結
- トレードオフ: 全タグへ到達する導線が一時的に2つになる（視覚上は破線チップの語彙内に収まる）。VISIBLE_TAG_LIMIT 超のタグを選択した場合、チップ列に対応チップが見えない既知の制限が残る

---

## ADR-003: モバイルのボトムシートは popoverSheetPanel の既存パターンを使う

### Status
Proposed

### Context
Issue は「モバイルはボトムシート想定（モックは閉状態のみ）」とする。専用のボトムシート部品（ドラッグハンドル・オーバーレイ付き）を新設するか、`popoverSheetPanel`（#588 ADR-003: < sm で `fixed` 全幅・下部アンカーのシートに変形する共有パネルスタイル）に乗るかの選択。

### Decision
`popoverSheetPanel` に乗る。FilterBar の期間 / 公開状態ポップオーバーが既に同じ `FILTER_POPOVER_PANEL`（= `popoverSheetPanel` ベース）でモバイルシート化しており、タグピッカーだけ別仕立てにすると FilterBar 内で挙動が割れる。モックが閉状態のみでシートの詳細仕様を定めていない以上、確立済みのシート表現が「想定」を満たす最小の解。

### Consequences
- 良い点: 実装ゼロ追加でボトムシート要件を満たし、FilterBar 内の3ピッカーの挙動が揃う
- トレードオフ: ドラッグで閉じる等のネイティブシート的操作はない（既存シートと同等。必要なら共通部品の改善として別途）

---

## ADR-004: title はデバイスを問わず常時併記する（#626 ADR-008 からの意図的逸脱）

### Status
Proposed

### Context
#626 ADR-008 とモバイルモック（`spec/design/pages/mobile/P10-home.html`）は「title はデスクトップのみ・モバイルは aria-label のみ」とする（タッチ主体のため）。一方、実装は単一コンポーネントでデバイス別に属性を出し分けない。

### Decision
`title="タグで絞り込み"` を常時描画する。タッチデバイスでは title は無害に無視され、origin/main のクリア ×（#649、`FilterBar.tsx` の常時 title）と同じ前例に揃う。デザインドキュメント原文・モバイルモックとの字面上の差分は、この前例準拠による意図的な逸脱として本 ADR に記録する（PR レビューや spec-sync での再指摘防止）。

### Consequences
- 良い点: デバイス判定コードが不要で、#649 の確立済みパターンと一貫する
- トレードオフ: モバイルモックの字面（title なし）とは一致しない（挙動上の差はない）

---

## useRovingMenu に setActiveIndex を公開してクリック時の roving 同期を実現する

### コンテキスト
計画ステップ4 は「option のクリックハンドラで該当 index に `activeIndex` を同期する」と定めるが、`useRovingMenu` は `activeIndex` / `getTabIndex` / `onKeyDown` しか返しておらず、呼び出し側から index を更新する手段がなかった（変更対象ファイルとして `useRovingMenu.ts` は計画に明記されていない）。

### 決定内容
`useRovingMenu` の戻り値に `setActiveIndex(index)` を追加し、TagPickerPopover の option クリックで呼ぶ。既存の focus-mirror effect（`activeIndex` 変更時に該当 `[role=option]` へ `.focus()`）がそのまま働くため、クリックした option にフォーカスも揃う。

### 理由
hook 内部の state setter をそのまま公開する最小変更で、既存利用箇所（Menu / VisibilityPopover / ViewSwitcher）は非破壊。クリック後も開いたままのマルチセレクト listbox でのみ必要になる事情は型の JSDoc に記録した。代替案（FilterBar 側で roving を自前実装、または hook にクリックイベント検知を内蔵）はどちらも重複・複雑化が大きい。

## ADR-005: usePopover の focus-out close は relatedTarget=null を無視する

### コンテキスト
ブラウザ検証 TC-4 で、タグピッカーの option クリック → URL ナビゲーション完了後にパネルが自動クローズした。原因調査（DOM ノードへの expando マーカー + focusin/focusout ログ）で FilterBar の再マウントではないことを確認。実際の経路は、ナビゲーション確定時の RSC 再レンダーのコミットで、useRovingMenu がフォーカスしていた option から `focusout`（`relatedTarget: null`、フォーカスは `<body>` に落ちる）が発火し、`usePopover.onFocusOut` がコンテナ外への移動と判定して `onOpenChange(false)` を呼んでいた。期間/公開状態ポップオーバーは選択即クローズのため露出しなかった。

### 決定内容
`usePopover.onFocusOut` で `relatedTarget === null` の blur を無視する。

### 理由
`relatedTarget=null` は「フォーカスの喪失」（ウィンドウ blur、または React のコミットによるフォーカスノードの差し替え）であり、ユーザーがフォーカスを外へ「移動」した操作ではない。ユーザー起点の dismiss は引き続き全経路が機能する: 外側クリックは document `mousedown` リスナー、Escape は document `keydown`、Tab アウトは非 null の `relatedTarget` を伴う focus-out。共有プリミティブ側の 1 行ガードで全ポップオーバーの再発を防げるため、FilterBar 個別対応（state のリフトアップや context 化）より小さく堅牢。回帰は `Popover.test.tsx` の「stays open on focus-out with relatedTarget=null」で担保（jsdom/happy-dom では RSC ナビゲーション自体は再現できないため、close 経路の単位で固定する）。

## ADR-006: roving フォーカスの復元は「コミット後の every-commit effect + closed→open 遷移ガード」で行う

### コンテキスト
ブラウザ検証 TC-5 step4 で、タグピッカーの option トグル後（クリック / Enter とも）にフォーカスが `<body>` へ落ち、以降の矢印キーが効かなくなった（ADR-005 のガードでパネル自体は開いたまま）。原因を計装（focusin/focusout・rAF・effect ライフサイクル・panelRef コールバックのログ）で追跡した結果、フィルタナビゲーション確定時の RSC 再レンダーで次の 2 つが起きていた:

1. コミット中にフォーカス中の option ノードが差し替わり、`focusout`（`relatedTarget: null`）とともにフォーカスが `<body>` へ silent に落ちる。このとき `panelRef` コールバック ref も一旦 detach（null）され、re-attach は後続のコミットチャンクまで遅延する — focusout 時点や直後の rAF では `panelRef.current === null` のため、イベント駆動の復元は不可能
2. `useRovingMenu` の「open 時に `activeIndex` を `initialIndex` へリセットする」effect が、**deps（`open`/`initialIndex`）が変化していないのに再実行**される（同一フックインスタンス・同一 deps で再発火することをインスタンス ID ログで確認 — サスペンド/再開に伴う effect の破棄・再実行）。これにより roving 位置が `initialIndex`（0）へ巻き戻っていた

### 決定内容
`useRovingMenu` に 2 つの最小変更を加える:

1. **dep なし effect による復元**: 毎コミット後に「`open` かつ `document.activeElement === document.body`」のときだけ activeIndex の option へ `.focus()` する effect を追加。React は同一コミット内で ref attach → effect の順を保証するため、ref の detach/再 attach タイミングに依存しない唯一の確実なフックポイント。`activeElement` ガードにより、ウィンドウ blur（option が activeElement のまま）やユーザーが別要素へ移動したケース（activeElement はその要素）でフォーカスを奪わない
2. **リセット effect の closed→open 遷移ガード**: `prevOpenRef` で直前の `open` を覚え、実際に false→true 遷移したときだけ `setActiveIndex(initialIndex)` する。サスペンド再開による同一 deps での effect 再発火では roving 位置を保持する

### 理由
- focusout / rAF ベースのイベント駆動復元は実機計装で panelRef detach タイミングと衝突して機能しないことを確認済み（上記 1）
- 共有フック側の修正により、クリック後も開き続けるマルチセレクト listbox 全般の再発を防げる。既存利用箇所（Menu / VisibilityPopover / ViewSwitcher）は選択即クローズのため挙動不変（リセットは従来どおり open 遷移時に走る）
- 回帰は `FilterBar.test.tsx`「restores focus to the active option when a commit drops focus to <body>」で担保（jsdom では RSC 再レンダーを再現できないため、blur によるフォーカス喪失 → 復元の経路単位で固定）

### Consequences
- 良い点: トグル後（RSC 再レンダー後）も roving 位置のままフォーカスが復元され、ArrowDown/Enter の連続操作が途切れない（AC-6）
- トレードオフ: dep なし effect が毎コミット走る（ガード 2 比較のみで実質コストなし）。`initialIndex` がオープン中に変化しても追従しなくなるが、「On (re)open に着地位置を決める」という元の意図と一致する

## 問題2（TC-E1: 連続トグルの lost update）は既存バグとして修正見送り

ピッカー option の高速連続クリック（同一タスク内 ×3）で最後の 1 件しか URL に残らない事象は、**既存のインラインタグチップの連打でも同一に再現**することをブラウザで確認した（チップ 3 連打 → `?tagNames=["test-tag-03"]` のみ）。`toggleTag` は main から変更なし（ピッカーは同じハンドラを共有）であり、本 Issue の新規コード起因ではない既存バグのため、スコープ外として修正しない。原因: `toggleTag` がレンダー時点の `optimistic.tagNames` スナップショットから次の配列を**事前計算**して `router.navigate` の search updater に固定値で渡すため、同一スナップショットを読んだ複数クリックが互いの更新を上書きする（last-write-wins）。修正方向: search updater 内で `prev.tagNames` を基準にトグルを計算する。別 Issue で対応する。

## ADR-005: TC-6 修正 — `popoverSheetPanel` 自体に `max-sm:fixed` ボトムシート化を実装

### Context
ブラウザ検証 TC-6 でモバイル幅のタグピッカーがボトムシートにならず、トリガー幅（56px）の縦長ストリップに崩れた。切り分けの結果、**既存の期間/公開状態ポップオーバーも同条件で同様に崩れていた**（実測: 期間パネル w=52.7px / position: absolute）。原因は共有定数 `popoverSheetPanel`（#587/#588）が `max-sm:left-0 max-sm:right-0 max-sm:w-auto` しか持たず、`max-sm:fixed` を欠いていたこと。パネルは `Popover` の `relative inline-flex` ラッパー内で `absolute` 配置されるため、`left-0/right-0` がチップ幅のラッパーを基準に解決され、フルワイドにならない（JSDoc の「full-width bottom-anchored sheet」と実装が乖離していた）。動作している public 側のシート（`public/styles.ts` / `PublicTopControls.tsx`）は `max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:rounded-b-none` を持つ。

### Decision
FilterBar 側（`FILTER_POPOVER_PANEL`）ではなく **共有定数 `popoverSheetPanel` に `max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:rounded-b-none` を追加**する。これにより期間/公開状態/タグピッカーの 3 消費者が一括で正しいシート挙動になる（public 側パターンと同形）。あわせてタグピッカーの option 行（`TAG_OPTION_ITEM`）に共有の `TOUCH_TARGET`（`max-sm:min-h-[44px]`）を追加し、モバイルでのタップターゲットを 44px に引き上げた（実測 34.6px → 44px）。

### ユニットテストが崩れを検出できなかった理由と対処
既存の構造アサーションは「パネル className が `popoverSheetPanel` 定数を含む」だけで、**定数自体の内容が誤っている場合にトートロジーで通過**していた。対処として、シート化を実際に成立させるユーティリティ（`max-sm:fixed` / `max-sm:bottom-0` / `max-sm:top-auto` / `max-sm:left-0` / `max-sm:right-0`）の存在を個別にピン留めするアサーションを追加した（jsdom では CSS 解決まではできないため、クラス文字列レベルでの担保が上限）。

### Consequences
- 良い点: AC-7 達成。#588 以来潜在していた期間/公開状態シートの崩れも同時に解消
- トレードオフ: `max-sm:mt-0` は `FILTER_POPOVER_PANEL` の `mt-2` を variant 順序で上書きする前提（Tailwind v4 の variant 後置ソート）。`VISIBILITY_OPTION_ITEM` 等の他 option 行への `TOUCH_TARGET` 展開は #649 ADR-011 の共通化課題に委ねる
