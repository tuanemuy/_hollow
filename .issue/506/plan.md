# 実装計画 — Issue #506: 非モーダル Popover（DatePopover）の role=dialog と初期フォーカス/フォーカストラップの扱いを整理する

**Issue:** #506
**作成日:** 2026-07-01
**複雑度:** 中〜大規模

---

## 目的

非モーダル `Popover`（dialog モード）で「`role="dialog"` を名乗るのに open してもフォーカスがトリガーに留まる」乖離を解消する。3択（1: role 維持＋初期フォーカス／2: role 軽量化／3: 現状維持）のうち**選択肢1**を採用し、非モーダルのまま `role="dialog"` を維持したうえで、open 時にパネル内の最初の操作可能要素へ初期フォーカスを移す挙動をプリミティブ層に追加する。フォーカストラップは追加しない（非モーダル維持）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 実装ステップ | 検証ステップ |
|---|---|---|---|---|
| AC-1 | dialog モードの `Popover` は open **遷移時（閉→開）**、opt-in（`initialFocus`）が有効ならパネル内の最初の操作可能要素へフォーカスを移す | Issue「やりたいこと」選択肢1 / ADR-001 | 1, 2 | 6 |
| AC-2 | opt-in を渡さない場合は初期フォーカスがパネル内へ移らない（トリガー外へ移動しない＝後方互換） | 影響最小化 / ADR-001 opt-in 根拠 / arch S-004・coverage S-002 | 1, 2 | 6 |
| AC-3 | FilterBar（note/list）の DatePopover を開くと先頭のプリセットボタンへフォーカスが移る | Issue 対象 / ADR-001 | 3 | 6 |
| AC-4 | PublicTopControls（public）の DatePopover を開くと先頭のプリセットボタンへフォーカスが移る（同一 UI の一貫性） | 調査で判明した第2の dialog consumer / ADR-001 | 4 | 6 |
| AC-5 | `role="dialog"` と `aria-haspopup="dialog"` は変更しない（意味論維持） | ADR-001（選択肢1、選択肢2 不採用） | 1, 3, 4 | 6 |
| AC-6 | フォーカストラップは追加しない。Escape クローズ・外側 mousedown/Tab-out dismiss・閉じ時のトリガーへの focus 復帰は従来どおり動作する | #467 ADR「non-modal by design」/ ADR-001 | 1 | 6 |
| AC-7 | menu / listbox モード（roving）は初期フォーカス挙動が二重化せず従来どおり（`initialFocus` が渡っても dialog 以外では構造的に無効） | 二層設計尊重 / ADR-001 / arch S-001 | 1, 2, 5 | 6 |
| AC-8 | DirectoryTreeSelect（dialog モードだが自前で検索入力へフォーカス）は挙動不変 | スコープ最小化 / ADR-001 | 5 | 6 |
| AC-9 | dialog を開いたまま再レンダー/navigation しても初期フォーカスをパネル先頭へ奪い戻さない（閉→開の立ち上がりエッジでのみ 1 回発火） | coverage P-001 / #467 `useRovingMenu` の `prevOpenRef` 前例 / ADR-001 | 1 | 6 |

## スコープ

### 含まれないもの
- **DirectoryTreeSelect の初期フォーカス実装の置き換え** — 既に consumer 側で `setTimeout(() => searchRef.current?.focus(), 0)` により検索 combobox へフォーカスしており、AC を満たしている。`initialFocus` を opt-in させず自前実装を維持する（二重フォーカス・タイミング回帰を避ける）。
- **モーダル `<Dialog>` 系（NotePickerDialog / モバイル絞り込みシート / SearchFilterDrawer）** — 素の `<button aria-haspopup="dialog">` から別系統のトラップ有りモーダルを開く箇所で、本 Popover プリミティブとは無関係。
- **フォーカストラップの導入** — 非モーダル設計を意図的に維持（ADR-001「なぜトラップを入れないか」）。
- **focusable セレクタの共有モジュール抽出** — Dialog が使うのは close ボタンを除外した**フィルタ版** `INITIAL_FOCUS_SELECTOR`、本用途が必要とするのは close 除外不要の**非フィルタ版** `FOCUSABLE_SELECTOR` で必要形が異なる。共有すると呼び出し側で分岐が要り、純粋な文字列定数の二重定義（YAGNI 許容範囲）より複雑になるため見送る。`usePopover` に `FOCUSABLE_SELECTOR` をローカル定義し相互参照コメントを付す（ADR-001 トレードオフ）。
- **DatePopover 開いたまま navigation 後に focus が body へ落ちる件** — 既存の非 roving 挙動で本 Issue の「初期フォーカス」とは別問題。対象外。

