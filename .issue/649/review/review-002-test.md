# Review 002 — Test（ラウンド2: ゼロベースのフルレビュー）

対象: PR #659 / 計画: `.issue/649/plan.md`（ステップ8 = テスト更新、AC-11）/ 前回: `review-001-test.md`

総評: 前回指摘（W-001〜003）はすべて正しく修正されている。
W-001 → `ViewSwitcher.test.tsx` に keyboard contract describe（initialIndex で選択中 option に roving 着地 / ArrowDown・ArrowUp・Home・End / Escape で close + トリガーへフォーカス復帰 / 選択時に navigate **前**にフォーカス復帰）が4本追加され、`Popover` listbox 枝の `onMenuKeyDown` 配線が unit で固定された。
W-002 → 実装側も `selectedIndex = findIndex + 1 = 0` フォールバックに揃えられ（`ViewSwitcher.tsx` のコメントどおり見出し・aria-selected・初期フォーカスが三者一致）、`viewId: "gone"` の契約テストで固定。指摘した「実装の矛盾」そのものが解消されたうえでテスト化されており理想的な対応。
W-003 → `Popover.test.tsx` に `it.each([menu/listbox=prevented, dialog=not])` のパラメタライズが追加され、枝ごとの mousedown ガード契約 + inside-mousedown が outside-dismiss に数えられないことまで固定。
さらに R1 全体レビュー由来の修正（ADR-005 改訂の `viewSwitcherAriaLabel` 合成規則・`SectionErrorBoundary` の `fallbackHeading`・ADR-010 の `aria-disabled` 保存ボタン）にもそれぞれ契約テストが追随しており（`listSelectors.test.ts` / `SectionErrorBoundary.test.tsx` / `NoteListToolbar.test.tsx`）、テストが設計判断（ADR 番号・WCAG 根拠）をコメントで参照する形は契約妥当性の点で良質。実装詳細への過剰結合も見当たらない（セレクタは role / aria 属性ベース、navigate 契約は search 関数へ `prev` を注入して入出力で検証、クラス名・寸法への依存なし）。`skeletonAria.test.tsx` の非対称契約（ToolbarSkeleton = aria-hidden のみ）も新レイアウトで維持。対象テストはローカルで green を確認。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** マニュアルテスト成果物が、R1 修正で廃止された aria-label 形式を PASS 証跡として記録したまま / 場所: `.issue/649/manual-test/results/TC-003.md:9`, `TC-004.md`（手順3）, `EDGE-001.md:11`, `EDGE-002.md:10`, `EDGE-005.md`（手順2）, `report.md` / 理由: これらは `aria-label="ビューを切り替え: 現在 すべてのノート"`（非検索時）・検索時「ビューを切り替え」のみ、という**当初実装**の値を期待値ごと PASS と記録している。しかし R1 レビュー（B-001 / ADR-005 改訂、commit b4430bf8）で合成規則は「{可視見出し} — ビューを切り替え」へ変更済みで、現行コード（`viewSwitcherAriaLabel`）・単体テストとも新形式。つまりマニュアル検証は修正前のコードに対する実行で、ADR-005 関連ケースの証跡が最終形と一致していない。単体テストが新規則を固定しているため機能リスクは低いが、PR に含まれる検証レポートとしては「PASS の根拠が現物と食い違う」状態 / 提案: 該当ケース（TC-003 手順1 / TC-004 手順3 / EDGE-001/002/005 の aria-label 検査行）だけ再実行して更新するか、report.md に「aria-label 形式は R1 修正で変更済み・新形式は unit（listSelectors / ViewSwitcher）で担保」と注記する。

#### Notes

- **[N-001]**（前回 N-001 の持ち越し）`NoteListToolbar.test.tsx` の 選択 トグルは依然 `aria-pressed="false"` 側のみ。`SelectionContext` モックが `mode: false` 固定 + `dispatch: vi.fn()` がインライン生成のため、`mode: true` 時の `aria-pressed="true"` / `data-on`、click での `toggleSelectMode` dispatch が未検証のまま。アイコンのみ化でトグル状態の知覚が `aria-pressed` に依存している点は前回どおり（場所: `app/components/note/list/__tests__/NoteListToolbar.test.tsx` の SelectionContext モック）。
- **[N-002]** 保存ボタンの活性条件 `!hasAnyFilter && search.q === undefined` のうち「`hasAnyFilter=false` だが `q` あり → enabled」の分岐が未テスト。`renderToolbar` が常に `search={{}}` で、`hasAnyFilter` の真偽しか動かしていない。検索のみをビューとして保存する経路の契約なので、`render(search: { q: "memo" }, hasAnyFilter: false)` → `aria-disabled` なし、の1アサーションで埋まる（場所: `app/components/note/list/__tests__/NoteListToolbar.test.tsx:47-56`）。
- **[N-003]**（前回 N-003 の持ち越し・低優先）`homeHeadingText("   ", "ビュー名")`（空白のみ q + viewName）→ viewName を返す組合せは依然未検証。`isSearchActive` 経由で実質カバー。
- **[N-004]** 旧ツールバー `<select>` は `disabled={isPending}` でナビゲーション中の再選択を抑止していたが、`ViewSwitcher` は `useTransition` の pending を捨てており（`const [, startTransition]`）、listbox を開き直して連打すると `router.navigate` が多重発火しうる。挙動契約として固定するテストもない。実害は TanStack Router の supersede で吸収される範囲と思われるが、抑止を仕様とするなら pending ガード + テスト、不要とするならコメントで意図を残すとよい（場所: `app/components/note/list/ViewSwitcher.tsx`）。
- **[N-005]** 良い点: ① ViewSwitcher の「navigate 前にトリガーへフォーカス復帰」を `navigateMock.mockImplementationOnce` で `document.activeElement` をスナップショットして検証する手法は、コメントだけだった契約を実行時序込みで固定しており秀逸。② `SectionErrorBoundary` の `fallbackHeading` テストが `compareDocumentPosition` で「h1 が alert に先行する」文書順序まで固定。③ P30 モック追従（AC-12）は静的 HTML のため unit 対象外だが、manual-test TC-010 / IMPACT-007 で適用範囲（P15/16/18 不変）込みに検証されておりカバレッジ計画と整合。
