# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #649 plan/adr）

#### 問題点（要修正）

- **[P-001]** ADR-002 / ステップ5 / リスク節の「`cache(serverData(...))` デデュープは引数を完全一致させれば効く」という前提が不正確。React の `cache` は引数ごとに `Object.is`（参照同一性）でメモ化キーを取るため、meta-row 境界と NotesSection がそれぞれ別のオブジェクトリテラルで `loadOwnedNotes({ actorUserId, status, page, ... })` を組み立てると、構造的に同一でも**必ずキャッシュミスし二重クエリになる**（`loaders.ts` の `loadOwnedNotes = cache(serverData(...))`、`serverAction.ts` の `serverData` は引数をそのまま透過するだけで正規化しない）。計画どおりの実装をすると「I/O は1回」という ADR-002 の Decision の根拠が成立しない。
  提案: HomePage（同期部）で `OwnedNotesQuery` オブジェクトを**1回だけ構築し、同一参照を両セクションへ props で渡す**こと（同一リクエスト内なら参照が保たれ dedup が効く）。または件数だけを返す軽量ローダー分離 / meta-row と NotesSection の境界統合のいずれかを明示的に選ぶ。plan のリスク節の文言「引数（page/limit/フィルタ）を完全一致させないと」も「同一オブジェクト参照を共有しないと」に修正すべき。

#### 改善提案（検討推奨）

- **[S-001]** ステップ2/3 の対象ファイルに `app/components/common/useRovingMenu.ts` が漏れている。`itemRole` の型は現状 `"menuitem" | "menuitemradio"` のみで、`itemRole: "option"` を使うには型拡張が必要（`useRovingMenu.ts:23`）。また `Popover.tsx` のパネル分岐は `haspopup === "menu"` ? menu : dialog の二分岐で、listbox では「`role="listbox"` パネル + `onMenuKeyDown` 配線 + menu 枝と同じ `onMouseDown` preventDefault（blur→close でクリックが落ちる Safari/Firefox 対策）」が必要になる。step 2 の「最小限の調整」の中身として明記しておくと実装ブレを防げる。
- **[S-002]** ADR-002 の境界統合により、`loadOwnedNotes` の失敗（ノート一覧クエリのエラー）が見出し + ViewSwitcher まで巻き込んで `SectionErrorBoundary` のフォールバックに落とす。従来は見出し（同期）とビュー切り替えは一覧エラーの影響外だった — ビュー切り替えは「条件を変えてエラーから脱出する」導線でもあるため、エラードメインの結合は UX 上の後退になりうる。許容するなら ADR-002 の Consequences（トレードオフ）に明記し、resetKey による回復経路（URL 変更でリセット）が残ることを根拠として書いておくこと。
- **[S-003]** 現行 `ToolbarSkeleton` は「3つ目の『読み込み中』アナウンスを重ねない」ため意図的に `aria-hidden` の装飾（skeletons.tsx 冒頭コメント）。ステップ7 の「`role="status"` の読み込みアナウンスは…1つに集約」は方向としては良いが、件数行（従来 NoteListSkeleton 側でアナウンスされていた領域）が meta-row へ移ることでどの skeleton が status を持つかの再設計になる。NotesSection / FilterBar の既存 `role="status"` との重複・欠落をテストで固定する旨を step 8 に含めると安全。
- **[S-004]** 検索時（`isSearchActive(q)`）の見出しは「「q」の検索結果」のままトリガー機能を維持するとあるが、その場合 `aria-label="ビューを切り替え: 現在 {名前}"` の「現在」が検索文言と乖離する（ビュー名でなく検索結果を見ている）。aria-label の合成規則（検索時は「ビューを切り替え」のみ等）を listSelectors のセレクタ仕様として確定し、step 8 の単体テスト対象に含めることを推奨。

#### 良い点

- 確定モック（`P10-home.html` の `.view-switcher` / `.page-meta-row` / `.segmented` / `.filter-clear-x`、aria 属性込み）と AC が1:1で対応しており、実コード（`NoteListToolbar.tsx` の `onSelectView` #215/#219 コメント、`DisplayModeSwitch` の tablist 契約、`FilterBar.clearAll`、`skeletons.tsx`）の現状把握が正確。壊れるテスト（`tabByLabel` の textContent 依存、#382 CTA 契約）まで具体的に特定済み。
- スタイリングが規約どおり: 新スタイルはすべて `note/list/styles.ts` の module-scope 定数 + `data-*` バリアントで、新規 CSS ファイルや `@apply` を導入しない。44px 当たり判定の擬似要素拡張・focus-visible 明示も CLAUDE.md の utility-first 方針内で完結。
- ADR-001（Popover の `PopupRole: "listbox"` 拡張）は自前ポップオーバー再実装を避ける正しい判断で、#467 の二層構造（usePopover / useRovingMenu）と整合する。
- ADR-003（title 常時レンダー）は SSR + hydration の制約を踏まえた現実的な解釈で、「省略可 ≠ 禁止」の根拠も妥当。
- ADR-004（P30 実装は #619 へ委譲、モックのみ更新）はスコープ境界が明確で、#619 へのコメント残しまで含め二重管理を回避している。非表示モード用途 `.segmented`（P15/P16/P18）を不変とする範囲限定も #626 ADR-001 の Supersede 範囲と一致。
- ドメイン / アプリケーション層に手を入れない純 presentation 変更であることを明示し、レイヤー越境がない。
