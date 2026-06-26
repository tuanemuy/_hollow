# Plan Review — Issue #776 / Round 1（観点: 要件カバレッジ・スコープ整合性）

レビュー日: 2026-06-26
対象: `.issue/776/plan.md` / `.issue/776/adr.md`

## サマリ

Issue #776 の Tasks（4 件）・Acceptance Criteria（5 件）は受け入れ基準表（AC-1〜AC-10）にほぼ漏れなく落ちており、各基準には実装ステップが紐づき、由来も明記されている。スコープ外作業の混入もない（「含まれないもの」が明示）。radiogroup（並び替え軸）vs Tabs（編集モード）の判断は #660 ADR-001 の基準（実体 tabpanel の有無）に忠実で、実コード（NoteEditor 493-544 行の body 条件レンダー、onModeChange の確認ゲート）とも整合する。

ただし manual activation Tabs における roving tabindex の挙動記述に「選択 vs フォーカス」の不正確さが 1 件あり、AC-4 とテスト記述の検証可能性に影響する（P-001）。その他は軽微な改善提案のみ。

---

#### 問題点（要修正）

- **[P-001]** AC-4 / 実装ステップ 6 の roving tabindex 記述が manual activation の実挙動（フォーカス追従）と食い違っている
  - 理由: AC-4 と ステップ6 は roving tabindex を「選択 `tabIndex=0`・他 `-1`」と記述しているが、編集モードは **manual activation**（ADR-002/003）であり、getTabIndex は `focusedIndex` 由来（ADR-003）。矢印でフォーカスのみ移動し `onChange` を呼ばない以上、選択（`selectedIndex`）が変わらないまま **フォーカスした非選択 tab が `tabIndex=0`** になる。初回レンダー時は `focusedIndex===selectedIndex` なので「選択=0」で正しいが、矢印移動後は「フォーカス中=0」が正。AC とテストが「選択 tab が常に tabIndex=0」を前提にすると、正しい実装に対して回帰テストが誤判定（矢印後に選択 tab=0 を期待して失敗 / または focusedIndex 追従を検証し損ねる）するおそれがある。さらに ADR-003 は「Tab 離脱後の再 Tab-in は選択中 tab に戻る（selectedIndex 追従で担保）」と書くが、これは「getTabIndex は focusedIndex 由来」と内部矛盾する（focusedIndex が blur でリセットされない限り再 Tab-in は focused tab に戻る）。Issue AC 本文「non-selected tabs are not in the Tab order (roving tabindex)」自体が manual では厳密には「focused 以外が tab order 外」を意味する点も含め、定義を一意化する必要がある。
  - 提案: (1) AC-4 の編集モード roving 記述を「automatic（radiogroup）は選択追従、manual（tabs）は**フォーカス追従**で getTabIndex を導出」と分けて明記する。(2) ステップ6 の回帰テストを「矢印移動後はフォーカス中 tab が `tabIndex=0`・他 `-1`（onChange 未発火）」「初回レンダーは選択 tab が `tabIndex=0`」の 2 ケースに分けて検証可能にする。(3) ADR-003 の「再 Tab-in は選択中 tab に戻る」記述を、focusedIndex の blur 時リセット有無を含めて確定させる（リセットしないなら「最後にフォーカスした tab に戻る」が正で、これは APG roving として許容される挙動）。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-7（focus-visible outline / WCAG 2.4.7）の検証手段がテスト方針に無い
  - 理由: AC-7 は受け入れ基準として掲げられているが、テスト方針（ステップ5/6）は role 契約・tabIndex・矢印挙動のみで、focus-visible スタイルの付与を検証する項目がない。AC が「検証可能な形」になっていない。`SEGMENTED_ITEM` / 編集モード tab の className に `outline-accent` 系ユーティリティが含まれることを 1 アサーション（文字列包含）で固定すれば、AC-7 が機械検証可能になる。なお AC-7 自体は Issue 本文に明記が無い追加項目だが、roving tabindex 導入でキーボードフォーカスが segment 間を移動する以上、視覚的フォーカス指標は本機能に不可分な必須要件であり、スコープ外提案ではなく正当な内包と判断する。

