# Plan Review — Issue #669 / Round 1（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/669/plan.md` / `.issue/669/adr.md`
確認した実装: `routerInvalidate.ts`(+JSDoc/3ルール例外), `NoteEditor.tsx`, `editor/styles.ts`, `DirectoryPicker.tsx`, `RenameDirectoryDialog.tsx` / `DeleteDirectoryDialog.tsx`, `routes/_app/notes/$noteId/edit.tsx` / `new.tsx` / `$noteId/index.tsx`, `WysiwygEditor.tsx` / `InlineEditor.tsx`, `spec/design/pages/P12-editor.html`, `app/styles/tokens.css` / `index.css`

#### 問題点（要修正）

- **[P-001]** AC-9 / ステップ2の「seed-once 防御で、生の `router.invalidate()`（3ルール例外）が走っても編集内容が失われない」という保証が、計画自身の調査結果と矛盾している。
  - 理由: 調査結果（plan.md L60）は「フォーカス喪失は loader 再実行で **RSC ツリーが差し替わりエディターが事実上再マウントされる** 経路」と結論しており、再マウントなら lazy initializer（seed-once）は何の防御にもならない（adr.md ADR-003 末尾も「単独では RSC ツリー差し替えに対して不十分」と認めている）。一方 AC-9・ステップ2の理由・スコープ外節（L36「AC-9 の防御で編集内容が守られる」）は seed-once が防御として機能する前提で書かれている。両立しない。
  - しかもこの経路は実際に踏める: `NoteEditor` → `DirectoryPicker`（`allowExistingActions`）→ `RenameDirectoryDialog.tsx:71` / `DeleteDirectoryDialog.tsx:41` が **エディター画面内から** rule 2 の生 `router.invalidate()` を呼ぶ。ステップ1の除外はラッパー経由のみ有効なので、編集中にディレクトリをリネーム/削除すると edit loader が再実行され、再マウントなら未保存の編集内容が消える。
  - 提案: (a) loader 再実行時に RSC payload の差し替えで client component の識別が維持されるのか（props 更新で済むのか再マウントなのか）を実装前に確定する事実確認タスクをステップに入れる。(b) 再マウントである場合、AC-9 の文言を「props 再同期の退行防止 pin」に弱め、「エディター内からのディレクトリ rename/delete で編集内容が失われる」ことを既知の制約として adr.md に記録するか、追加対策（例: rename/delete dialog 側で `routerInvalidate` + `appShellInvalidate` の組合せに置き換え、edit ルートを除外する）を本 Issue か後続 Issue として明示する。(c) ステップ8の手動検証に「編集中にディレクトリをリネーム → 編集内容・フォーカスが維持されるか」を追加する。現状の計画ではこのケースの結果がどちらに転んでも記録されない。

#### 改善提案（検討推奨）

- **[S-001]** モックとの要素順序の差分が計画で扱われていない。モックは `title → dir-row → tags-row → toolbar → editor`（P12-editor.html:981-1065）、実装は `topbar → title → tags → DirectoryPicker → editor`。Issue の AC は「ディレクトリ行・タイトル余白等の見た目一致」であり順序は明示されていないが、「見た目が一致」を目視比較で判定する以上、順序差は最初に目につく差分になる。順序もモックに合わせるのか、差分許容として記録するのかを計画に一言加えるべき。
- **[S-002]** ステップ4/5/6の「form の `gap-4` + 各要素の `mb-*` 加算」方式は、モック値が gap より小さい行で破綻する。ディレクトリ行のモック下余白は `--space-3`（12px）だが、form の `gap-4`（16px）が常に効くため `mb-3` を足すと 28px になり、12px には到達できない。タイトルの `mb-1 + gap-4 = 20px` は成立するが、dir 行は「gap を外して各セクション margin に統一」するしかない。ステップ4の「前者の最小差分を優先」という方針はステップ5の `mb-3` と整合しないので、余白戦略（gap 維持 or margin 統一）をステップ間で一本化しておくこと。
- **[S-003]** ステップ3の sticky 化は、ツールバーが `WysiwygEditor` 内（form 子要素ではなく editor コンテナの兄弟）にある点と、モックではツールバー自体に `margin-bottom: var(--space-4)` がある点に触れていない。実装の form は `gap-4` なので結果的に同値になる見込みだが、sticky 要素を wrapper 分離する場合（plan が想定する2要素構成）、wrapper に高さ・余白を持たせないと sticky 解除時にレイアウトシフトする。実装時の確認項目として明記すると安全。
- **[S-004]** ステップ1のテスト方針に「現在の edit ルート滞在中の match 形」の確認がない。`routerInvalidate` のフィルタは `match.routeId` の文字列一致で判定するが、pin すべきは定数列挙だけでなく「`/_app/notes/$noteId/edit` の実 match（params 付き）でも routeId が想定文字列のままである」こと。既存テストが述語ベースなら現行方式で十分だが、routeId 形式（trailing 等）の思い込みがすり抜けないよう、実ルートツリー由来の routeId と定数の一致を typecheck かテストで担保できるとより堅い。

#### 良い点

- invalidate 除外を呼び出し側25ファイルに散らさず `routerInvalidate.ts` の不変条件として表現する判断（ADR-003）は、#293 ADR-010 / #300 ADR-005 の既存設計と完全に同型で、CLAUDE.md の「不変条件を1箇所で表現する」方針に整合している。`appShellInvalidate` が厳密一致のため変更不要という確認も正確。
- Issue 本文の誤り2点（`editorActions` の `ml-auto` は実装済み / 「#233 ADR-003 = シンプル入力」の引用ズレ）を調査で検出し、計画・ADR に反映している。
- ADR-001（タグはチップUI化しない）・ADR-002（`DirectoryPicker` の variant opt-in で Ingestion 側を凍結）はどちらもスコープ制御とトレードオフの記録が適切。「見せかけチップ」を最悪手と退ける判断、機能ロジックを1実装に保つ判断は妥当。
- `sticky` × `overflow-x-auto` の非両立、`inline-flex` 化による折返し変化、routeId 文字列のリネーム追従など、CSS/ルーターの実装上の落とし穴がリスク節で事前に挙げられている。
- 変更がプレゼンテーション層に閉じていること（ドメイン/アプリ/アダプター影響なし）の確認は正しい。detail ルートが `staleTime: 0` であることも実コードと一致しており、保存後 invalidate 削除（AC-8）の前提は成立している。
- AC-1 の背景色は Issue 本文（「モックは指定なし」）ではなくモック実体（`background: var(--color-bg)`、P12-editor.html:609）に合わせて修正されており、原典確認ができている。

## 結論

P-001（seed-once 防御の保証と RSC 再マウント結論の矛盾、およびエディター内 rename/delete 経由の生 invalidate 経路）の解消が必要。スタイル系は S-002 の余白戦略の一本化を済ませれば実現可能性に大きな懸念はない。
