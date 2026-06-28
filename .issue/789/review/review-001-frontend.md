# Frontend レビュー — PR #802 (Issue #789)

## Blockers
なし

## Warnings

**[W-001]** aria-selected 属性の false 状態の明示
  - 場所: `app/components/note/editor/TagsInput.tsx:244`
  - 理由: `aria-selected={isActive}` で active でないときに `aria-selected="false"` が付与される。通常は非付与（デフォルト false）か、true のときのみ付与するパターンが一般的だが、ARIA 仕様では `aria-selected="false"` も有効な値。ただし、同じコンテナの `data-active` で視覚的アクティブを管理しており、二重表現になっている。
  - 提案: DirectoryTreeSelect の実装と一貫性を確認し、必要に応じて `aria-selected` を true のときのみ付与する方式への統一を検討。現在の実装は plan.md どおりなので実装ミスではないが、ARIA の冗長性削減の観点から見直す価値あり。

**[W-002]** Popover vs 手書き絶対配置の viewport クランプ未実装
  - 場所: `app/components/note/editor/TagsInput.tsx:227-266` (tagSuggestPanel)
  - 理由: ADR-004 で「トレードオフ: Popover が内蔵する viewport クランプを自前で担保する必要がある」と記録。スタイル側で `max-sm:left-0 max-sm:right-0` による mobile 全幅化は `dirDropdownPanel` を踏襲しているが、デスクトップでの horizontal クランプ（右端はみ出し制御）がない。小幅 viewport でパネルが画面外にはみ出す可能性がある。
  - 提案: (a) 現在の実装で問題が出ていなければそのまま進める（手動テストレポートに言及がないため）、(b) 将来 viewport width が制約される環境で問題が出た場合は `clampToViewport` 相当の実装を追加する計画を ADR-004 に記録。plan.md のトレードオフ既知なので実装ミスではなく、設計上の選択肢。

## Notes

**[N-001]** aria-activedescendant 方式の -1 始点実装が完全
  - 場所: `app/lib/tagSuggestModel.ts` (clampSuggestIndex / nextSuggestIndex)、`TagsInput.tsx` (line 76, 99, 104-106)
  - 要点: DirectoryTreeSelect の下限 0 を仮定するヘルパとの非互換性を的確に把握し、独立した -1 保持版ヘルパを新設。draft 変化で activeIndex = -1 にリセットされ、candidates.length 変化の clamp useEffect でも 0 に押し戻されない。「最初の ↓ で先頭候補 index 0 を飛ばさない」が保証される。テストも完全（nextSuggestIndex(-1, "down", n) === 0 の境界テスト含む）。

**[N-002]** panelOpen と ARIA 属性の役割分離が正しい
  - 場所: `TagsInput.tsx` (line 92, 201-205)
  - 要点: パネル可視述語 `panelOpen = open && (hasSuggestions || isNewDraft)` に対して、`aria-expanded` は `panelOpen` を反映し、`aria-controls`/`aria-activedescendant` は `open && hasSuggestions` のみ付与（listbox 実在時）。新規作成行のみ表示時に `aria-expanded="true"` 且つ `aria-controls` 非付与という組み合わせが許容される。ARIA APG combobox パターンに準拠。

**[N-003]** matchKey の lenient 設計が correct
  - 場所: `tagSuggestModel.ts:33-39` (matchKey 関数)
  - 要点: 長さ・空白検証を含めない lenient 仕様で、入力途中の未確定 draft（51 文字など）でも候補計算が継続される。validationError は validateTagDraft（TagName.create 権威）で別途チェック。51 文字 draft でも既存候補が表示される（display のみ）一方、新規作成行は表示されない（isNewDraft で validationError をチェック）。ルール重複を回避しながら UX をまとめた好例。

**[N-004]** IME ガード（矢印含む）が実装済み
  - 場所: `TagsInput.tsx:127-139` (ArrowDown/Up)、`141-161` (Enter/comma)
  - 要点: `event.nativeEvent.isComposing` で Enter/comma だけでなく ArrowUp/Down も guard。DirectoryTreeSelect は Enter のみ guard だが、本実装は矢印も cover。日本語 IME で変換候補選択に矢印が使われることに対応。計画で「矢印もガードする」と明記され、正確に実装された。