- **[S-002]** P12 モックの「editor body を `role="tabpanel"` 化」対象要素が plan 上で未特定
  - 理由: ステップ7 は「editor body コンテナに `role="tabpanel" id aria-labelledby`」を付与するとあるが、現行 P12 モック（967 行付近の mode-tabs 直後は save-status / editor-actions / title-input / dir-row… と続く）には「body エディタ本体」に相当する明確な単一コンテナが mode-tabs の兄弟として存在するか plan からは判別できない。実体 tabpanel を配線する AC-5/AC-8 の達成可否がモック構造に依存するため、どの要素を tabpanel にするか（または新設するか）を実装前に確認しておくと手戻りが防げる。`aria-labelledby` がアクティブ tab id を指す点も明記済みで方向性は妥当。

- **[S-003]** 最終ゲートの lint コマンドが Issue AC（`pnpm lint`）と微妙にずれる
  - 理由: AC-10 / Issue AC は `pnpm typecheck && pnpm lint && pnpm test`。plan ステップ8 は `pnpm lint:fix && pnpm format` を回す（CLAUDE.md 準拠で妥当）。ただし `lint:fix` は自動修正で違反を隠しうるため、Issue AC の文言どおり**素の `pnpm lint`** も最終確認に含めておくと受け入れ基準との一致が明確になる。

---

#### 良い点

- 受け入れ基準表が Issue Tasks / AC を「由来」「対応ステップ」付きで全件トレースしており、要件→基準→ステップの紐づけが一目で追える。Issue の 4 Tasks・5 AC はすべて AC-1〜AC-10 に被覆されている（漏れなし）。
- radiogroup（並び替え軸）vs Tabs（編集モード）の判断が #660 ADR-001 の基準（実体 tabpanel の有無）に忠実で、実コード（`NoteEditor` 493-544 行の `state.mode` 条件レンダー、`onModeChange` の `window.confirm` + 装飾喪失 `ConfirmDialog`）を根拠に裏付けられている。Issue Task 2 が求める「Tabs か radiogroup かの設計判断」を ADR-002 が案A/B/C の比較付きで明示的に下している。
- 編集モードを **manual activation** にする理由（矢印で wysiwyg を通過しても装飾喪失ダイアログが暴発せず、既存確認ゲートが完全保存される）が、Issue AC「WYSIWYG 装飾喪失確認ゲートの不変」と直結しており、要件保存の観点で的確。
- `role="tab"` 維持により既存テスト（`editorModeSwitch.test` / `noteEditorModeChange.test` の `[role="tab"]` セレクタ）の churn を最小化する設計判断が、AC-9 のテスト更新コストを抑える方向で妥当。
- スコープ外（表示モード #660、editor 内部実装、P12 FrontMatter inventory 完全同期、`useRovingMenu`）が「含まれないもの」で明示され、スコープ creep が無い。`useRovingTablist` の automatic 既定による既存 2 consumer 後方互換も AC として担保。
- spec mock P18/P12 更新（AC-8）・両コントロールの矢印キー回帰追加（AC-9）・既存挙動保存（sort/order URL 処理=AC-3、WYSIWYG 装飾喪失ゲート=AC-6）がいずれも基準化されており、レビュー観点の必須項目を網羅している。

---

## 返答

- 問題点: 1 / 改善提案: 3
- `[P-001]` manual activation の roving tabindex 記述が「選択追従」になっており実挙動（フォーカス追従）と食い違う（AC-4 / ステップ6 / ADR-003 の内部矛盾）
- `[S-001]` AC-7（focus-visible outline）の検証手段がテスト方針に無い
- `[S-002]` P12 モックの tabpanel 化対象要素が plan 上で未特定
- `[S-003]` 最終ゲートの lint コマンドが Issue AC（素の `pnpm lint`）と微妙にずれる
