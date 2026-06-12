# Review 003 — Test（ラウンド3: ゼロベースのフルレビュー）

対象: PR #659（head `issue/649/p10-toolbar-implementation`）/ 計画: `.issue/649/plan.md`（ステップ8 = テスト更新、AC-11）/ 前回: `review-002-test.md`

総評: テストスイートの品質は高い。`ViewSwitcher.test.tsx`（trigger aria / listbox / keyboard / navigation の4契約）、`Popover.test.tsx` の枝別 mousedown ガード（menu/listbox/dialog の `it.each`）、`SectionErrorBoundary` の `fallbackHeading` 文書順序固定、`listSelectors.test.ts` の ADR-005 合成規則、`NoteListToolbar.test.tsx` の `aria-disabled` + `aria-describedby` 契約、いずれも role / aria 属性ベースのセレクタと入出力検証で実装詳細への過剰結合がない。`pnpm test:unit` 全件グリーン（225 files / 3577 tests）をローカルで確認。前回 W-001（マニュアルテスト証跡の旧 aria-label）は `report.md` の注記で対応済み（再指摘しない）。ただし、注記は results 側のみで、再実行手順書である `testing.md` 本体に旧形式の期待値が残っており、これは新規の Warning とする。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** `testing.md`（再実行用の動作確認手順書）が R1 で廃止された aria-label 形式を期待結果として記載したまま / 場所: `.issue/649/testing.md:73`（「`aria-label="ビューを切り替え: 現在 すべてのノート"` 形式」）、`:84`（検索時は「`aria-label` は「ビューを切り替え」のみ（「現在 …」を付けない）」）/ 理由: 現行実装（`viewSwitcherAriaLabel`）と単体テストは R1 修正（ADR-005 改訂）後の「{可視見出し} — ビューを切り替え」形式（検索時は「「q」の検索結果 — ビューを切り替え」）。`report.md` の注記は manual-test results（証跡）側の食い違いだけを説明しており、手順書そのものは旧期待値のまま。この PR の `testing.md` を信じて再実行・回帰確認すると、正しい実装を FAIL と判定する（証跡の注記では救えない、能動的に誤判定を誘発するドキュメント）/ 提案: `:73` を「`aria-label="すべてのノート — ビューを切り替え"`（{可視見出し} — ビューを切り替え 形式）」、`:84` を「`aria-label` は「「test」の検索結果 — ビューを切り替え」（可視見出しが先頭、`.issue/649/adr.md` ADR-005）」へ更新する。あわせて `:97` の「disabled 状態」も ADR-010 反映後の「`aria-disabled="true"`（native `disabled` ではない）+ `aria-describedby` で理由提示」へ書き換えるとよい。

#### Notes

- **[N-001]**（R1/R2 N-001 の持ち越し・据え置き）`NoteListToolbar.test.tsx` の 選択 トグルは `aria-pressed="false"` 側のみ検証。`SelectionContext` モックが `mode: false` 固定のため、`mode: true` 時の `aria-pressed="true"` / `data-on`、click → `toggleSelectMode` dispatch は未検証。アイコンのみ化でトグル状態の知覚が `aria-pressed` に全面依存している点は変わらないが、manual-test TC-006 で ON/OFF 実機確認済みのため Notes 据え置き（場所: `app/components/note/list/__tests__/NoteListToolbar.test.tsx` の SelectionContext モック）。
- **[N-002]**（R2 N-002 の持ち越し・据え置き）保存ボタンの活性条件 `!hasAnyFilter && search.q === undefined` のうち「`hasAnyFilter=false` かつ `q` あり → enabled」の分岐が依然未テスト。`renderToolbar` が常に `search={{}}` のまま。`render(search: { q: "memo" }, hasAnyFilter: false)` → `aria-disabled` なし、の1アサーションで埋まる（場所: `app/components/note/list/__tests__/NoteListToolbar.test.tsx:50-57`）。
- **[N-003]**（持ち越し・低優先）`homeHeadingText("   ", "ビュー名")`（空白のみ q + viewName → viewName）組合せは未検証。`isSearchActive` の単独テストで実質カバー。
- **[N-004]**（R2 N-004 の持ち越し・据え置き）`ViewSwitcher` は `useTransition` の pending を捨てており（`const [, startTransition]`）、開き直して連打すると `router.navigate` が多重発火しうる。旧 `<select>` の `disabled={isPending}` 相当の抑止仕様もそれを固定するテストもない。TanStack Router の supersede で吸収される範囲と判断し Notes 据え置きだが、意図をコメントに残すと将来の再発防止になる（場所: `app/components/note/list/ViewSwitcher.tsx`）。
- **[N-005]** ADR-002 のデデュープ契約（`notesQuery` を `HomePage` で1回だけ構築し同一参照を `HeaderSection` / `NotesSection` へ渡す — 参照が割れると `React.cache` がミスして二重クエリ）は JSDoc とコメントで強く文書化されているが、回帰を検出するテストがない。RSC 構成のため unit 化は難しく（`cache` の参照同一性は統合レベルの観測が必要）、将来のリファクタで各セクションがローカルにクエリリテラルを組み立て直しても全テストがグリーンのまま静かに性能劣化する。対策候補: HomePage を薄い純関数（query ビルダー）に切り出して「同一入力 → 同一参照を両セクションに渡す」構造をテスト可能にする、またはローダー呼び出し回数を数える統合テスト。現状はコメントによる防御のみである点を記録しておく（場所: `app/components/note/HomePage.tsx`）。
- **[N-006]** 良い点: ① `Popover.test.tsx` の `it.each` は defaultPrevented の期待値を枝ごとにパラメタライズしつつ「inside mousedown が outside-dismiss に数えられない」ことまで同時固定しており、listbox 枝追加の回帰面を最小コストで覆っている。② `ViewSwitcher.test.tsx` の「navigate 前にトリガーへフォーカス復帰」検証（`mockImplementationOnce` で `document.activeElement` をスナップショット）は時序契約のテスト化として模範的。③ `skeletonAria.test.tsx` の非対称契約（ToolbarSkeleton = aria-hidden 装飾、status は FilterBar / NoteList のみ）が新レイアウトでも維持され、testing.md 確認項目9（アナウンス重複なし）と整合。
