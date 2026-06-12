# PR #659 レビュー（Round 3 / Frontend・ゼロベースフルレビュー）

対象: `gh pr diff 659`（HomePage / ViewSwitcher / NoteListToolbar / DisplayModeSwitch / FilterBar / skeletons / styles / Popover・usePopover・useRovingMenu・SectionErrorBoundary / P30 モック / テスト一式）
計画: `.issue/649/plan.md` / `.issue/649/adr.md`

確認した主要観点（問題なし）:

- React `cache` の参照同一性デデュープ — `notesQuery` は同期 `HomePage` 本体で1回だけ構築され、同一参照が `HeaderSection` / `NotesSection` 両方へ渡る（ADR-002 どおり）。
- ViewSwitcher のナビゲーション契約 — `onSelectView` は旧 select から #215/#219 コメント込みで忠実に移植。未知 viewId の `findIndex + 1 = 0` フォールバックは見出し・aria-selected・初期フォーカスで一貫。
- Popover の listbox 枝 — menu 枝と同じ `onMouseDown` preventDefault（Safari/Firefox click-drop ガード）、`role` リテラル維持、dialog 枝は意図的に除外。テストで3枝とも固定済み。
- ADR-006（パネルは `<h1>` の外）— trigger render prop 内で `<h1><button/></h1>`、パネルはコンテナ直下で書体リセット済み。HTML 妥当性 OK。
- `TOOLBAR_ICON_BTN` の `sm:h-9` / `data-[icon]:sm:w-9` override — variant が base（`h-10` / `data-[icon]:w-10`）より後にソートされ確実に勝つ。モバイルは `pillBtnIcon` の 44px 床がそのまま有効。
- ADR-010（`aria-disabled` + onClick ガード + `aria-describedby`）— 実装・テストとも整合。`pillBtn` の `aria-disabled:opacity-disabled` / hover ガード（`not-aria-disabled:`）が効く。
- segmented / クリア × の max-sm 擬似要素当たり判定、focus-visible リング（AC-8/9）、skeleton の `role="status"` 非対称契約（ADR-007）、P30 モック追従（実装は #619 委譲・非表示モード用途は未変更）— いずれも妥当。

## Blockers

なし。

## Warnings

### FE-W-001: エラーフォールバックの静的 `<h1>` に `[overflow-wrap:anywhere]` がない

- 場所: `app/components/note/HomePage.tsx` — `SectionErrorBoundary` の `fallbackHeading`
- 理由: 旧同期 `<h1>` は `[overflow-wrap:anywhere]` を持っていた（長い空白なし検索語での横はみ出し対策）。新しい通常系は ViewSwitcher の TRIGGER 側でこれを維持しているが、ADR-009 で追加されたエラーフォールバック用 `<h1>`（`homeHeadingText(search.q)` を表示）からは漏れている。検索中（`q` が長い連続文字列）にツールバー境界がエラーになると、フォールバック見出しがモバイル幅で横にはみ出しうる小さな後退。
- 提案: `fallbackHeading` の `<h1>` className に `[overflow-wrap:anywhere]` を追加する。

## Notes

### FE-N-001: ViewSwitcher TRIGGER がタッチ床 44px をリテラルで重複定義

- 場所: `app/components/note/list/ViewSwitcher.tsx` — `TRIGGER` の `max-sm:min-h-[44px]`
- 理由: `app/components/common/styles.ts` の JSDoc（#633 ADR-001）は「具体 px は `TOUCH_TARGET` に一元管理」と定めている。`TRIGGER` は同値をリテラルで持つため、床値変更時の追従漏れリスクがある。
- 提案: `TOUCH_TARGET` をテンプレートに合成する（`` `... ${TOUCH_TARGET}` ``）。

### FE-N-002: ToolbarSkeleton と実体のわずかな寸法差

- 場所: `app/components/note/list/skeletons.tsx` — 見出しバー `h-[34px]` + `mb-3` に対し、実体は h1（text-3xl/leading-tight + ボタン py-0.5 ≈ 38px）+ ラッパー `mb-[10px]`
- 理由: 解決時に数 px の累積シフトが出る。スケルトンの厳密一致は要求されていないため Note 留め。
- 提案: 必要なら `h-[38px]` / `mb-[10px]` 程度に寄せる（任意）。

### FE-N-003: NoteListToolbar の `saveDisabled` で `search.q === undefined` 条件が実質デッドコード

- 場所: `app/components/note/list/NoteListToolbar.tsx` — `const saveDisabled = !hasAnyFilter && search.q === undefined;`
- 理由: `HomePage` は `hasAnyFilter={hasAnyFilter || search.q !== undefined}` を渡すため、`q` が定義済みなら prop が常に true で第2条件は到達しない。挙動は正しいが、判定責務が呼び出し側と二重になっており将来の変更で食い違いやすい。
- 提案: 判定をどちらか一方（prop 名を `canSaveView` 等にして HomePage 側へ集約、またはツールバー側で `search` から導出）に寄せる（任意）。

### FE-N-004: ViewSwitcher の `useTransition` が `isPending` を捨てている

- 場所: `app/components/note/list/ViewSwitcher.tsx` — `const [, startTransition] = useTransition();`
- 理由: 旧 select は `isPending` 中 `disabled` で二重ナビゲーションを抑止していた。現実装は選択時に即パネルが閉じるため実害はほぼない（後続 navigate が前を supersede する）が、pending 表示・抑止の手段を失っている点は把握しておきたい。情報共有のみ。
