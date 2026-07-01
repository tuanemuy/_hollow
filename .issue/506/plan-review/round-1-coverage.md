# Round 1 レビュー — Issue #506 実装計画（視点: 要件カバレッジ・スコープ整合性）

対象: `.issue/506/plan.md` / `.issue/506/adr.md`
レビュー観点: Issue 要件のカバレッジ、受け入れ基準の検証可能性、AC↔ステップ紐づけ、スコープ整合性

---

#### 問題点（要修正）

- **[P-001]** 初期フォーカスの `useEffect`（deps `[open, moveInitialFocus]`）に「閉→開の遷移でのみ発火」ガードが無く、DatePopover が開いたままナビゲーションする局面で初期フォーカスが再発火し、ユーザーが移した先からフォーカスを奪い戻すおそれ。AC としても未定義・テストでも未検証。
  - 理由: FilterBar の DatePopover は `selectPreset → applyDateRange → run(...)` がパネルを閉じない（`selectVisibility` と違い `setOpenPopover(null)` を呼ばない。`FilterBar.tsx` L243-248, L250-256 で確認）ため、プリセット選択・日付入力・クリアのたびに **開いたまま URL ナビゲーション（RSC 再レンダー）** が起きる。同一ファイル群の第2層 `useRovingMenu.ts` は、まさに「filter navigation while a popover stays open」で **deps 不変でも effect が再発火しうる** ことを明記し、`prevOpenRef`（L108-117）で reset effect の再発火を抑止している。本計画の初期フォーカス effect はこのガードを踏襲しておらず（計画 step 1 は「roving と同じ rAF 不使用の useEffect 様式」とだけ述べ、`prevOpenRef` 相当に言及なし）、再発火した場合はユーザーが Tab で移した日付入力や別プリセットから **先頭プリセットボタンへ焦点が戻される**。既存の「開いたまま navigation 後に focus が body へ落ちる」挙動（計画が明示的にスコープ外としている、L136）を、初期フォーカス追加によって「毎回先頭へ奪い戻す」新たな回帰へ悪化させうる。AC-1 は「open 時に移す」しか規定せず「開いている間の再発火をしない」を保証していない点がカバレッジの穴。
  - 提案: (a) `useRovingMenu` の `prevOpenRef` と同型のガードを入れ「閉→開の遷移時のみ 1 回発火」に限定する、または (b) 「本 effect は再発火しても無害」である根拠を計画/ADR に明記する。あわせてテスト方針に「DatePopover を開いたまま navigation（＝再レンダー/再コミット）しても初期フォーカスがユーザーの移動先を奪い戻さない」ケースを追加し、AC-1 を「open 遷移時に移す／開いている間は奪わない」に補強する。

#### 改善提案（検討推奨）

- **[S-001]** AC 表の「対応ステップ」列が実装ステップ（1〜5）のみを指し、検証ステップ（step 6 テスト）を全 AC 行から欠いている。
  - 理由: 受け入れ基準は「どのステップで検証されるか」まで辿れて初めてトレーサビリティが閉じる。AC-1〜AC-4 の実体は step 6 のテストで固定されるのに、表からは step 6 が一切参照されず「基準↔検証」の紐づけが表上で切れている。各 AC 行に検証ステップ（6）を併記すると、実装漏れ・テスト漏れの発見が容易になる。

- **[S-002]** AC-2 の文言「フォーカスがトリガーに**留まる**」が happy-dom では字義どおり検証しづらい（`.click()` が要素に focus を与えるとは限らず、activeElement が `<body>` になりうる）。
  - 理由: 既存 `Popover.test.tsx` の focus 復帰テスト（L212-222）は `closeAndRestoreFocus` の明示 `.focus()` に依存しており、トリガーへ自然 focus する前提を置いていない。計画の「テスト方針」自体は「＝パネル内要素へ移らないこと」と括弧で言い換えており実装可能だが、AC-2 本文が「トリガーに留まる」のままだと基準とテストの表現が乖離する。AC-2 を「初期フォーカスがパネル内へ移らない（トリガー外へ移動しない）」に揃えると検証可能性が明確になる。

