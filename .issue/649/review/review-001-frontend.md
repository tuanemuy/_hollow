# PR #659 レビュー — Frontend（コンポーネント設計・RSC/Suspense・状態管理・スタイル規約）

対象: `feat(ui): #626 確定デザインの実装反映`（branch `issue/649/p10-toolbar-implementation`）
検証: `pnpm typecheck` PASS / `pnpm test:unit` 3568 passed / `pnpm lint` 変更ファイルに指摘なし。
確定モック `spec/design/pages/P10-home.html` / `mobile/P10-home.html` / `P10-home-skeleton.html` と突合済み。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** 計画ステップ8が約束した「境界再構成後に `role="status"` が重複・欠落しないことを固定するテスト」が追加されていない / 場所: `app/components/note/list/skeletons.tsx:31`（`ToolbarSkeleton`）、テスト不在 / 理由: 実装は `ToolbarSkeleton` 全体を `aria-hidden` にして読み込みアナウンスを FilterBar / NoteList 側へ集約したが（コメントで意図は明記）、確定スケルトンモックは `sk-header` に `role="status" aria-live="polite" aria-label="ノート一覧を読み込み中"` を置いており（`P10-home-skeleton.html:748`）、ここはモックと意図的に乖離している。さらに HeaderSection は `Promise.all(savedViews, ownedNotes)`、NotesSection は `ownedNotes` のみを await するため、「savedViews だけが遅い」ケースでは一覧が表示済み・見出しはスケルトン・ページ上に読み込みアナウンスも `<h1>` もゼロ、という状態が成立する。現状この集約方針を守るテストがなく、将来どれかのスケルトンに `role="status"` が足されたり外れたりしても検知できない / 提案: 最低限「`ToolbarSkeleton` は `aria-hidden` でアナウンスを持たない」「`NoteListSkeleton` / `FilterBarSkeleton` が `role="status"` を1つずつ持つ」を固定する単体テストを追加。あわせてモックとの乖離（status の所属を sk-header → 一覧側へ変更した判断）を `.issue/649/adr.md` か skeletons.tsx の注記に「モックと異なる」と明示するか、モック側の `role="status"` 注記を実装方針に合わせて更新する。

- **[W-002]** 検索中のトリガーで可視テキストと accessible name が不一致（WCAG 2.5.3 label-in-name） / 場所: `app/components/note/list/listSelectors.ts:519`（`viewSwitcherAriaLabel`）、`app/components/note/list/ViewSwitcher.tsx` / 理由: 検索中は可視見出し「「memo」の検索結果」に対し `aria-label="ビューを切り替え"` となり、可視ラベル文字列を accessible name が含まない。音声操作ユーザーが見出しを読んでターゲット指定できない。ADR-005 で「現在 …」を落とす判断自体は妥当だが、可視文字列を含まない形まで縮める必要はなかった / 提案: 検索時は `aria-label="ビューを切り替え（「memo」の検索結果）"` のように可視テキストを包含する合成にする（矛盾排除と 2.5.3 を両立できる）。ADR-005 を維持するならトレードオフとして 2.5.3 への影響を ADR に追記。

#### Notes

- **[N-001]** React `cache` の参照同一性デデュープ（ADR-002）の実装が正確。`OwnedNotesQuery` を同期の `HomePage` 本体で1回だけ構築し、同一参照を `HeaderSection` と `NotesSection` の両方へ props で渡しており、JSDoc にも「structurally-equal literal だと二重クエリになる」根拠が明記されている（`HomePage.tsx`）。境界粒度の変更理由がコードコメントで追跡できる良い状態。
- **[N-002]** `PopupRole: "listbox"` 拡張が最小差分で、既存 dialog / menu 利用箇所（FilterBar の期間ダイアログ・公開状態 menu・VisibilityPopover 等）への挙動影響なし（型は union 追加のみ、`Popover.tsx` は listbox 枝の追加のみ。`usePopover` 内部に role 条件分岐なしを確認）。menu 枝と同じ `onMouseDown` preventDefault（Safari/Firefox の blur→close でクリックが落ちる対策）を listbox 枝にも複製しているのが丁寧。
- **[N-003]** モック忠実度は高い。view-switcher（gap 10px/8px・`-ml` 相殺・padding 2px 10px/8px・mobile min-h 44px・chevron ink-tertiary 縦中央）、page-meta-row（space-between / mb-5 / flex-wrap）、segmented（32×28 / 36×32・ink 濃度差・白カード/shadow 廃止）、filter-clear-x（28/32px・hover surface+ink）、ToolbarSkeleton（34px×35% 見出しバー・110px 件数ライン・36px 角×2・104×32 segmented）まで desktop / mobile の確定モックと一致。P30 系モックの segmented 追従（AC-12）も desktop=title 併記 / mobile=aria-label のみ、で契約どおり。
- **[N-004]** ADR-006（パネルは `<h1>` の外）の実装が正しい: `trigger` render prop 側で `<h1><button/></h1>` を描き、パネルは `text-sm font-regular tracking-normal leading-normal` で見出し書体の継承を打ち切っている。HTML 妥当性（h1 内は phrasing のみ）と Popover の dismiss/フォーカス管理の再利用を両立。
- **[N-005]** 細部: (a) `ViewSwitcher.tsx` の `initialIndex = selectedIndex < 0 ? 0 : selectedIndex` は `findIndex + 1 >= 0` のため到達しない死分岐（無害だが `findIndex` の結果で分岐する方が意図が読める）。(b) mobile モックのクリア × アイコンは 14px、実装は `--icon-xs`（13px）共通 — 1px の乖離（desktop は 13px で一致）。(c) mobile segmented の擬似要素当たり判定は横 40px（`-inset-x-0.5`）で 44px に届かないが、隣接干渉回避のため横を控えめにする判断は計画リスク節・モック注記（「44×44px 相当」）の範囲内。
- **[N-006]** スタイル規約準拠: 新規定数は `styles.ts` の module-scope 文字列（`TOOLBAR_ICON_BTN` / `filterClearX`）、状態は `data-active` / `data-on` / `data-icon` の `data-*` パターン（`value || undefined` 規約）、`title` 常時レンダー（ADR-003）、`focus-visible` リングをアイコンのみ化した全コントロール（segmented / 選択 / ビュー保存 / クリア × / 見出しトリガー）に明示 — AC-9 充足。テスト更新も計画ステップ8の項目（W-001 の skeleton テストを除き）を網羅し、ナビゲーション契約（#215/#219）を ViewSwitcher テストへ正しく移植している。
