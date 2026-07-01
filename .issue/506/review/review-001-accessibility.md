# PR #812 レビュー — Accessibility 観点（Issue #506）

対象: 非モーダル `Popover`（dialog モード）の `role="dialog"` 維持＋open 時の初期フォーカス移動
参照: `.issue/506/plan.md`（AC-1〜AC-9）/ `.issue/506/adr.md`（ADR-001, 選択肢1）
読んだ実装: `app/components/common/usePopover.ts` / `Popover.tsx` / `Dialog.tsx`（比較用）/ `note/list/FilterBar.tsx`（DatePopover・DateRangeFields）/ `public/PublicTopControls.tsx` / `note/editor/DirectoryTreeSelect.tsx` / 各 `__tests__` / `app/styles/index.css`

## 総評

WAI-ARIA APG の非モーダル dialog パターンに照らして、本 PR の設計・実装は妥当。乖離（「dialog を名乗るのに開いてもフォーカスがトリガーに留まる」）の欠けていた片側＝初期フォーカスだけを、`role`/`aria-*` 契約を一切変えずに補っている。初期フォーカス先を **date input ではなく先頭プリセットボタン**（`aria-pressed` トグル、アクセシブルネーム有り）に落とす選択は、モバイル sheet でのネイティブ日付ピッカー／ソフトキーボード暴発を構造的に回避しており、a11y 上の勘所を正しく押さえている。Escape クローズ・トリガーへの focus 復帰・非モーダル dismiss（AC-6）は `usePopover` の既存ロジックに一切触れず非回帰。menu/listbox への `haspopup === "dialog"` コードゲート（AC-7）と DirectoryTreeSelect 無変更（AC-8）で二重フォーカスを構造的に排除している。

**実装を止めるべき a11y Blocker は無し。** 非モーダル設計に内在する残存リスク2点を Warning として記録する。

### Accessibility

#### Blockers
- なし

#### Warnings

- **[W-001]** 非モーダル `role="dialog"`（`aria-modal` 無し）の「ダイアログ境界アナウンス」が実 AT で未検証 / 場所: `app/components/common/Popover.tsx:152-163`（dialog ブランチ）, 検証は `.issue/506/manual-test/report.md` / 理由: 本 Issue の成果は「dialog を名乗る意味論と実体験を一致させる」こと。初期フォーカスを中へ移すことで焦点は正しく入るが、`aria-modal="true"` を持たない非モーダル dialog では、フォーカスがパネル内要素へ入った際に「ダイアログ（`aria-label="期間フィルタ"`）に入った」という境界コンテキストを読み上げるかが SR/ブラウザ組み合わせで一様でない（NVDA/VoiceOver は概ね読み上げるが、環境差がある）。manual-test は `document.activeElement` の着地とキーボード復帰までは確認しているが、実スクリーンリーダー（NVDA/VoiceOver 等）での「ダイアログ名＋境界」アナウンスは「SR は読み上げる」という**期待値の記述**に留まり、実測されていない（ヘッドレスでは観測不能）。 / 提案: NVDA もしくは VoiceOver で「期間」トリガー activate → パネル内先頭プリセット到達時に「期間フィルタ, ダイアログ, （プリセット名）ボタン」相当が読み上げられることを1回目視確認し、report.md に残す。読み上げが弱い環境が判明した場合のみ、非モーダルを保ったまま `aria-modal` は付けず（＝トラップ非導入の設計を崩さず）、初期フォーカスの当て先の見直し等を検討。設計判断自体（ADR-001, APG 上の非モーダル許容）は妥当なので、あくまで検証の穴を埋める位置づけ。

- **[W-002]** → Round 2 で対応済み（`usePopover.ts` の `prevOpenRef` コメントに、初期 `open=true` でマウントする将来 consumer は WCAG 3.2.1 On Focus 考慮が要る旨・現行 consumer は全て閉状態開始のため実害なしを追記）。共有プリミティブとして「open 状態でマウントされた dialog」がユーザー操作なしに初期フォーカスを奪う余地 / 場所: `app/components/common/usePopover.ts:191`（`prevOpenRef = useRef(false)`）+ `:235-240`（初期フォーカス effect） / 理由: `prevOpenRef` の初期値を `false` としているため、`open=true` でマウントされた場合も立ち上がりエッジ扱いとなりマウント時に `.focus()` が走る。現行の2 consumer（両 DatePopover）はいずれも controlled で閉状態開始のため実害は無いが、`usePopover`/`Popover` はアプリ全 Popover の基盤であり、将来 dialog モードで初期 `open=true`（URL 直開き・ハイドレート済み open 等）の consumer が現れると、**ユーザーのジェスチャなしに焦点が移る** = WCAG 3.2.1 On Focus / 予期しないコンテキスト変化に触れうる。init `false` は Dialog（モーダル・ユーザー起動前提）との一貫性としての意図的選択で、plan/ADR にも根拠がある点は理解した上での forward-looking な注意喚起。 / 提案: 現状は据え置きで可。`moveInitialFocus` の JSDoc（`usePopover.ts:143-148`）に「dialog を初期 open でマウントする consumer を追加する場合、ユーザー起動によらない focus 奪取になりうる点に留意（現行 consumer は全て閉状態開始）」の一文を足しておくと、W-001 と併せて将来の誤用を防げる。