- **[S-003]** ADR-001 の Status が `Proposed` のままだが、plan.md は選択肢1を確定事項として全ステップ・全 AC の前提に据えている。
  - 理由: 本 Issue は「role の妥当性とフォーカス方針を**決める**こと」自体が成果物（Issue「やりたいこと」）。計画が意思決定に依拠して構築されている以上、ADR が `Proposed` だと「決定済みなのか承認待ちなのか」が曖昧。承認フロー上そのままにするなら plan/ADR に「承認をもって確定」と一言添えるか、確定後 `Accepted` へ更新する運用を明記すると整合する。

- **[S-004]** `initialFocus`（→`moveInitialFocus`）が dialog モードでのみ意味を持つのに、型上は menu/listbox にも渡せてしまい、渡すと roving と二重フォーカスになる（AC-7 の堅牢性は現行 consumer が渡さない運用に依存）。
  - 理由: 現状 2 consumer は渡さないため AC-7 は満たされるが、CLAUDE.md「illegal states を型で表現不能に」に照らすと、prop を dialog モードに型で束ねる（または menu/listbox 分岐で無視することをテストで固定）と、将来の誤用による二重フォーカス回帰を防げる。※型設計の詳細判断はアーキ観点レビューと重複するため、ここではカバレッジ（AC-7 の恒久保証）としてのみ指摘。

#### 良い点

- **スコープ境界が grep 実測で正しく確定している。** `<Popover haspopup="dialog">` の実 consumer は FilterBar / PublicTopControls / DirectoryTreeSelect の3件で、モーダル `<Dialog>` を素の `aria-haspopup="dialog"` ボタンから開く箇所（SearchFilterDrawer / NotePicker / モバイル絞り込みシート）は別系統として除外——本レビューでも `SearchFilterDrawer.tsx` L310 が Popover プリミティブを使わない素ボタンであることを確認済み。スコープの過不足なし。
- **PublicTopControls（AC-4）の取り込みはスコープ膨張ではなく妥当。** Issue 本文は FilterBar の DatePopover を「例」として挙げつつ「非モーダル Popover における role=dialog の方針を整理する」という**プリミティブ横断の方針決定**を求めている。PublicTopControls の DatePopover は FilterBar と実質同一 UI・同一プリミティブの同一欠陥クラスであり、片方だけ直すと「同じ見た目の2つの DatePopover が違う挙動」になる。opt-in をこちらにも配線するのは方針の一貫適用であって、名指し外の新規作業ではない。ADR も「調査で判明した第2の consumer」と根拠を明示している。
- **DirectoryTreeSelect の二重化を opt-in で正しく回避（AC-8）。** DirectoryTreeSelect は自前 `setTimeout(() => searchRef.current?.focus(), 0)`（`DirectoryTreeSelect.tsx` L105-117）で検索 combobox へ focus しており、`initialFocus` を渡さない設計なのでプリミティブの初期フォーカスと二重化しない——コードで確認済み。「触らない」判断とその根拠（bespoke タイミング／ブラスト半径最小化）が ADR に明記されている。
- **初期フォーカス対象＝先頭プリセットボタンの記述が実 DOM 順と一致。** dialog パネルの `body`（DateRangeFields）先頭 focusable は `role="group"` 内のプリセットボタン群であり、ラベルは非 focusable な `<div>`。AC-3/AC-4 の「先頭のプリセットボタンへ移る」は正確。モバイルでも先頭が date input ではなくプリセットボタンなのでネイティブ日付ピッカー暴発が無い、という注記も妥当。
- **後方互換（AC-2/AC-7/AC-8）を opt-in で担保する設計が明快。** prop 未指定の既存全 consumer が完全無影響という論理が、`usePopover`/`Popover` の実装（`moveInitialFocus` default false、既存 dismiss/focus 復帰/clamp に非介入）と整合している。
- **focusable セレクタを `Dialog.tsx` からローカル踏襲する判断とトレードオフ明記が適切。** 共有抽出見送り（Dialog のテスト済み focus 経路を触らない）と相互参照コメントの方針が、実装リスクと DRY のバランスとして妥当。
