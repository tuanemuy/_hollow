# PR #712 レビュー — 状態管理 / アプリケーションロジック / データ整合性

対象: Issue #689 / `.issue/689/plan.md` AC-2、ADR-001（タグ二層化・lockstep）/ ADR-003 / ADR-005。
観点: lockstep の保証・reducer の純粋性と不変条件・未確定 draft の取りこぼし・`directoryTreeModel` の純粋ロジック・エッジケース・型安全。

総評: AC-2（タグの追加・削除・保存・autosave・未確定 draft 確定・重複排除・trim・順序保持）は**満たされている**。submit と autosave は単一の純粋ヘルパー `resolveTagNames` を通り `tagNames` ソースが一本化されている。`useMemo` deps も `tagNames`+`tagDraft` に正しく更新済み。reducer は純粋・不変・整合的で、no-op の参照同一性も保たれる。`directoryTreeModel` の純粋関数は境界条件をテストで網羅し破綻しない。Blocker はなし。以下は軽微な Warning / Note のみ。

## 状態管理 / ロジック / データ整合性

### Blockers
なし

### Warnings

- **[W-001]** ディレクトリ「選択中」が ARIA 上に表れず、矢印移動だけが `aria-selected` を担う
  場所: `app/components/note/editor/DirectoryTreeSelect.tsx:322`（`aria-selected={isActive}`）/ `:324`（`data-selected={isSelected || undefined}`）
  理由: 現在 `aria-selected` は「`aria-activedescendant` が指す option（=矢印ハイライト）」にだけ付き、実際に保存対象として選ばれているディレクトリ（`directoryId` 一致）は `data-selected`（視覚 + チェックアイコン）でしか表現されていない。単一選択 listbox では「現在の確定選択」を支援技術へ伝える経路がない。ADR-005 が「実フォーカスは検索 input 固定、active は activedescendant」と決めた以上、active を `aria-selected` で表す設計自体は WAI-ARIA combobox パターンとして妥当だが、その結果「どれが選択済みか」がスクリーンリーダーに伝わらない非対称が残る。データ整合性（送信される `directoryId`）には影響しないが、a11y 完全性の観点で穴。
  提案: チェックアイコン（`Check`）に `aria-label="選択中"` を付ける、もしくは選択中 option 名に視覚的に隠したテキストを添えるなどで「選択済み」を可読化する。`aria-selected` の意味づけは現状維持でよい（active の表現として）。

- **[W-002]** 検索クエリ変更時に `activeIndex` がリセットされず、無関係な option に active が残る
  場所: `app/components/note/editor/DirectoryTreeSelect.tsx:92-94`（clamp は `options.length` のみに依存）
  理由: クランプ effect は `options.length` の変化にしか反応しない。検索でヒット集合が**入れ替わっても件数が同じ**場合、`activeIndex` は同じ数値のまま指し先の option だけ別物に変わる。`aria-activedescendant` は実在 id を指し続けるので破綻はしない（=データ整合性は保たれる）が、ユーザー体感では「絞り込んだのにハイライトが先頭に来ない／無関係な行が active」という小さな齟齬が出る。`DirectorySelectField` 系の慣例では query 変更時に active を先頭へ寄せる実装が多い。
  提案: `query` 変更時（もしくは options 参照が変わったとき）に `setActiveIndex(0)` する小 effect を足すと挙動が直感的になる。必須ではない（破綻はしない）。

### Notes

- **[N-001]** lockstep は正しく成立している（確認結果）
  `resolveTagNames`（`editorState.ts:600-613`）が submit（`NoteEditor.tsx:235`）と autosave（`useAutosave.ts:191-202` → `snapshotForSubmit` → `editorState.ts:651`）の双方の唯一の `tagNames` ソース。`snapshotForSubmit` / `EditorSnapshotInput` から旧 `tagInput` 依存は完全に除去され、`EditorSnapshotInput` は `tagNames`+`tagDraft` を含むよう更新済み。`useMemo` deps（`:201`）も `tagNames, tagDraft` の両方を含み、漏れなし。`addTag`/`removeTag` は新配列を返すため参照同一性で dirty 判定でき、空 draft 更新（`setTagDraft`）は dirty を立てない（`:481-487`）一方で `resolveTagNames` が非空 draft を救済するため「Enter 未押下のタグが落ちる」事故は塞がれている。テスト（`editorState.test.ts:751-772`）も lockstep を直接検証。AC-2 充足。