## 調査結果

- 関連ファイル:
  - `app/components/common/usePopover.ts` — 第1層プリミティブ。dismiss（外側 mousedown / Escape / focus-out）・`aria-*` 配線・トリガーへの focus 復帰（`closeAndRestoreFocus`）・viewport clamp を所有。`panelRef`（`setPanelRef`）を握る。**初期フォーカスの追加先。**
  - `app/components/common/Popover.tsx` — `usePopover` を使う render-prop ラッパ。`haspopup` で menu/listbox/dialog の3ブランチを別 JSX でレンダー（a11y lint のため role は literal）。dialog ブランチには mousedown preventDefault を意図的に付けない（フォーム入力のため）。**opt-in prop を受けて usePopover へ渡す。**
  - `app/components/common/Dialog.tsx` — モーダル Dialog。`FOCUSABLE_SELECTOR` / `INITIAL_FOCUS_SELECTOR` と rAF ベースの初期フォーカス・トラップの参照実装（セレクタ定数の踏襲元）。
  - `app/components/common/useRovingMenu.ts` — 第2層。`initialIndex` を明示指定し `useEffect` で `items?.[activeIndex]?.focus()`（rAF 不使用、happy-dom で動作）。dialog 初期フォーカスの実装様式の手本。
  - `app/components/note/list/FilterBar.tsx` — `DatePopover`（`haspopup="dialog"`、初期フォーカス無し）。パネル先頭 focusable は `DateRangeFields` のプリセットボタン。**opt-in 配線先。**
  - `app/components/public/PublicTopControls.tsx` — もう1つの `DatePopover`（`haspopup="dialog"`、初期フォーカス無し、ほぼ同一 UI）。**opt-in 配線先。**
  - `app/components/note/editor/DirectoryTreeSelect.tsx` — `haspopup="dialog"` だが consumer 側で自前フォーカス済み。**変更しない。**
  - テスト: `app/components/common/__tests__/Popover.test.tsx`（dialog モードの ARIA/dismiss/focus 復帰/clamp を happy-dom で固定。focus 系アサーションあり）、`app/components/note/list/__tests__/FilterBar.test.tsx`（DatePopover の open/Escape/閉じる/clear）、`app/components/public/__tests__/PublicTopControls.test.tsx`。
- あるべきアーキテクチャ:
  - これはフロントエンド a11y の変更でドメイン/アプリケーション/アダプター層への影響は無い。
  - #467 ADR-001 の二層設計を正とする: 「dismiss/ARIA/focus 復帰は第1層 `usePopover` に集約、roving は第2層」。初期フォーカス（open 時にパネル内へ focus）は focus 復帰の対称カウンターパートとして**第1層**に置く。
  - スタイル/状態は既存規約（`data-*` 属性・utility-first）を踏襲。今回は focus 配線のみで新規スタイルは無い。
- 既存実装の状態:
  - dialog モードは role/ARIA/dismiss/focus 復帰は揃っているが、初期フォーカスだけ欠けている（DirectoryTreeSelect を除く）。乖離しているのは 2 つの DatePopover。
  - `usePopover` は既に `panelRef` を持つので、初期フォーカスの実装に必要な足場は揃っている。
- 依存関係:
  - `usePopover` / `Popover` はアプリ内の全 Popover（menu/listbox/dialog、UserMenu・ViewSwitcher・各 FilterBar・DirectoryTreeSelect 等）の基盤。**opt-in 方式にすることで、既存 consumer は prop 未指定で完全に無影響**（AC-2/AC-7/AC-8）。

## 設計

