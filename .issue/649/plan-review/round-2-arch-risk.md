# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #649 plan/adr）

## Round 1 指摘の反映確認

- **P-001（React `cache` の参照同一性デデュープ）— 反映は正しい。** 修正後の設計（`OwnedNotesQuery` を同期の `HomePage` 本体で1回構築し、同一オブジェクト参照を meta-row 境界と NotesSection へ props で渡す）を実コードで検証した:
  - `app/components/note/loaders.ts:149` の `loadOwnedNotes = cache(serverData(...))` に正規化はなく、参照共有がデデュープ成立の唯一の条件という記述は正確。
  - RSC の props はサーバーコンポーネント間（`HomePage` → `NotesSection` / meta-row セクション）では直接渡しで、クライアント境界（`SectionErrorBoundary` は children スロット）を挟んでもサーバー側でレンダーされるため参照同一性は保たれる。同一リクエスト内の `cache` スコープとも整合し、設計として成立する。
  - plan のステップ5・リスク節・ADR-002 の文言（「引数の完全一致では不十分、参照共有が前提条件」）も一貫して修正済みで、相互矛盾なし。
- **S-001（`useRovingMenu.ts` の `itemRole` 型 / `Popover.tsx` の listbox 枝）— 正確に反映。** `useRovingMenu.ts:23` の `itemRole?: "menuitem" | "menuitemradio"` への `"option"` 追加、`Popover.tsx:87` の `haspopup === "menu" ? menu : dialog` 二分岐への listbox 枝追加（`onMenuKeyDown` 配線 + menu 枝と同じ `onMouseDown` preventDefault）が、現行コードの構造どおりにステップ2へ明記されている。
- **S-002（境界統合のエラー巻き込み）** — ADR-002 Consequences とリスク節に resetKey（`homeSectionResetKey` は実在し URL 由来の全ローダー入力をキーにしている）を根拠とした許容判断が明記済み。妥当。
- **S-003（skeleton の `role="status"` 再設計）** — ステップ7に集約方針、ステップ8に重複・欠落の固定テストが追加済み。現行 `skeletons.tsx` の「ToolbarSkeleton は aria-hidden 装飾」という前提把握も正確。
- **S-004（検索時 aria-label 合成規則）** — adr.md ADR-005 として明文化され、AC-2 / listSelectors / ステップ8 に一貫して反映済み。`isSearchActive` / `homeHeadingText`（`listSelectors.ts:469-476`）の現状とも整合。

## 問題点（要修正）

問題点ゼロ。

## 改善提案（検討推奨）

- **[S-001]** ステップ7は `ToolbarSkeleton` のみ対象だが、件数行が NotesSection から meta-row へ移るなら、`NoteListSkeleton` 先頭の件数ラインプレースホルダ（`skeletons.tsx:76` の `h-4 w-24 mb-7` バー）も削除しないと、読み込み中に「meta-row 側の件数プレースホルダ + 一覧スケルトン側の件数バー」が二重に出る。ステップ7の対象に `NoteListSkeleton` の件数バー削除を一言加えると実装ブレを防げる。
- **[S-002]** 見出し（`<h1>`）が async 境界の中へ移ることで、フォールバック表示中およびエラーフォールバック時はページに `<h1>` が存在しなくなる（現状は同期 `<h1>` が常時ある）。スケルトンモックどおりではあるが、エラー時（`SectionErrorBoundary` の section 名表示のみ）に見出しレベル構造が欠けるのは小さな a11y 後退。許容するなら ADR-002 のトレードオフに一行追記、あるいは実装時に `<h1>` 枠だけ同期に残し中身（ビュー名 + トリガー）を Suspense 内にする案を検討余地として書いておくとよい。

## 良い点

- P-001 の修正は表面的な文言差し替えでなく、設計節・ステップ5・リスク節・ADR-002 の全箇所で「参照同一性」へ統一されており、クエリ構築の所在（NotesSection → HomePage 引き上げ）まで具体化されている。実コード（`HomePage.tsx:169` の境界内インラインリテラル組み立て）に対する変更指示として正確。
- ステップ2の記述が `usePopover.ts` / `Popover.tsx` / `useRovingMenu.ts` の現行実装と1:1で対応し、「既存 dialog / menu 利用箇所の挙動不変」の制約も明示されている。
- 確定モック（`P10-home.html` の `.view-switcher` / `.page-meta-row` / `.filter-clear-x`、aria 属性込み）・P30 系モック・対象実装ファイルはすべて実在し、AC との対応も正確。viewId の SavedView 展開がルート側（`app/routes/_app/index.tsx`）で完結している現状とも矛盾しない。
- スコープ外判断（#619 委譲・ADR-008 別 Issue 起票のステップ10化）が作業として閉じており、追跡漏れがない。
