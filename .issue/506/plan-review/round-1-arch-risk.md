# Plan Review — Issue #506 (Round 1)

視点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**

対象: `.issue/506/plan.md` / `.issue/506/adr.md`
参照: `CLAUDE.md`、`.issue/467/adr.md`（二層設計）、`usePopover.ts` / `Popover.tsx` / `Dialog.tsx` / `useRovingMenu.ts` / FilterBar / PublicTopControls / DirectoryTreeSelect と各 `__tests__`

---

## 総評

計画・ADR ともに #467 の二層設計（第1層 `usePopover`＝dismiss/ARIA/focus 復帰、第2層 `useRovingMenu`＝roving）へ正確に整合している。初期フォーカスを「focus 復帰の対称カウンターパート」として第1層へ置く判断はコード実態（`panelRef`/`triggerRef` を第1層が握る）とも合致し、実装足場は揃っている。スコープ切り（DatePopover 2 箇所のみ opt-in、DirectoryTreeSelect と menu/listbox は無変更）も乖離の実態（`aria-haspopup="dialog"` 3 箇所のうち DirectoryTreeSelect のみ自前フォーカス済み）と一致している。

**アーキテクチャ整合性・実現可能性の両面で、実装を止めるほどの問題（P）はゼロ**。ただし CLAUDE.md の中核原則「illegal states を型で表現不能にする」に照らして 1 件、テスト記述の堅牢性で 1 件、命名の混乱回避で 1 件、計 4 件の改善提案がある。

### プロンプト観点への回答（要点）

- **第1層に初期フォーカスを置く設計 × 二層分離**: 整合する。第1層は既に `panelRef`/`triggerRef`/`closeAndRestoreFocus` を所有し、初期フォーカスは復帰の対称物。menu/listbox は roving（第2層）が focus を持つため、dialog のみ opt-in で第1層が補う棲み分けは自然。
- **二重発火**: menu/listbox の consumer は `initialFocus` を渡さない運用のため `moveInitialFocus=false` となり、第1層の初期フォーカス effect は `if (!open || !moveInitialFocus) return` で no-op。dialog（DatePopover）は roving を使わないので競合しない。**現行 consumer では二重発火しない。** ただし将来の誤用リスクは S-001 参照。
- **opt-in vs default-on**: opt-in が妥当。DirectoryTreeSelect が bespoke な `setTimeout(0)` で検索 combobox を自前フォーカスしており（本文 L100-117 で確認）、無条件 default-on は二重フォーカス／タイミング回帰を招く。全 dialog を一律 default-on にできない以上、per-dialog opt-in が正しい。「将来渡し忘れ」リスクの JSDoc 緩和は弱いが、実 consumer が 3 箇所と少なく妥当な範囲。
- **セレクタ重複の見送り**: 概ね妥当（後述の通り「Dialog のテスト済み経路に触れる」根拠はやや過大）。S-003 参照。
- **`.focus()` が happy-dom で動く前提**: 現実的。既存テストが実証済み（`closeAndRestoreFocus` テストの `activeElement === trigger`、roving テスト群の `activeElement === options()[n]`）。
- **useLayoutEffect / useEffect**: useEffect（roving と同様式）で正しい。inline パネル（非 portal）は ref callback が commit 中に走り passive effect 時点で `panelRef.current` が確定するため rAF 不要（Dialog が rAF を使うのは portal+二段 mount ゆえ）。clampToViewport の useLayoutEffect が setState しても node identity は不変で focus に影響しない。**この順序考慮は計画に明示的分析が薄い（S-004）。**
- **既存挙動の副作用（onFocusOut 誤発火）**: 構造上安全。初期 focus はコンテナ内トリガー→コンテナ内パネル要素の移動で、`onFocusOut` は `relatedTarget` がコンテナ内なら return する。加えて happy-dom は `.focus()` で focusout を自動発火しない（既存 focus-out テストが手動 dispatch している事実で裏付け）ため、テスト上も誤クローズは起きない。ただし明示的な回帰アサートは無い（S-002）。
- **エッジケース**: モバイルシートの先頭 focusable は preset ボタン（DOM 順で `role="group"` 内 preset が date input より先）であり、date input へ焦点が当たらないため picker/ソフトキーボード暴発は起きない。計画の判断は正しく、DOM 順でも裏付けられる。

---

## 問題点（要修正）

問題点ゼロ。

（アーキテクチャ整合・依存方向・二層設計・実現可能性のいずれも、実装を止めるべき欠陥は検出されなかった。）

---

## 改善提案（検討推奨）

### [S-001] `Popover` で `moveInitialFocus` を `haspopup === "dialog"` にゲートし、二重フォーカスを型/コードで排除する

- 現計画: `Popover` は `usePopover({ ..., moveInitialFocus: initialFocus })` を **haspopup に依らず無条件**で渡し、「menu/listbox には `initialFocus` を渡さない」を JSDoc の運用規約だけで担保する。
- 問題意識: 将来 menu/listbox の Popover に誤って `initialFocus` が付くと、第1層の初期フォーカスと第2層 roving が両方 open 時に `.focus()` を呼び、roving の着地インデックス（`initialIndex`）と食い違う「focused だが roving 上は別項目」という illegal state が発生しうる。CLAUDE.md は「Make illegal states unrepresentable at the type level before falling back to runtime checks」を中核原則に置いており、JSDoc 運用より一段強い担保が望ましい。
- 提案: `Popover` 内で `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` とゲートする。これで menu/listbox に `initialFocus` が渡っても構造的に無効化され、二重フォーカスが表現不能になる。ADR-001 が既に「dialog ブランチでのみ意味を持つ」と述べている契約を、コードの不変条件へ昇格させるだけで追加コストはほぼ無い。