### ドメインモデルへの影響
なし（フロントエンドの a11y／フォーカス配線のみ。ドメイン概念・不変条件・ポートに変化なし）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
二層設計に沿ってプリミティブ（内側）→ consumer（外側）→ テストの順で影響を整理する。

1. **第1層 `usePopover`（プリミティブ・内側）** — 初期フォーカスの本体を追加。
   - 新オプション `moveInitialFocus?: boolean`（default false）。
   - **閉→開の立ち上がりエッジでのみ発火するガード**（AC-9）: `prevOpenRef`（`useRef`）で直前の `open` を保持し、`useEffect` 内で `!prevOpen && open`（かつ `moveInitialFocus`）のときだけ初期フォーカスを移す。末尾で `prevOpenRef.current = open` を更新。これにより DatePopover を開いたまま**パネル内で navigation を伴う操作全般**（プリセット選択に限らず、date input 編集で `onChangeDate → run()` する場合も含め、いずれも popover を閉じない＝`setOpenPopover(null)` を呼ばない）が起き effect が再評価されても、ユーザーが移した先からフォーカスを奪い戻さない。同一シナリオで再発火を抑止している `useRovingMenu`（`prevOpenRef`）の前例に倣う。
   - `useEffect`（deps `[open, moveInitialFocus]`）で、立ち上がりエッジのとき `panelRef.current` 内の最初の focusable 要素へ `.focus()`。roving 第2層と同じ「rAF 不使用の useEffect」様式（happy-dom で動作。`.focus()` は happy-dom で機能し、既存の roving/focus 復帰テストが実証済み。動かないのは layout/`getBoundingClientRect` のみ）。
   - focusable セレクタは `Dialog.tsx` の `FOCUSABLE_SELECTOR`（非フィルタ版）を踏襲したローカル定数を**同名 `FOCUSABLE_SELECTOR`** で定義（相互参照コメント付き）。Dialog の `INITIAL_FOCUS_SELECTOR` は `:not([data-dialog-close])` を含むフィルタ版の別物なので、そちらとは別。除外リスト（close ボタン除外）は不要 — DatePopover の先頭 focusable はプリセットボタンで意味のある操作要素のため。
   - JSDoc に「dialog モードは初期フォーカスを opt-in で移す（menu/listbox は第2層 roving が持つので指定しない。自前管理する consumer は指定しない）」を明記。
2. **第1層 `Popover`** — boolean prop `initialFocus?: boolean` を追加。`usePopover` へは **`moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false`** としてコードでゲートして渡す（arch S-001）。これにより menu/listbox に `initialFocus` が渡っても roving との二重フォーカスが構造的に表現不能になり、ADR-001 の「dialog ブランチでのみ意味を持つ」契約を JSDoc 運用ではなくコードの不変条件へ昇格させる。既存 3 ブランチの JSX 構造・role literal・mousedown ガードは不変。JSDoc に「dialog モードで open 時のみ有効な opt-in」を明記。
3. **consumer（外側）** — 2 つの `DatePopover`（FilterBar / PublicTopControls）に `initialFocus` を付与。それ以外の Popover 利用箇所（DirectoryTreeSelect 含む）は無変更。

## 実装ステップ

依存方向（内側のプリミティブが先）に並べる。

### 1. `usePopover` に初期フォーカス（opt-in）を追加

