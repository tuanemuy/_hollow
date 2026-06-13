# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #689）

レビュー対象: `.issue/689/plan.md` / `.issue/689/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

確定済みユーザー判断（タグのチップ化・ディレクトリ完全移行）は前提として尊重し、蒸し返さない。

---

#### 問題点（要修正）

- **[P-001]** ディレクトリドロップダウンの a11y 構造（`Popover` listbox + 内包 search `combobox` + `useRovingMenu` 実フォーカス roving）の組み合わせに既存先例がなく、計画は2つの異なる roving モデルの統合を「実装ステップ6bで確定」として未決のまま残している。
  - 理由: 実コードを確認した結果、`Popover`（`haspopup="listbox"`）+ `useRovingMenu`（`itemRole:"option"`）の先例は `ViewSwitcher` のみで、これは**検索 input を持たない**。一方、検索付きディレクトリ選択の既存実装 `DirectorySelectField` / `NotePickerDialog` は `Popover`/`useRovingMenu` を**使っておらず**、自前の open / `activeIndex` / `aria-activedescendant` で combobox+listbox を駆動している。両者は roving の実現方式が根本的に異なる: `useRovingMenu` は `activeIndex` を**実 DOM `.focus()`** に反映する（panelRef.querySelectorAll(`[role=option]`)[activeIndex].focus()）のに対し、combobox パターンは検索 input にフォーカスを残したまま `aria-activedescendant` で論理的アクティブ option を指す。`role="listbox"` の直下に `role="combobox"`/`textbox` を子として置くのは WAI-ARIA 的にも不正（listbox の子は option/group のみ）。計画はこの2モデルを `Popover` の単一 `role="listbox"` パネル内で同居させようとしているが、最も難しい統合点を「6bで確定」と先送りしており、ADR-003 の「`Popover`/`useRovingMenu` 再利用で作り込みを最小化」という前提（=本Issue最大ステップの工数見積もりの根拠）が揺らぐ。
  - 提案: 計画段階で a11y モデルを1つに確定する。現実的な選択肢は2つ:
    (a) **combobox 主導**: パネルの role を `listbox` ではなく検索 input を `role="combobox"` の外側トリガーとし、`DirectorySelectField` 方式（`aria-activedescendant` + 自前 activeIndex、実フォーカスは検索 input に固定）で option を駆動する。この場合 `useRovingMenu` は使わず（実フォーカス roving と相反するため）、`Popover` は閉じ/フォーカス復帰/クランプの土台としてのみ使う。可視 option フラット列の index 管理（ステップ6 の純粋関数）はそのまま活きる。
    (b) **listbox 主導**: 検索 input をパネルの**外**（pill トリガーの直後など listbox の兄弟）に置き、`useRovingMenu` の実フォーカス roving を option に使う。ArrowDown で input→listbox へフォーカス移譲。ただし「検索しながら矢印で候補移動」の体験は (a) に劣る。
    いずれにせよ「`Popover` listbox パネルの中に検索 combobox を子として入れ、かつ `useRovingMenu` で option を実フォーカス roving する」三重同居は避ける。ADR-003 に採用モデルと「`useRovingMenu` を使うか否か」を明記し、工数・リスク見積もりを更新する。

- **[P-002]** 未確定 draft を submit/autosave 直前に確定する設計が、`useAutosave` のスナップショット依存（`useMemo` の deps）および「draft タイプ中に空打ち autosave が走る」挙動と整合していない。
  - 理由: ADR-001 は「submit/autosave 時に `tagDraft` が非空なら確定してから送る」と定める。しかし実コードの `useAutosave` は `snapshotForSubmit({ title, contentHtml, frontMatter, tagInput, directoryId })` を `useMemo([...])` で組み、`tagInput` が変わるたびに effect を再起動して debounce flush する設計（284-304行）。二層化後に `tagDraft` を snapshot のソースに含めると「タグを1文字打つたびに dirty 化 → autosave が draft 文字列を送る」ことになり、「Enter 確定したものだけ保存」という ADR-001 の意図と矛盾する。逆に `tagDraft` を snapshot から除外すると、`addTag`/`removeTag` は `tagNames` を変えるので拾えるが、「draft 入力中のまま放置 → autosave は走らない → ユーザーが離脱」というケースで draft が保存されない。`snapshotForSubmit` は submit と autosave で**同一**ロジックを通る契約（`editorState.ts` JSDoc / lockstep）なので、submit 時だけ draft を確定して autosave 時は確定しない、という非対称を入れると lockstep が崩れる。
  - 提案: 二層化後の snapshot ソースを「`tagNames`（確定タグのみ）」に一本化し、`tagDraft` は **submit のサブミットハンドラ側で確定（`parseTagInput(draft)` を `tagNames` にマージ）してから送る**ことを明記する。autosave は確定タグのみ拾う（draft は autosave の対象外）と割り切るか、あるいは「draft を拾わせたいなら autosave も submit と同じ確定ロジックを通す」かのどちらかを ADR-001 で明確に確定する。さらに `useAutosave` の `useMemo` deps（現 `tagInput`）を `tagNames`（配列。参照同一性に注意。`addTag`/`removeTag` は新配列を返すので OK）へ置換する点を実装ステップ1/4の影響範囲に明記する。snapshot を `tagNames` 一本にすれば lockstep は保てる。

#### 改善提案（検討推奨）

- **[S-001]** ステップ4の submit 配線で `state.tagDraft` の確定漏れを型で防ぐ案。
  - 理由: `snapshotForSubmit` の入力 `EditorSnapshotInput` から `tagInput` を外し `tagNames` を入れると、submit ハンドラが draft をマージし忘れても型エラーにならない（`tagNames` だけ渡せば通る）。draft マージを `snapshotForSubmit` の手前の純粋ヘルパー（例: `commitDraft(tagNames, draft): readonly string[]`）に切り出して `editorState.ts` に置き、submit と（draft を拾う方針なら）autosave の両方が同じ関数を通る形にすると、P-002 の lockstep をコードレベルで担保でき vitest でも検証できる。

- **[S-002]** `IngestionPreviewForm` への `parseTagInput` 依存を調査結果に明記すると安全。
  - 理由: `app/components/ingestion/IngestionPreviewForm.tsx:162/195/310` が独自の `tagInput` useState と `parseTagInput` を使っている。本計画は `parseTagInput` のシグネチャを変えず残すので Ingestion は無影響だが、計画の「依存関係」節は editor 内の波及のみ記載し Ingestion の `parseTagInput` 利用に触れていない。ステップ8の grep 確認対象に `app/components/ingestion/` も含める旨を明記すると、`parseTagInput` の責務縮小（計画は「バッファ確定トークナイザに縮小」と表現）が Ingestion 側を壊さないことの担保になる。なお実体としては `parseTagInput` は現行のまま（カンマ区切り→trim→重複排除）で十分なので「責務縮小」は実装上ほぼ no-op である点も補足するとよい。

- **[S-003]** `FlatDirectory` のインポート元の表記ゆれ。
  - 理由: 計画は「`app/components/note/directoryTree.ts` の `FlatDirectory`」と書くが、既存 `DirectoryPicker` / `NoteEditor` は `../loaders`（re-export）からインポートしている（`loaders.ts:307` が `directoryTree.ts` から re-export）。新コンポーネントのインポート元を既存に合わせて統一する旨を一言添えると、レビュー時の混乱を避けられる。実害はない。

- **[S-004]** ステップ6c の Rename/Delete 移植と `Popover` 非モーダル設計の相互作用を一段具体化。
  - 理由: 計画はリスク欄で「`Popover` は非モーダル（フォーカストラップ無し）、Rename/Delete ダイアログを開く際の `usePopover` の Dialog-connection order に注意」と正しく指摘している。実コードでは `closeAndRestoreFocus` が「フォーカスをトリガーへ戻す→閉じる」順（`usePopover.ts:236`、ViewSwitcher の select も `close()` 後に副作用）。新 UI で「選択行の Rename ボタン」を押す → Popover を閉じてからダイアログを開く、という順序にしないと `RenameDirectoryDialog` の `previousActiveRef` が消えた option を掴む。ステップ6b/6c に「アクション押下時は `close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順」を明記すると実装時の事故を防げる。