**[N-005]** option の onMouseDown preventDefault で blur 暴発が防止
  - 場所: `TagsInput.tsx:248`
  - 要点: option click 時に onMouseDown preventDefault で実フォーカスを奪わない設計。blur commit トリガーは option click 由来でなく、他の要素への click のときのみ発動。onBlur (line 219-224) でも draft.trim().length > 0 且つ validationError === null でのみ commit。二重防御。

**[N-006]** 後方互換性が完全
  - 場所: `NoteEditor.tsx:102` (tagSuggestions?: readonly string[])
  - 要点: SharedProps への tagSuggestions 追加が optional（省略時 []）。grep 確認で NoteEditor の全呼び出し元（new.tsx / edit.tsx）が tagSuggestions を正しく配線。IngestionPreviewForm など他の利用箇所なし。後方互換性が完全に保たれている。

**[N-007]** テストの充実度
  - 場所: `__tests__/tagSuggestModel.test.ts`、`__tests__/TagsInput.test.tsx`
  - 要点: tagSuggestModel の border テスト（#Foo 確定済みが Foo 候補を除外、51+1 トークン検証など）、TagsInput の combobox 機能テスト（無アクティブ Enter で draft 確定、Escape 後 aria-expanded=false、新規作成行のみ表示時の aria-controls 非付与など）が plan.md の要件をすべてカバー。既存ロック 6 点も維持。

**[N-008]** スタイリング規約の厳格な準拠
  - 場所: `styles.ts:88-151`
  - 要点: 新規追加クラス定数がすべて Tailwind ユーティリティのみ（タグSuggestPanel の z-30、tagInputControl の focus-visible:shadow-none など）。data-* 属性で state 管理。CSS/@apply を追加しない CLAUDE.md 規約を完全に守られている。タイトル入力の focus-visible:shadow-none 打ち消しと同じパターンを流用（二重リング回避）。

**[N-009]** 空 draft でのパネル非表示が正しい
  - 場所: `tagSuggestModel.ts:76-77` (filterTagSuggestions の empty draft guard)
  - 要点: trim() 後に空（または空白のみ）の draft では filterTagSuggestions が [] を返す（空 draft → 空配列の契約）。フォーカスしただけでは全タグ候補がダンプされない（`aria-expanded="false"`、エラーも非表示）。入力開始時に初めてパネルが開く。意図通りで、UX 上の噪音を排除。

**[N-010]** リビジョン履歴と ADR の充実度
  - 場所: `plan.md:170-209` (レビュー履歴)、`.issue/789/adr.md`
  - 要点: 3 周のレビューサイクルで arch-risk 5 項目・coverage 指摘が収束。各 ADR が Decision/Consequences を明確化。plan.md の AC 表が明確で、実装との traceability が強固。issue / PR コメント内での議論が計画に即座に反映されている。

---

## 総括

Frontend の実装は計画 Issue #789 / ADR をすべて満たしており、下記の観点で高品質：

- **combobox ARIA**: activedescendant 方式で実フォーカスは input 固定。aria-expanded / aria-controls / aria-activedescendant の役割分離が正しい。新規作成行のみ表示時も矛盾ない。
- **-1 始点ナビゲーション**: directoryTreeModel との非互換性を適切に判断し、専用ヘルパを新設。draft 変化で -1 リセット、candidates 長変化でも 0 に押し戻されない。
- **IME 対応**: 矢印キーも含めた isComposing ガード。日本語入力の誤動作防止が完全。
- **UI state 管理**: open / activeIndex を useState に局所化し、reducer は不変。transient state と model state の分離が清潔。
- **入力検証**: matchKey lenient + validateTagDraft（TagName 権威）で二重防御。51 文字 draft での表示分岐も正しい。
- **スタイリング**: Tailwind ユーティリティのみ。data-* 属性と focus-within で UX 可視化。
- **テスト**: 単体 + コンポーネント両層で充実。既存ロック維持 + 新規機能カバー完全。
- **後方互換性**: tagSuggestions 任意（省略時 []）で既存呼び出し元への影響ゼロ。

**警告 2 点** はいずれも plan.md / ADR で既知のトレードオフ・設計選択であり、実装ミスではありません。

**「APPROVED」**