- **対象ファイル:** `app/components/common/usePopover.ts`
- **変更内容:**
  - `UsePopoverOptions` に `moveInitialFocus?: boolean` を追加。
  - ローカル定数 `FOCUSABLE_SELECTOR`（`Dialog.tsx` の同名**非フィルタ版**を踏襲。`a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])`）を定義し、由来コメント（「Dialog の `FOCUSABLE_SELECTOR`（非フィルタ版）を踏襲。DatePopover の先頭 focusable は preset ボタンで close 除外は不要」）を付す。Dialog の `INITIAL_FOCUS_SELECTOR`（`:not([data-dialog-close])` 付きフィルタ版）とは別物である旨も明記。
  - `prevOpenRef`（`useRef<boolean>`、**初期値 `false`**）を追加し、閉→開の立ち上がりエッジを判定する（AC-9）。初期値は `useRovingMenu` 準拠の `false` とする（`useRef(open)` にしない）。将来 open 状態でマウントされる dialog を作った場合でも、マウントが立ち上がりエッジとして扱われ初期フォーカスが漏れず Dialog の挙動と揃う（arch S-002）。
  - `useEffect`（deps `[open, moveInitialFocus]`）: `const rising = open && !prevOpenRef.current;` → `if (moveInitialFocus && rising) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();` → 末尾で `prevOpenRef.current = open;`。要素が無ければ no-op。開いたまま再レンダーされても `rising` が false なので再フォーカスしない（`useRovingMenu` の `prevOpenRef` に倣う）。
  - モジュール JSDoc / 関数 JSDoc に初期フォーカスの責務と「dialog 専用の opt-in、閉→開遷移でのみ発火、menu/listbox は roving（第2層）が持つ」旨を追記。
- **理由:** focus 復帰の対称カウンターパートを同じ第1層へ集約（#467 ADR-001）。`panelRef` は既に第1層が握るため追加の配線が不要。opt-in なので既存 consumer は無影響（AC-2/AC-7/AC-8）。`prevOpenRef` ガードで「開いたまま navigation」時の奪い戻しを防ぐ（AC-9）。Escape/dismiss/focus 復帰の既存ロジックには一切触れない（AC-6）。

### 2. `Popover` に `initialFocus` prop を追加して透過

- **対象ファイル:** `app/components/common/Popover.tsx`
- **変更内容:** `PopoverProps` に `initialFocus?: boolean | undefined` を追加し、`usePopover({ ..., moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false })` に渡す（`haspopup` によるコードゲート）。JSDoc に「dialog モードで open 時にパネル内の最初の操作可能要素へ初期フォーカスを移す opt-in。menu/listbox では roving が初期フォーカスを持つため、渡ってもコードで無効化される」を追記。3 ブランチの JSX・role literal・dialog の mousedown 非ガードは不変。
- **理由:** プリミティブの opt-in を consumer から宣言的に配線できるようにする（AC-1）。dialog ゲートを JSDoc 運用ではなくコードに置くことで、menu/listbox への誤配線による roving との二重フォーカス（illegal state）を型/コードで排除する（AC-7、CLAUDE.md「illegal states を型で表現不能に」／ arch S-001）。

### 3. FilterBar の DatePopover を opt-in

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `DatePopover` 内の `<Popover haspopup="dialog" ...>` に `initialFocus` を付与。
- **理由:** open 時に先頭のプリセットボタンへフォーカスを移し、乖離を解消（AC-3/AC-5）。

### 4. PublicTopControls の DatePopover を opt-in

- **対象ファイル:** `app/components/public/PublicTopControls.tsx`
- **変更内容:** `DatePopover` 内の `<Popover haspopup="dialog" ...>` に `initialFocus` を付与。
- **理由:** 同一 UI の dialog Popover を一貫させる（AC-4/AC-5）。

### 5. DirectoryTreeSelect / menu・listbox 系は無変更であることの確認

- **対象ファイル:** `app/components/note/editor/DirectoryTreeSelect.tsx`（および menu/listbox 利用箇所全般）
- **変更内容:** コード変更なし。`initialFocus` を渡さないことで従来挙動（DirectoryTreeSelect は自前フォーカス、menu/listbox は roving）を維持することをレビュー観点として明記。
- **理由:** 二重フォーカス・タイミング回帰の回避、ブラスト半径の最小化（AC-7/AC-8）。

### 6. テスト追加

- **対象ファイル:**
  - `app/components/common/__tests__/Popover.test.tsx`
  - `app/components/note/list/__tests__/FilterBar.test.tsx`
  - `app/components/public/__tests__/PublicTopControls.test.tsx`
- **変更内容:** 下記「テスト方針」参照。
- **理由:** 新挙動（AC-1〜AC-4）と後方互換（AC-2）を happy-dom で固定。

## 設計判断