### [S-002] 「初期フォーカス後もパネルが開いたまま」を明示的に回帰アサートする

- プロンプトが懸念する「初期フォーカス直後に `onFocusOut` が誤発火してクローズ」は構造上起きない（上述）が、この不変条件を守るガードがテストに存在しない。AC-1 テストの `activeElement === 先頭 focusable` は間接的に「開いている」ことを含意するが、パネル DOM 存在（`panel() !== null`）を同一テストで明示アサートしておくと、将来 `onFocusOut` ガードや初期フォーカスの実装様式を変えた際の退行を直接検知できる。
- 提案: Popover.test.tsx の AC-1 ケースで `expect(panel()).not.toBeNull()` を `activeElement` アサートと併記する。

### [S-003] usePopover 側セレクタ定数の命名を `FOCUSABLE_SELECTOR` に揃える／抽出見送り根拠を精緻化する

- 計画は usePopover のローカル定数を `INITIAL_FOCUS_SELECTOR` と命名するが、その**値は Dialog の `FOCUSABLE_SELECTOR`（非フィルタ版）を踏襲**する。Dialog では `INITIAL_FOCUS_SELECTOR` は `:not([data-dialog-close])` を含む**フィルタ版**の別物であり、同名で別値だと相互参照コメントを読む人が混乱する。
- 提案: usePopover 側は踏襲元と同じ `FOCUSABLE_SELECTOR` に命名し、相互参照コメントで「Dialog の `FOCUSABLE_SELECTOR`（非フィルタ版）を踏襲。DatePopover の先頭 focusable は preset ボタンで、close ボタン除外は不要」と明記する。
- 補足: ADR/計画の「共有抽出は Dialog のテスト済みフォーカス経路に触れる」という見送り根拠はやや過大。純粋な文字列定数を `common/styles.ts` 等へ抽出しても Dialog のロジック経路は不変で import 差し替えのみ（挙動リスクほぼゼロ）。とはいえ「よくコメントされた定数の二重定義」は YAGNI 上許容範囲で、見送り自体は妥当。根拠を「Dialog のフィルタ版と本用途の非フィルタ版で必要形が異なり、共有すると分岐が要る」に言い換えると正確。

### [S-004] AC-2 後方互換テストの断言は「パネル内に activeElement が無い」で固定する（「トリガーに留まる」を避ける）

- 計画本文 L143 は「open 後もフォーカスがトリガーに留まる（＝パネル内要素へ移らない）」と記す。括弧内の「パネル内要素へ移らない」が正しい堅牢な断言である一方、主表現「トリガーに留まる」を字義通り `activeElement === trigger` で書くと happy-dom では失敗する。
- 根拠: 既存テストで確認 — happy-dom の `.click()` はフォーカスを移さない（FilterBar.test.tsx L856 のコメント「Dialog saves document.activeElement ... focus it explicitly」が、click 後 activeElement が trigger でない前提を明示）。また `activeElement === document.body` が正常状態として現れる（同 L631）。したがって「期間」トリガー click 直後の activeElement は多くの場合 `<body>` であり trigger ではない。
- 提案: AC-2 は `expect(panel()?.contains(document.activeElement)).toBe(false)`（＝パネル内へ移っていない）で固定する。同様に FilterBar/PublicTopControls の AC-3/AC-4 は `activeElement === 先頭 preset ボタン` を直接断言すればよい（初期フォーカスが明示 `.focus()` を呼ぶため click の副作用に依存しない）。

---

## 良い点

- **二層設計への忠実さ**: 初期フォーカスを第1層へ置く判断が `.issue/467/adr.md` の責務境界（dismiss/ARIA/focus 復帰＝第1層、roving＝第2層）と完全に整合。`panelRef`/`triggerRef` を第1層が既に握る実装事実に立脚しており、追加配線が最小。
- **スコープ画定の精度**: `aria-haspopup="dialog"` 全 grep で 3 consumer を特定し、DirectoryTreeSelect の自前 `setTimeout(0)` フォーカス（本文 L100-117 で実在確認）と modal `<Dialog>` 系（別系統・トラップ有り）を正しく除外。乖離しているのは DatePopover 2 箇所だけ、という判断が実態と一致。
- **後方互換の担保**: opt-in（default false）により既存 consumer は prop 未指定で完全無影響。AC-2/AC-7/AC-8 が「無変更で緑のまま」を回帰ガードにできる設計。
- **happy-dom 前提の妥当性**: `.focus()` が動く／layout が無い、の切り分けが正確で、既存の `closeAndRestoreFocus`・roving テスト（`activeElement` 断言多数）が premise を実証済み。ユニットテスト可能性の見立ては現実的。
- **モバイル暴発の先読み**: 先頭 focusable が preset ボタン（date input ではない）である点を捉え、ソフトキーボード／ネイティブ日付 picker 暴発を回避する根拠を明示。DOM 順（`role="group"` の preset が range 入力より先）でも裏付けられる。
- **effect の再発火設計**: deps `[open, moveInitialFocus]` により、DatePopover で preset 選択→navigation→再レンダー（open 維持）が起きても初期フォーカス effect は再発火せず、ユーザーのフォーカスを奪い返さない。roving の `restoreFocusOnCommit` を dialog に持ち込まない判断も正しい。

---

## 実装時の確認事項（メモ）

- Popover.test.tsx の AC-1 ハーネスは、既存ハーネスの本文（`<span>本文</span><button>閉じる</button>`）では先頭 focusable が「閉じる」ボタンになるため、DatePopover の実態（先頭＝preset）に寄せた識別可能な先頭ボタンを追加してから断言すること。
- `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit` に加え、Popover/FilterBar/PublicTopControls の 3 テストが緑であることを確認（計画通り）。