#### Notes

- **[N-001]** dialog パネルに `aria-modal` を付けていない（`Popover.tsx:152-163`）のは非モーダル設計に対して**正しい**。モーダルでないのに `aria-modal="true"` を名乗る虚偽アナウンスを避けており、`aria-haspopup="dialog"` / `aria-expanded` / `aria-controls`（`usePopover.ts:290-296`）の APG 準拠トリガー配線とも整合。role/ARIA 契約を変えないという AC-5 を厳密に満たす。

- **[N-002]** 初期フォーカス先が **先頭プリセットボタン**（`FilterBar.tsx:869-880` の `aria-pressed` トグル、DOM 順で date input より前）である点が a11y 的に堅い。`querySelector(FOCUSABLE_SELECTOR)` が拾う DOM 先頭 focusable が意味のある操作要素であり、`type="date"` input へ焦点が飛んでネイティブピッカー／ソフトキーボードが暴発するのを構造的に回避（モバイル sheet でも同様）。FilterBar/PublicTopControls 両テストが `firstFocusable?.hasAttribute("aria-pressed") === true` を明示アサートしており、当て先が date input でないことを回帰ガードしている（`FilterBar.test.tsx` AC-3 / `PublicTopControls.test.tsx` AC-4）。プリセット群は `role="group" aria-label="プリセット"`（`FilterBar.tsx:863`）配下なので、焦点入場時に SR はグループ名＋ボタン名を文脈として読み上げられる。

- **[N-003]** 焦点可視性（WCAG 2.4.7）はグローバルな `:focus-visible { box-shadow: var(--shadow-focus) }`（`app/styles/index.css:176-180`）で担保される。キーボードで開いた場合はトリガーの focus-visible 状態がプログラム的 focus に引き継がれ、プリセットボタンにリングが出る。マウスで開いた場合は focus-visible 非マッチでリング非表示だが、これは「ポインタ操作にはリングを出さない」正しい挙動で、焦点はパネル内に入っている。プリセットボタンに個別 focus スタイルが無くてもグローバル規則でカバーされるため問題なし。

- **[N-004]** Escape クローズ・トリガーへの focus 復帰（`usePopover.ts:255-261, 285-288`）、外側 mousedown / Tab-out dismiss（同 `:242-283`）は本 PR で未変更で AC-6 非回帰。初期フォーカスは `useEffect`（post-paint, deps `[open, moveInitialFocus]`）に置かれ clamp の `useLayoutEffect` とレースせず、trigger→panel 内への焦点移動は `onFocusOut` の `relatedTarget` が container 内のため早期 return し誤クローズしない。Popover.test.tsx の AC-1 ケースが `expect(panel()).not.toBeNull()` を併記してこの不変条件を直接ガードしている。

- **[N-005]** menu/listbox への `initialFocus` 誤配線を `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false`（`Popover.tsx:85`）でコードゲートし、roving（第2層 `useRovingMenu`）との二重フォーカスを「表現不能」にしている。AC-7 テスト（`Popover.test.tsx` の menu/listbox 各ケース）が「initialFocus を渡してもパネル内へ焦点が入らない」ことを固定。DirectoryTreeSelect（`DirectoryTreeSelect.tsx:105-117` の自前 `setTimeout(0)` 検索 combobox フォーカス）は `initialFocus` 未指定で無変更＝AC-8 維持。二層設計を壊さない棲み分けとして a11y 的に正しい。

- **[N-006]** `AC-9` の「開いたまま navigation で焦点を奪い戻さない」は、DatePopover が preset 選択／date 入力で popover を閉じずに URL 更新する非モーダル特性上、a11y 的にも重要（ユーザーが移した先＝date input 等から先頭へ引き戻すと操作不能になる）。`prevOpenRef` の立ち上がりエッジガードで抑止しており、`useRovingMenu` の同型前例に倣っている。ユニットは deps 不変ゆえスモーク止まりだが、plan.md L149 でその限界を正直に位置づけており、判断は妥当。

## 受け入れ基準（a11y 関連）の充足確認

| AC | a11y 観点の判定 | 根拠 |
|----|----------------|------|
| AC-1 | 満たす | `usePopover.ts:235-240` 立ち上がりエッジで先頭 focusable へ `.focus()`。Popover.test.tsx AC-1 |
| AC-2 | 満たす | opt-in 未指定で no-op。`panel().contains(activeElement) === false` で回帰ガード |
| AC-3/4 | 満たす | 両 DatePopover `initialFocus` 付与、先頭が `aria-pressed` プリセット。両テストで実測 |
| AC-5 | 満たす | `role="dialog"` / `aria-haspopup="dialog"` 不変、`aria-modal` 付けず（N-001） |
| AC-6 | 満たす（非回帰） | Escape/dismiss/focus 復帰ロジック未変更（N-004） |
| AC-7 | 満たす | `haspopup === "dialog"` コードゲート＋テスト（N-005） |
| AC-8 | 満たす | DirectoryTreeSelect 無変更・自前フォーカス維持（N-005） |
| AC-9 | 満たす | `prevOpenRef` エッジガード（N-006） |

残る W-001 は AC-5 の意味論を「実 AT で確かめる」検証面の補強、W-002 は基盤プリミティブとしての将来的注意喚起であり、いずれも本 PR のマージを妨げない。