#### 良い点

- 参照している既存基盤がすべて実在し、計画の記述（API・責務）と一致することを実コードで確認できた:
  - `common/Popover.tsx` — `haspopup="listbox"` モード、`role="listbox"` パネル、`onMenuKeyDown` / `panelRef` / `clampToViewport` / `panelClassName` を計画どおり提供。option 子のみ mousedown preventDefault する配慮も実在。
  - `common/usePopover.ts` — 外側 mousedown / Escape / Tab-out 閉じ、トリガーへのフォーカス復帰、`aria-haspopup/expanded/controls` 配線、両軸 `clampToViewport`、`closeAndRestoreFocus`（Dialog-connection order）すべて計画記述どおり。
  - `common/useRovingMenu.ts` — `itemRole:"option"`、Arrow/Home/End、**`itemCount`/index は呼び出し側所有**（querySelectorAll は focus 実行のみ）という契約が JSDoc に明記されており、計画の「可視 option フラット列を呼び出し側で算出して index を割り当てる」設計の前提が正しい。
  - `note/list/ViewSwitcher.tsx` — `Popover haspopup="listbox"` + `useRovingMenu({itemRole:"option"})` + `role="option"` ボタン群 + `selectedIndex` を `initialIndex` に渡す listbox 実装が実在し、リファレンスとして妥当（ただし検索 input は持たない点が P-001）。
  - `FlatDirectory`（`id`/`parentId`/`name`/`depth`/`path`）と `flattenDirectoryTree` が `note/directoryTree.ts` に実在。`parentId` での親子再構成・折りたたみ描画に十分という計画の判断は正しい。`DirectoryTree.tsx` の `expanded` 折りたたみは参考にしつつ a11y 構造が異なるため流用不可、という切り分けも妥当。