- **[N-002]** reducer の純粋性・不変条件・no-op 同一性は良好
  `addTag` は `parseTagInput` でカンマ複数分割・trim・空スキップ・既存との重複排除を行い、新規ゼロ時は draft クリアのみ（空 draft なら参照同一の no-op、`:467-472`）。`removeTag` は name 指定で、不在 name は参照同一 no-op（`:475-476`）。`setTagDraft` は同値で no-op、dirty を立てない（コメントで WHY も明記）。`tagNames: readonly string[]` / `EditorState` 全体 `Readonly<...>` で不変表現を型レベルで担保。illegal state（`directoryId` XOR `pendingDirectoryName`）は `setDirectory`/`setPendingDirectoryName` の相互排他で維持され、これは本 PR で不変。`any` / 不要な型アサーションは新規コードに見当たらない。

- **[N-003]** 未確定 draft の二重確定は冪等で無害（確認結果）
  ADR-005#5 の onBlur 確定（`TagsInput.tsx:80-82`）と submit/autosave 時の `resolveTagNames` 救済は、いずれも `addTag` / `parseTagInput` の重複排除を通るため二重確定しても結果が変わらない。`×` クリック時は input blur → `onAddTag(draft)` 確定 → `onClick` で `removeTag` の順で両方適用されるが、別タグ操作なので整合する。Backspace 削除（空 draft 時に末尾チップ削除）も `tagNames` 末尾要素を取り出して `removeTag` するだけで、`undefined` ガード（`:48`）あり。

- **[N-004]** `directoryTreeModel` の純粋ロジックは境界条件で破綻しない（確認結果）
  `visibleDirectoryOptions` は (1) 空 tree → `[{kind:"create"}]` のみ（テスト `:84-89`）、(2) 全折りたたみ → ルートのみ可視、(3) 検索ヒットゼロ → create のみ、(4) ヒット時は祖先自動展開（`searchMatchSet` が match の親チェーンを `visible` に積む、`:82-89`）を正しく扱う。`create` option は常に末尾に append され、矢印移動のフラット列に含まれる（ADR-003 の方針どおり）。`clampActiveIndex` は空（count<=0 → 0）・範囲外を正しくクランプ、`nextActiveIndex` は両端ラップ・空リストで 0。テスト（`directoryTreeModel.test.ts`）が各境界を網羅。`hasListbox` ゲート（`DirectoryTreeSelect.tsx:96-99`）で候補ゼロ時は listbox 非描画かつ `aria-activedescendant` 未付与となり、実在しない id を指す状態を防いでいる（ADR 補足どおり）。

- **[N-005]** Ingestion 非回帰の確認
  `editorState.ts` から `state.tagInput` / `setTagInput` は完全に除去済み（grep で editor 側に残存なし）。`IngestionPreviewForm.tsx` は独自の local `tagInput` useState と `parseTagInput`（シグネチャ不変）を使い続けるため無影響。`DirectoryPicker` の `variant="fieldset"` ブランチ（`:192-218`）は無変更で、props 契約も保たれているため Ingestion は据え置き。`variant="row"` のみ `DirectoryTreeSelect` へ委譲（`:98-110`）。

- **[N-006]** tree 未供給時のトリガーラベルの退行可能性（軽微）
  `DirectoryTreeSelect.tsx:124-129` の `triggerLabel` は `selected`（`tree.find(id===directoryId)`）が見つからない場合「ディレクトリを選択」を表示する。`directoryId` が確定済みでも `tree` のロード前・除外時には「未選択」表示になりうる。送信値（`directoryId`）には影響せず表示のみだが、`directoryId !== null` かつ `selected` 未解決のケースで「（読み込み中）」等のフォールバックがあると親切。現行 `DirectorySelectField` も同種挙動のため新規退行ではない。Note 止まり。
