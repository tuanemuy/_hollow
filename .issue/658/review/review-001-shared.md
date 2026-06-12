# PR #665 レビュー（Issue #658）

## 対象

共有部品 4 変更（`Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `styles.ts`）の全消費者影響。

確認した消費者:

- `usePopover` / `<Popover>`: `common/Menu.tsx`（全アクションメニュー）、`note/list/ViewSwitcher.tsx`、`note/list/FilterBar.tsx`（TagPicker / DatePopover / VisibilityPopover）、`public/PublicTopControls.tsx`（DatePopover / SortMenu）
- `useRovingMenu`: `Menu.tsx`、`ViewSwitcher.tsx`、`FilterBar.tsx` ×2、`PublicTopControls.tsx`
- `popoverSheetPanel`: `FilterBar.tsx` の `FILTER_POPOVER_PANEL` のみ（= 期間 / 公開状態 / タグピッカーの 3 パネル）。`PublicTopControls.tsx` は独自リテラル（既に `max-sm:fixed` 持ち）で非依存
- `NotePickerDialog` / `DirectorySelectField` / `FrontMatterEditor` は Dialog/combobox 系で `usePopover` / `useRovingMenu` 非依存 — 影響なし

### Shared Components Regression

#### Blockers

なし。

- relatedTarget=null ガード: ユーザー起点の dismiss 経路（外側クリック = document mousedown、Escape = document keydown、Tab アウト = 非 null relatedTarget、選択時の `closeAndRestoreFocus`）はすべてガードを通らない別経路であり、既存消費者のクローズ動作は保たれる。`Popover.test.tsx` の「closes on focus-out when focus moves outside」「stays open on relatedTarget=null」両方向が固定されている
- 毎コミット refocus effect: `open` かつ `activeElement === document.body` の二重ガードにより、選択即クローズの既存消費者（Menu / ViewSwitcher / VisibilityPopover / SortMenu）ではフォーカスが panel 内にある通常時に no-op。コストは比較 2 回で性能影響なし。closed→open リセットガードも「open 遷移時に initialIndex へ着地」という既存契約（VisibilityPopover の選択中オプション着地）を変えない（クローズ→再オープンで `wasOpen=false` になるため）
- `popoverSheetPanel` の fixed 化: 唯一の消費者 FilterBar の 3 パネルは従来 `max-sm:left-0/right-0` がチップ幅ラッパー基準で潰れていた（既存バグ、ADR 内実測 w=52.7px）。public 側の動作実績あるパターンへの追従であり回帰ではなく修正。`clampToViewport` の translateX とは `POPOVER_SHEET_BREAKPOINT`（< 640px で clamp スキップ）により干渉しない。FilterBar の祖先（HomePage main 配下）に transform / backdrop-filter の containing block はないことを確認（backdrop-filter はヘッダー `layout/styles.ts` のみで、パネルはその外）

#### Warnings

- **[W-001]** relatedTarget=null ガードは全 `usePopover` 消費者に及ぶグローバルな挙動変更で、「フォーカス喪失でも閉じる」経路が消える / 場所: `app/components/common/usePopover.ts:180` / 理由: ウィンドウ blur（別アプリへ切替、iframe・ブラウザ UI へのフォーカス移動）や プログラム的 `element.blur()` で、従来は全メニュー・ポップオーバーが閉じていたが、今後は開いたままになる。本リポジトリには commit-on-blur 目的の `active.blur()` が実在する（`note/editor/NoteEditor.tsx:206`、`InlineEditor.tsx:658-660`、`FrontMatterEditor.tsx:276`）。例えば Menu が開いた状態で Cmd+S 系ショートカットが `activeElement.blur()` を呼ぶと、従来はメニューが閉じたが、今後は開いたまま、かつ新しい refocus effect が menuitem へフォーカスを戻す（blur の意図と逆方向）。現状これらの blur はエディタフィールドにフォーカスがある前提の経路で実害は薄いが、「開いたまま + 自動再フォーカス」が複合した新挙動であることは ADR-005/006 のどちらにも明記されていない / 提案: `usePopover` の JSDoc（dismiss 挙動一覧）に「focus loss (relatedTarget=null) では閉じない」を追記し、エディタ系の commit-on-blur と同時に発生するケースを想定外なら想定外と記録する。実害が出る場合は visibilitychange / window blur での明示クローズを別途検討
- **[W-002]** 毎コミット refocus effect は「フォーカスを落としたコミット」を跨いで古い `activeIndex` で DOM を引き直すため、項目集合が変わった再レンダーでズレうる / 場所: `app/components/common/useRovingMenu.ts:93-100` / 理由: RSC 再レンダーで option 群の並び・件数が変わった場合（タグ絞り込みでタグ一覧自体が変わるケースは現に起こりうる）、`items[activeIndex]` は別のオプション、あるいは `undefined`（縮んだ場合）になる。undefined なら refocus されず矢印キーが死んだままになり、TC-5 が直したのと同じ症状が件数減少時に限り再発しうる。クラッシュはない（optional chaining）が、`activeIndex >= itemCount` のまま残ると次の ArrowDown が `(activeIndex+1) % count` で不連続な位置へ飛ぶ / 提案: refocus 時に `Math.min(activeIndex, items.length - 1)` でクランプする（フォールバック先は末尾 or 先頭）。現在のタグピッカーでは選択トグルで件数が変わらないため顕在化しないが、共有フックとして将来の消費者に対する罠になる

#### Notes

- **[N-001]** `popoverSheetPanel` の `max-sm:fixed` は祖先に transform / filter / backdrop-filter があると viewport ではなくその祖先基準になる（containing block）。現消費者（FilterBar、HomePage main 配下）は安全と確認済みだが、`styles.ts` の JSDoc に「filtered/transformed ancestor 禁止」の一文があると将来の消費者が安全（`layout/styles.ts:6` のヘッダーは backdrop-filter 持ちで、ヘッダー内に置くと壊れる）
- **[N-002]** fixed 化により `PublicTopControls.tsx:381` の `DATE_POPOVER_PANEL` と `popoverSheetPanel` の max-sm セットが完全に同一になった。`popoverSheetPanel` への寄せは #588 として既に styles.ts コメントで追跡されており、本 PR でやらないのは妥当（記録のみ）
- **[N-003]** 期間（dialog ブランチ）/ 公開状態パネルには `max-h` + overflow がない（タグピッカーのみ `max-h-[min(60vh,400px)]`）。fixed ボトムシート化後、横向きスマホ等の低い viewport では期間フォームが上端を突き抜ける可能性がある。現コンテンツ量では実害は小さい
- **[N-004]** `.issue/658/adr.md` に「ADR-005」が 2 つある（focusout ガードと popoverSheetPanel 修正）。番号を振り直すべき
- **[N-005]** `multiselectable` prop は listbox ブランチのみで描画され、menu / dialog ブランチでは黙って無視される。JSDoc に「Listbox mode only」と明記済みで許容。`setActiveIndex` の公開は純粋な追加 API で既存消費者への影響なし