- **選択肢1を採用**（非モーダル維持 ＋ dialog パネル内へ初期フォーカス、トラップ無し）。詳細と選択肢2/3の不採用理由、opt-in を選ぶ理由、トラップを入れない理由は `.issue/506/adr.md` ADR-001 を参照。
- 初期フォーカスの責務は**第1層 `usePopover`** に置く（focus 復帰の対称カウンターパート、二層設計に整合）。閉→開の立ち上がりエッジでのみ発火する `prevOpenRef` ガードを付け、開いたまま navigation での奪い戻しを防ぐ（`useRovingMenu` 前例）。
- consumer への配線は**opt-in（`initialFocus`）** とし、`Popover` 側で `haspopup === "dialog"` にコードゲートして menu/listbox（roving）との二重フォーカスを構造的に排除。自前フォーカスの DirectoryTreeSelect は無変更。

## リスクと注意点

- opt-in ゆえ将来 `haspopup="dialog"` を追加する際に `initialFocus` を渡し忘れると乖離が再発しうる → プリミティブ JSDoc に方針を明記して緩和。
- menu/listbox に `initialFocus` が誤って渡ると roving と二重フォーカス → `Popover` 側で `haspopup === "dialog"` にコードゲートし構造的に無効化（AC-7）。
- 「開いたまま navigation」で初期フォーカス effect が再発火し、ユーザーの移動先を奪い戻す回帰 → `prevOpenRef` の立ち上がりエッジガードで抑止（AC-9、`useRovingMenu` 前例）。
- focusable セレクタが `Dialog.tsx` と重複 → 共有抽出は「Dialog はフィルタ版・本用途は非フィルタ版で必要形が異なり、共有すると分岐が要る」ため見送り、ローカル定義＋相互参照コメントで許容（ADR トレードオフ）。
- モバイルの DatePopover は下寄せシート。先頭 focusable は**プリセットボタン**（date input ではない）なので、フォーカスでネイティブ日付ピッカーやソフトキーボードが暴発しない。
- DatePopover を開いたまま navigation した後に focus が body へ落ちる既存挙動は本 Issue の対象外（初期フォーカスとは別問題）。誤って修正対象に含めない。
- happy-dom は layout を持たない（`getBoundingClientRect` は全 0）が `.focus()` は機能する（既存の roving/focus 復帰テストが実証）。よって初期フォーカスはユニットテスト可能。

## テスト方針

- **Popover.test.tsx（プリミティブ、happy-dom）:**
  - `initialFocus` 有りで dialog を open すると、パネル内の最初の focusable（ハーネスに複数ボタンを置き先頭を検証）へ `document.activeElement` が移ることを固定（AC-1）。あわせて**同一テストで `expect(panel()).not.toBeNull()`** をアサートし、初期フォーカス直後に `onFocusOut` 誤発火でパネルが閉じない不変条件を直接ガードする（arch S-002 / coverage S-002）。
  - `initialFocus` 無し（既存 Harness）では open 後も初期フォーカスがパネル内へ移らないことを、`activeElement === trigger`（happy-dom では成立しない）ではなく **`expect(panel()?.contains(document.activeElement)).toBe(false)`** で固定（AC-2、後方互換の回帰ガード。coverage S-002 / arch S-004）。
  - **開いたまま再レンダー/navigation のスモークガード（AC-9）:** `initialFocus` 有りで dialog を open → 初期フォーカスが先頭 focusable に当たったのを確認 → ユーザー操作を模してパネル内の別要素へ `.focus()` → open 維持のまま再レンダー（props 変更などで再コミット）→ `document.activeElement` が別要素のまま（先頭へ奪い戻されない）ことを固定。ただし初期フォーカス effect の deps は `[open, moveInitialFocus]` で不変のため、プレーンな `rerender()` では effect 自体が再実行されず `prevOpenRef` ガードの有無を厳密には判別しない（ガードが実際に効くのは `useRovingMenu` コメントが言う「Suspense 中断/再開で dep 変化なしに effect 再発火」型シナリオで、happy-dom の `rerender()` では再現困難）。よって本ケースは `prevOpenRef` ガードの証明ではなく「前例（`useRovingMenu`）準拠＋開いたまま再レンダーで焦点が動かないスモーク」の位置づけとする（arch S-001）。過度なテスト作り込みはしない。ガード自体は本番の RSC ナビゲーション（当コードベースで effect 再発火が起きる旨を roving コメントが実証）に対し正しく必要であり、実装は据え置く。
  - `Popover` の `haspopup="menu"`/`"listbox"` に `initialFocus` を渡してもパネル内へ初期フォーカスが移らない（コードゲートで無効）ことを固定（AC-7、arch S-001）。
  - 既存の Escape/外側 mousedown/focus-out/`close` 復帰/clamp テストが緑のままであること（AC-6 の非回帰）。
