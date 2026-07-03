# PR #812 レビュー — Test 観点（Issue #506）

対象: `usePopover`/`Popover` の dialog 初期フォーカス（opt-in）と 2 つの DatePopover 配線。
計画: `.issue/506/plan.md`（AC-1〜AC-9 / テスト方針）。

実測: 3 テストファイル（Popover / FilterBar / PublicTopControls）= **84 tests all pass**。
非回帰確認として DirectoryTreeSelect / ViewSwitcher = 32 tests all pass。

## Test

### Blockers
なし

### Warnings

- **[W-001]** → Round 2 で対応済み（`Popover.test.tsx` に close→reopen 再アームケースを追加。リセット行を一時削除して当該テストが落ちること＝再アーム経路を確かに固定していることを確認済み）。prevOpenRef ガードの「立ち上がりエッジ再アーム（close→reopen で再びフォーカス移動）」が未テスト
  - 場所: `app/components/common/__tests__/Popover.test.tsx:613`（AC-9 スモークのみ）／実装 `app/components/common/usePopover.ts:236-240`
  - 理由: 現行テストは (a)「開いたまま再レンダーで奪い戻さない」（AC-9 スモーク）と (b)「初回 open でフォーカス」（AC-1）を押さえるが、**close で `prevOpenRef.current = open` が false に戻り、reopen が再び rising edge になる**という再アーム分岐を一度も踏まない。仮に実装が末尾更新 `prevOpenRef.current = open;` を落として `prevOpenRef.current = true` 固定に退行しても、AC-1（初回 open）も AC-9（rerender では effect が再発火しない）も緑のまま通過し、**close→reopen で二度目のフォーカスが移らない回帰を誰も検知しない**。これは happy-dom で素直に再現可能なテスト可能分岐であり、AC-9 が「happy-dom では厳密証明困難」とした prevOpenRef 本体（RSC 再発火シナリオ）とは別物。
  - 提案: Popover.test.tsx に close→reopen の 1 ケースを追加（open→先頭にフォーカス→trigger 再クリックで close→再度 trigger クリックで reopen→再び `document.activeElement === firstFocusable()`）。rising-edge の再アームを直接固定でき、AC-9 スモークの弱さ（下記 N-001）を実効的に補える。

### Notes

- **[N-001]** AC-9 スモークは plan L149 の位置づけどおり妥当。過剰でも過少でもない。ただし本質は「観測可能挙動（rerender で焦点が動かない）」の固定であって prevOpenRef ガード自体の証明ではない点は正しく認識されている（実装から `prevOpenRef` を削除しても deps `[open, moveInitialFocus]` 不変ゆえプレーンな `rerender()` では effect が再発火せず、このテストは通過する）。テストコメント（`app/components/common/__tests__/Popover.test.tsx:624-627`）とプランの記述が一致しており、意図的なトレードオフとして受容可能。W-001 の再アームケースを足せばガードの「観測可能な半分」まで押さえられる。

- **[N-002]** AC-2 の検証方法は plan の 1 周目修正（coverage S-002 / arch S-004）を正しく反映。`app/components/common/__tests__/Popover.test.tsx:568` で `panel()?.contains(document.activeElement)).toBe(false)` を使い、happy-dom の `.click()` が trigger を focus しない不安定性（`activeElement === trigger` が成立しない）を回避している。偽陽性/偽陰性に強い、信頼できる固定。

- **[N-003]** AC-1 の onFocusOut 誤発火ガード（arch S-002）が同一テスト内に併記されている（`app/components/common/__tests__/Popover.test.tsx:556` `expect(panel()).not.toBeNull()`）。初期フォーカスを panel 内へ移した直後に container の `onBlur→close` が誤発火してパネルが閉じない不変条件を直接ガードしており、プランどおり。

- **[N-004]** AC-7 は menu / listbox 双方を `it.each` で回し、コードゲート（`Popover.tsx:85` `haspopup === "dialog" ? Boolean(initialFocus) : false`）を実効的に検証している。ハーネスに roving を配線せず素の focusable（`項目` ボタン）を置いているため、もしゲートを外して `moveInitialFocus = Boolean(initialFocus)` にした退行が入れば `項目` へ focus が移り `p?.contains(activeElement)).toBe(false)` が落ちる。ゲート除去を捕捉できる有意なテスト。コメント（`:608-610`）も「roving は配線していない」旨を明示していて誤解を生まない。

- **[N-005]** AC-3 / AC-4（FilterBar / PublicTopControls）は単に `activeElement` を固定するだけでなく、**先頭 focusable が `aria-pressed` を持つプリセットボタンであること**を併せてアサート（`FilterBar.test.tsx:393` / `PublicTopControls.test.tsx:274`）。これは plan L140「先頭 focusable は date input ではなくプリセットボタン＝ネイティブ日付ピッカー/ソフトキーボードを暴発させない」という受け入れ意図を直接固定する良い設計。実装（`FilterBar.tsx:851-882` の DateRangeFields、先頭がプリセット grid）とも整合。

- **[N-006]** PublicTopControls の happy-dom 環境化は非破壊。既存 SSR テスト（`renderToStaticMarkup` ベースの markup / URL updater / cap suppression 群）は diff 上で**一切削除・改変されておらず**、末尾に dynamic describe を追加しただけ（`git diff` で確認）。`renderToStaticMarkup` は happy-dom 下でも `document` に触れず動作するため回帰なし。実行でも 84/84 緑。

- **[N-007]** 既存 dialog 非回帰（AC-6）は維持。Escape / 外側 mousedown / focus-out（relatedTarget 非 null で close・null で維持）/ `close` 復帰 / clamp（shiftX/shiftY/両軸/sheet スキップ）の各テストは Popover.test.tsx で無改変のまま残存（唯一の削除は `Harness` シグネチャ変更のみ）。FilterBar の DatePopover open/Escape/閉じる/解除、TagPicker roving、相互排他も無改変で全緑。AC-8（DirectoryTreeSelect）も `moveInitialFocus` 既定 false ゆえ無影響で、DirectoryTreeSelect.test.tsx 緑を確認。

- **[N-008]** テスト内の focusable セレクタ（`"a[href], button, input, select, textarea, [tabindex]"`, `FilterBar.test.tsx:390` / `PublicTopControls.test.tsx:270`）は実装の `FOCUSABLE_SELECTOR`（`:not([disabled])` 等付き）と字面が異なるが、対象 DOM では両者とも先頭ノード＝先頭プリセットボタンに解決するため実害なし。実装内部の正規表現へ密結合しておらず「先頭の操作可能要素」という観測的性質のみを見ているので壊れにくい。過度な querySelector 密結合はない。

- **[N-009]** AC-5（role/aria 不変）は新規テストを起こさずとも、既存 `wires aria-haspopup=dialog and renders role=dialog when open`（`Popover.test.tsx:149`）＋ 各 consumer の `[role="dialog"]` 取得で担保。initialFocus は role/aria に触れないため妥当な省略。

## 総評

テスト実装は AC-1〜AC-9 を過不足なくカバーし、プランの 2 周のレビュー反映（AC-2 の containment 化・AC-1 の panel 非 null 併記・AC-7 のコードゲート検証・AC-9 スモークの位置づけ明記）がすべてテストコードに落ちている。happy-dom でのフォーカス検証は `.focus()`/`document.activeElement` を信頼できる形（containment・先頭ノード同定）で使っており偽陽性/偽陰性リスクは低い。唯一の実質的な穴は prevOpenRef の**再アーム分岐**が未テストな点（W-001）で、これは happy-dom で容易にテスト可能なので追加を推奨する。それ以外は非回帰も含め健全。
