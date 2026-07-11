# PR #839 レビュー — Frontend（Round 3 / フルレビュー）

対象: `app/components/note/editor/InlineEditor.tsx` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`（コード変更はこの 2 ファイルに閉じている。他は `.issue/287/` 配下のドキュメント）
PR head: 9ebee9f3
計画: `.issue/287/plan.md` / `.issue/287/adr.md`
前提: Round 1/2 の指摘はすべて反映済み（W-002 は Issue #840 起票で対応）。本ラウンドはゼロベースのフルレビューで、新しい実欠陥の有無のみを見る。

## 検証プロセス

- **R1/R2 反映の現物確認**: JSDoc 冒頭サマリーが新規則＋`<pre>` 込みのタグ列挙に更新済み（`InlineEditor.tsx:6-12`、R1 W-001 / R2 N-004）。ゲートコメントに mixed コンテナ残余ギャップの 1 節が追加済み（`:306-309`、R2 W-001）。弁別 pin 2 本（インラインラッパ越しメディア + `<td><img>` / 深さ2純粋コンテナ skip）追加済み（R1 W-003）。Issue #840 起票済み（R1 W-002）。反映の取りこぼしなし。
- **ゲートの真理値をゼロベースで再検証**: `decorate(el) ⇔ isEditableTag(el) ∧ (isPre(el) ∨ hasDirectTextChild(el) ∨ ¬containsEditableBlock(el))`（`InlineEditor.tsx:315-317`）。旧条件 `isPre ∨ hasDirectTextChild` に対して decorate 集合が単調に広がる一方向の変更であり、「従来 decorate されていた要素が skip に転ぶ」回帰は構造的に不可能（AC-5 の成立根拠）。新たに decorate されるクラス（`<p><img></p>` / 空 `<p>` / `<p><a><img></a></p>` / `<td><img></td>`）と skip 維持クラス（`<li><p>` 外側 / 深さ2純粋コンテナ / mixed メディアコンテナ）を机上検証し、plan.md 挙動表・ADR-001 と全一致。
- **`containsEditableBlock` の実装**: `el.querySelector(EDITABLE_TAGS_SELECTOR)` は子孫のみ探索（自己を含まない）で「純粋コンテナ」述語として正確。`EDITABLE_TAGS_SELECTOR` は静的タグ名の join でセレクタとして安全、module スコープで 1 回構築。短絡評価により大多数（直接テキスト子あり）の要素では `querySelector` は走らない。
- **相互作用の再点検**（decorate 対象増加に対して）:
  - `classifyRecords`: decorate 済みブロックへのテキスト入力は「contentEditable target + TEXT_NODE のみの childList」で許可 — 無変更で正しい。
  - `structureSignature`: 要素のみ walk・`contenteditable` 明示除外（`:383-387`）なので、decorate 対象が増えても IME compositionend の drift 判定は汚れない。テキスト入力は署名不変。
  - `serializeHostContent`: `[contenteditable]` を値問わず全 strip — round-trip 維持（AC-4 pin あり）。
  - `snapshotRef`: decorate 前の clone（`:656`）なので snapshot への `contenteditable` 混入なし。rollback → `applyEditable` 再適用で新規則が rollback 後も一貫。
  - `clearEditable` / disabled トグル: 属性有無のみ参照で対象増加の影響なし。rollback-under-disabled（`contenteditable="false"` 付与）→ 再有効化（同一ゲートで `"true"` に上書き）の往復も整合。
  - resync 経路: rebuild が debounce タイマーを破棄してから再構築するため、メディア挿入 resync と pending emit の競合なし（既存機構、無変更）。
- **コメントの正確性**: ゲートコメント（skip = 純粋コンテナのみ・mixed コンテナの残余ギャップ・`<pre>` 明示バイパスの理由）、`containsEditableBlock` の JSDoc、invariant 1、テストファイル先頭の contract docstring — いずれも現実装の挙動と一致することを逐語で確認。R2 W-001 の修正文言（"also skipped, leaving the media-adjacent area read-only — a known residual gap"）は「skip only the pure containers」との整合も取れている（invariant 1 の述語定義「editable 子孫あり・直接テキスト子なし」に mixed コンテナも該当するため矛盾なし）。
- **テスト実行（PR head）**: `inlineEditor.test.tsx` + `mediaInsert.test.ts` + AC-6 対象の `wysiwygEditorImageButton.test.tsx` + `noteEditorImageButtonWiring.test.tsx` = **67 件全 green**。`pnpm typecheck` / `pnpm format:check` もクリーン。
- **AC 照合**: AC-1〜AC-4（新規 pin）/ AC-5（既存 pin green 維持 + 一方向変更の構造的保証）/ AC-6（コード diff が `InlineEditor.tsx` + テストのみ、wysiwyg/html 経路テスト green）— すべて充足。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 問題なし（Blockers/Warnings ゼロ）。ゼロベースで見直したが、`applyEditable` ゲートの述語・4 呼出経路（mount rebuild / resync rebuild / rollback / disabled トグル）への一様な適用・MutationObserver / serialize / IME signature との相互作用・コメント精度のいずれにも新しい実欠陥は見つからなかった。
- **[N-002]** 「decorate 集合が単調に広がる一方向の変更」かつ「skip される要素は必ず decorate される editable 子孫を持つ」という 2 つの構造的性質が、回帰リスクを設計レベルで抑えている。真理値表 8 行すべてが pin 済み（R1/R2 で弁別力もミューテーション実証済み）で、将来の"簡略化"退行もスイートが捕捉できる状態。
- **[N-003]** 参考情報: 新たに decorate される空ブロックでの IME 入力は、composition 中にブラウザがプレースホルダ `<br>` を出し入れした場合 `structureSignature` の要素差分として compositionend rollback になりうる。これは #840 が追跡する placeholder `<br>` 問題（TC-007 で実機確認済み）と同一トリガー族であり、本 PR で新規対応すべき欠陥ではない（#840 のスコープに含めて扱えばよい）。
- **[N-004]** emit 値は DOM 正規化を経るため挿入直後の `value`（`<img ... />`）と字面が異なるが、`lastEmittedHtmlRef` を rebuild 時に `serializeHostContent` の結果で更新する既存設計により自己 emit 判定は正しく成立している。resync ループや余分な rebuild は発生しない（AC-2 テストと実機 TC-001 で挙動確認済み）。

## 総評

Round 3 をゼロベースで実施。R1/R2 の全指摘が正しく反映されており、実装・テスト・相互作用・コメントのすべてで新しい欠陥はゼロ。テスト 67 件 green・typecheck / format クリーン。マージ可能な品質と判断する。
