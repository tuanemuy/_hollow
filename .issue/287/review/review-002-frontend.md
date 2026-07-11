# PR #839 レビュー — Frontend（Round 2 / フルレビュー）

対象: `app/components/note/editor/InlineEditor.tsx` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`（コード変更はこの 2 ファイルに閉じている。他は `.issue/287/` 配下のドキュメント）
計画: `.issue/287/plan.md` / `.issue/287/adr.md`
前提: Round 1 指摘（review-001-frontend.md）の反映確認込みのゼロベース再レビュー。W-002 は Issue #840 起票で対応済み（蒸し返さない）。

## 検証プロセス

- **Round 1 反映の確認**: W-001（JSDoc 冒頭サマリーの旧規則取り残し）→ `InlineEditor.tsx:7-11` が「allow-listed block elements … excluding pure containers of editable blocks (see invariant 1)」に修正済み。W-003（差別化ケースの pin 欠如）→ `<p><a href><img></a></p>` + `<td><img></td>` の pin（`inlineEditor.test.tsx:1287`）と、深いネストの純粋コンテナ skip pin（`<blockquote><ul><li>x</li></ul></blockquote>`、同 `:1313`）が追加済み。W-002 → Issue #840（OPEN）起票済みを `gh issue view 840` で確認。
- **新ゲートの真理値をゼロベースで再検証**: `decorate(el) ⇔ isEditableTag(el) ∧ (isPre(el) ∨ hasDirectTextChild(el) ∨ ¬containsEditableBlock(el))`（`InlineEditor.tsx:309-311`）。skip 条件が狭くなる一方向の変更なので「従来 editable だったものが editable でなくなる」回帰は構造的に起こり得ない。新たに decorate される全クラス（`<p><img></p>` / 空 `<p>` / `<p><a><img></a></p>` / `<td><img></td>` / `<li><p><img></p></li>` の内側 `<p>` 等）を机上検証し、意図（plan.md 挙動表 8 行 + ADR-001）と全一致。
- **skip 不変条件の強化を確認**: 新規則では「skip される要素は必ず decorate される子孫を持つ」が保証される（最深の許可リスト子孫 D は `containsEditableBlock(D) = false` なので必ず decorate される）。旧規則にはコンテナも全子孫も skip される全滅ケース（`<li><p><img></p></li>`）があったため、これは厳密な改善。
- **エッジケース**: `<p>␣<img></p>`（空白のみのテキスト子）→ decorate（`hasDirectTextChild` は trim 判定なので一般規則で救済）。`<td><pre>x</pre></td>` の外側 `<td>` → skip（`pre` は許可リスト内 = editable 子孫扱い、従来と同一）。`<pre><p>…</p></pre>` のような異形は `isPre` バイパス + serialize 時のテキスト平坦化で従来どおり（本 PR の影響なし）。`EDITABLE_TAGS_SELECTOR` は静的タグ名のみの join でセレクタとして安全・module スコープで 1 回構築。
- **MutationObserver / rollback / serialize / disabled との相互作用**: `applyEditable` の 4 呼出経路（mount rebuild `:652` / rollback `:516` / disabled トグル `:860`、resync は rebuild 経由）すべてに一様に適用。snapshot（`:650`）は decorate 前の clone なので `contenteditable` 混入なし。`structureSignature` は `contenteditable` を明示除外（`:379`）なので decorate 対象増加が IME compositionend の drift 判定を汚さない。`serializeHostContent` は `[contenteditable]` を値問わず全 strip（true/false 両対応 — disabled 中 rebuild の `contenteditable="false"` も漏れない）。`clearEditable` は属性有無のみ参照で対象増加の影響なし。`classifyRecords` 無変更の判断も正しい（decorate されれば TEXT_NODE のみの childList が通る）。
- **パフォーマンス**: `containsEditableBlock` の `querySelector` は短絡評価により「直接テキスト子を持たない許可リストブロック」でのみ実行。rebuild/rollback/disabled トグル時のみでキー入力毎には走らない。plan.md の O(n²) 評価どおり実害なし。
- **テスト実行**: `inlineEditor.test.tsx` + `mediaInsert.test.ts` → 63 件 green。AC-6 検証の `wysiwygEditorImageButton.test.tsx` + `noteEditorImageButtonWiring.test.tsx` → 4 件 green。コード diff は `InlineEditor.tsx` + `inlineEditor.test.tsx` のみ（AC-6 の diff スコープ条件を充足）。
- **AC 照合**: AC-1（decorate 付与 pin）/ AC-2（実物 `insertMediaIntoHtml` import による resync 経路 pin — `{ id: "abc" }` は `InsertMediaInput` 契約と一致）/ AC-3・AC-4（テキスト emit + `contenteditable` 非漏出 pin）/ AC-5（既存 pin スイート green 維持）/ AC-6（diff スコープ + 上記テスト green）— **すべて充足**。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** ゲートコメントの skip 根拠「decorating the container itself would be redundant」が、既知の残余ギャップ（直接メディア子を持つ mixed コンテナ）に対しては不正確
  - 場所: `app/components/note/editor/InlineEditor.tsx:295-298`
  - 理由: skip 述語（editable 子孫あり・直接テキスト子なし）は `<li><img><p>foo</p></li>` のような「純粋でない」コンテナも skip する。このケースでは子孫 `<p>` は decorate されるが `<img>` 隣接領域はどの decorate 要素にも含まれず編集不可のままなので、「コンテナ自身の decorate は冗長」という一般化は成立しない（decorate すれば編集可になるが、plan.md「含まれないもの」で意図的にスコープ外とした残余ギャップ）。挙動は従来と同一で正しいが、この WHY コメントを信じた将来の保守者が「skip は常に無損失」と誤解し、ギャップの存在に気づかず退行判定を誤る恐れがある。CLAUDE.md 規約（残すコメントは正確であること）に照らして修正すべき。plan.md にのみ記録された設計判断が、当のコードから辿れない状態でもある。
  - 提案: コメント末尾に 1 節追加する。例: 「A container mixing media and editable blocks (`<li><img><p>…</p></li>`) is also skipped, leaving the media-adjacent area read-only — a known residual gap, out of scope for #287 (see `.issue/287/plan.md`)」。挙動変更は不要。

#### Notes

- **[N-001]** Round 1 の W-001 / W-003 は完全に反映されている。特に W-003 対応の pin 2 件は、ADR-001 案 2 を案 1 から差別化した当のケース（インラインラッパ越しのメディア）と `containsEditableBlock` の任意深度探索という、将来の"最適化"退行を割る位置に正しく置かれている。
- **[N-002]** 新規則は「skip される要素は必ず decorate される子孫を持つ」という不変条件を新たに保証する（旧規則にはコンテナ・子孫とも skip される全滅ケースがあった）。ゲートが狭くなる一方向の変更であることと合わせ、回帰リスクの構造的な低さは設計の質による。`isPre` バイパスを一般規則の偶然の帰結に頼らず明示維持した点、その理由コメント（不透明領域の独立不変条件）も正確で良い。
- **[N-003]** PR 本文の Browser Verification 節が「フォローアップ Issue を起票予定」のままだが、#840 は既に起票済み（OPEN）。マージ前に PR 本文を「→ #840」に更新すると追跡が切れない（Round 1 W-002 自体は解決済みで、これは本文の文言更新のみの話）。
- **[N-004]** ファイル先頭 JSDoc（`InlineEditor.tsx:7-9`）の許可タグ列挙に `pre` が含まれていない（`EDITABLE_TAGS` は 16 タグ、列挙は 15）。invariant 1 と 6 が `<pre>` を詳述しているため実害は薄く #287 以前からの状態だが、列挙を網羅と読むと不正確なので、W-001 の修正ついでに `<pre>`（invariant 6 参照）を足すか「等」を付すとよい。

## 総評

Round 2 をゼロベースで見直したが、実装・テスト・相互作用（MutationObserver / rollback / serialize / disabled / IME signature）に欠陥は見つからなかった。skip 条件を狭める一方向の変更という構造上、decorate 側の回帰は起こり得ず、新規 decorate クラスは pin テストと実機検証（8/8 PASS）で固定されている。残るのはコメント精度の追い込み（W-001: 残余ギャップの WHY がコードから辿れない）と PR 本文の文言更新（N-003）のみで、いずれも挙動変更を伴わない。