- **FilterBar.test.tsx:** 「期間」トリガー click → `[role="dialog"]` パネルの先頭プリセットボタンへフォーカスが移ることを `document.activeElement` で固定（AC-3）。既存の open/Escape/閉じる/clear テストは維持。
- **PublicTopControls.test.tsx:** 同様に DatePopover open で先頭プリセットボタンへフォーカスが移ることを固定（AC-4）。
- **回帰確認:** menu/listbox（ViewSwitcher・VisibilityPopover・TagPicker）の roving 初期フォーカステスト、DirectoryTreeSelect の検索フォーカステストが不変であること（AC-7/AC-8）。
- 最後に `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit`。

## レビュー履歴

### 1周目

**修正した点**:
- **P-001（coverage）**: 初期フォーカスの `useEffect` に「閉→開の立ち上がりエッジでのみ発火」する `prevOpenRef` ガードを追加する設計を明記（step 1・設計 UI・設計判断・リスク）。`useRovingMenu` の `prevOpenRef` 前例を根拠に付す。DatePopover を開いたまま filter navigation（`selectPreset` は popover を閉じない）で effect が再評価されても初期フォーカスを奪い戻さない旨を記述。対応する **AC-9** を新設し、テスト方針に「開いたまま再レンダー/navigation してもユーザーの移動先を奪い戻さない」回帰ガードケースを追加。

**取り込んだ改善提案**:
- **arch S-001 / coverage S-004（dialog ゲートのコード化）**: `Popover` で `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` とコードゲートし、menu/listbox への誤配線による roving との二重フォーカスを構造的に排除（設計 item 2・step 2・AC-7 補強・テスト方針に menu/listbox 無効化ケース追加）。CLAUDE.md「illegal states を型で表現不能に」に沿った不変条件の昇格として記述。
- **arch S-003（命名）**: `usePopover` のセレクタ定数を踏襲元と同名の **`FOCUSABLE_SELECTOR`（非フィルタ版）** に決定し、Dialog の `INITIAL_FOCUS_SELECTOR`（フィルタ版）とは別物である旨の相互参照コメント方針を明記。「共有抽出見送り」の根拠を「フィルタ版／非フィルタ版で必要形が異なり共有すると分岐が要る」に精緻化（スコープ・設計・リスク・ADR）。
- **arch S-002 / coverage S-002（開いたまま回帰アサート）**: Popover.test.tsx の AC-1 ケースに `expect(panel()).not.toBeNull()` を併記し、`onFocusOut` 誤発火による退行を直接検知する方針を追加。
- **coverage S-002 / arch S-004（AC-2 の検証方法）**: AC-2 本文を「初期フォーカスがパネル内へ移らない（トリガー外へ移動しない）」に改め、検証を `panel()?.contains(document.activeElement) === false`（happy-dom で不安定な `activeElement === trigger` を避ける）で固定する方針を明記。
- **coverage S-001（AC 表の検証ステップ紐づけ）**: 受け入れ基準表に「検証ステップ」列を追加し、各 AC 行に検証（step 6 テスト）を紐づけ。
- **coverage S-003（ADR Status）**: adr.md ADR-001 の Status を `Proposed` → `Accepted` に更新。

**見送った提案とその理由**:
- なし（必須修正・改善提案をすべて取り込み）。

### 2周目

両視点とも問題点ゼロで収束。軽微な改善提案3件（AC-9根拠の一般化・回帰テストのスモーク位置づけ明記・prevOpenRef初期値明記）を反映して終了。