- スコープ境界が明確。#688（最大幅）/#692（フォーカス表現）/Ingestion `fieldset` を明示的に除外し、ADR-004 で本文枠線は「border/rounded 撤去のみ・`p-4` と `focus-within` は温存」と #692 とのコンフリクト回避まで設計している。WysiwygEditor.tsx:576 の className を実確認した結果、撤去対象（`rounded-md border border-hairline`）と温存対象（`focus-within:border-accent focus-within:shadow-focus`）が同一文字列上に共存しており、計画の「border 撤去のみに厳密限定」という注意喚起は的確。
- デザイントークンの bridge を実ファイルで確認: `font-heading`（tokens.css:49 / index.css:41）、`accent-ink`（tokens.css:8 / index.css:11）、`accent-surface`（tokens.css:6 / index.css:9）、`shadow-md`（tokens.css:118 / index.css:105）、`rounded-lg`/`rounded-pill`（radius bridge 済み）すべて `@theme inline` で bridge 済み。`leading-[1.12]` は任意値なので bridge 不要。計画の「使用前に bridge 確認」という姿勢どおりで、utility-first / data-* 規約にも沿っている。モック `.title-input`（`font-heading` / `line-height:1.12`）・`.tag-chip`（h26 / pill / surface / 12.5px / accent-ink）・`.tag-input`（borderless / min-w140）・`.dir-pill`（h30 / pill）・`.dir-dropdown`（w280 / rounded-lg / shadow-md）の各値が計画記述と完全一致することを `spec/design/pages/P12-editor.html` で確認。
- 実装ステップが内側→外側の依存順（reducer → reducer テスト → 純粋コンポーネント / 純粋ツリーロジック → コンポーネント → orchestrator 配線 → 品質ゲート）に並んでおり、CLAUDE.md「ロジックは純粋関数で」「依存は内向き」に沿う。特にステップ6で折りたたみ×検索の可視 option フラット列算出を純粋関数に切り出し vitest 検証可能にする設計は、roving index 整合という最大リスクへの正しい打ち手。
- ドメイン/ユースケース/アダプターへの影響ゼロ（`tagNames: readonly string[]` / `directoryId` XOR `pendingDirectoryName` のサーバー契約不変）という判断が、`NoteEditor.onSubmit`（240-271行）・`resolveDirectoryId`（223-228行）の実コードと一致。プレゼン層に閉じる範囲設定は正確。
- ADR-002（toggle chip を再利用せず編集用 `TagsInput` 新設）の根拠が妥当。PR #691 系の chip は URL toggle（`button[aria-pressed]`）で、編集用（`list`+`listitem`+削除+`textbox`）とは責務・a11y 構造が異なるという調査結論は正しく、無理な共通化を避ける判断は健全。

---

## 返答サマリー

- 問題点: 2 / 改善提案: 4
- `[P-001]` Popover listbox + 検索 combobox + useRovingMenu の三重同居に先例なし・a11y モデル未確定（6bへ先送り）
- `[P-002]` 未確定 draft の submit/autosave 確定設計が useAutosave スナップショット依存・lockstep と非整合
- `[S-001]` draft 確定を純粋ヘルパー化して lockstep を型/テストで担保
- `[S-002]` IngestionPreviewForm の parseTagInput 依存を調査結果・grep 対象に明記
- `[S-003]` FlatDirectory インポート元の表記ゆれ（directoryTree.ts vs loaders 再export）
- `[S-004]` Rename/Delete 移植時の close→dialog open 順序（Popover 非モーダル）を明記
