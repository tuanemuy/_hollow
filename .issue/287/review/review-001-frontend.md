# PR #839 レビュー — Frontend

対象: `app/components/note/editor/InlineEditor.tsx` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`（コード変更はこの 2 ファイルに閉じている。他は `.issue/287/` 配下のドキュメント）
計画: `.issue/287/plan.md` / `.issue/287/adr.md`

## 検証プロセス

- **新ゲートの真理値の机上検証**: `decorate(el) ⇔ isEditableTag(el) ∧ (isPre(el) ∨ hasDirectTextChild(el) ∨ ¬containsEditableBlock(el))`（`InlineEditor.tsx:308-310`）を plan.md の挙動表 8 行すべてと突き合わせ、全行一致を確認。skip 側に転ぶのは「editable 子孫あり・直接テキスト子なし・非 pre」の純粋コンテナのみで、ADR-002 (#233) の意図の直接表現になっている。
- **`containsEditableBlock` のセマンティクス**: `el.querySelector(EDITABLE_TAGS_SELECTOR)` は子孫のみを探索し `el` 自身を含まない — 「純粋コンテナ」判定として正確。`EDITABLE_TAGS_SELECTOR`（`Array.from(EDITABLE_TAGS).join(",")`）は素のタグ名のみの妥当なセレクタリスト。短絡評価の順序も適切で、直接テキスト子を持つ通常段落（大多数）では `querySelector` は走らない。
- **エッジケースの追加検証**（挙動表外）: `<p>　<img></p>`（空白のみのテキスト子）→ decorate（`hasDirectTextChild` は trim 済みなので false → 一般規則で救済）。`<td><pre>x</pre></td>` の外側 `<td>` → skip（`pre` は許可リスト内なので editable 子孫扱い — 従来と同一）。`<li><p></p><img></li>` の `<li>` → skip（plan.md「含まれないもの」の既知残余ギャップどおり）。深いネスト・mixed コンテンツで従来挙動から転ぶケースは見つからなかった。
- **既存 pin テストとの整合**: `<li><p>` skip（li は editable 子孫 `p` を持つ）、mixed blockquote 両 decorate（直接テキスト子あり）、`<pre><code>`（isPre バイパス）、table/td、disabled トグル — すべて新ゲートで不変。`pnpm vitest run inlineEditor.test.tsx mediaInsert.test.ts` を実行し **61 件 green** を確認。
- **MutationObserver / rollback / disabled との相互作用**: `applyEditable` の 4 呼出経路（mount rebuild `InlineEditor.tsx:651` / rollback `:515` / disabled トグル `:859`、resync は rebuild 経由）すべてに一様に効く。snapshot（`:649`）は decorate 前の clone なので `contenteditable` 混入なし。`clearEditable` は属性有無だけを見るため decorate 対象増加の影響なし。`classifyRecords` は無変更で正しい（decorate されれば TEXT_NODE のみの childList が許可される）。
- **`serializeHostContent` との整合**: `[contenteditable]` を全 strip するだけなので decorate 対象が増えても round-trip は保たれる。AC-3/AC-4 テスト（emit 値に `contenteditable` 非含有・`/media/abc` とテキスト双方含有）で pin 済み。
- **AC 照合**: AC-1〜AC-4 は追加テストで直接検証、AC-5 は既存 pin の green 維持で検証（skip 側に転ぶ既存 pin が存在しないことを個別確認）、AC-6 はコード diff が `InlineEditor.tsx` + `inlineEditor.test.tsx` のみに閉じていることを diff で確認。**受け入れ基準はすべて満たされている**。
- AC-2 テストが実物の `insertMediaIntoHtml` を import して resync 経路を再現している点は、モックで済ませず挿入経路との契約を実際に結線しており良い。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** ファイル先頭 JSDoc の冒頭サマリーが旧規則のまま残り、更新済みの不変条件 1 と矛盾している
  - 場所: `app/components/note/editor/InlineEditor.tsx:7`
  - 理由: 冒頭の「makes its **text-bearing block elements** (`<p>` / … ) contentEditable」は #287 以後は不正確（media-only の `<p><img></p>` や空 `<p>` も decorate される）。同じ JSDoc 内の Core invariant 1（21-33 行）は新規則に更新済みなので、1 つのドキュメンテーションコメントの中で冒頭と不変条件が食い違う。plan.md ステップ 1-5 は「ファイル先頭 JSDoc の不変条件 1 に反映」としており文言上は満たしているが、CLAUDE.md のコメント規約（残すコメントは正確であること）に照らすと冒頭サマリーの取り残しは修正すべき。テストファイル側の contract docstring は正しく更新されているだけに、実装側だけ半端になっている。
  - 提案: 冒頭を「makes its allow-listed block elements contentEditable（純粋コンテナを除く — invariant 1 参照）」程度に改め、"text-bearing" の限定を外す。
- **[W-002]** TC-007 で実機確認された「保存済み編集のサイレント消失」のフォローアップ Issue が未起票のままマージに向かっている
  - 場所: `app/components/note/editor/InlineEditor.tsx:309`（新ゲートが `<td><br></td>` / `<p><br></p>` を新たに decorate することがトリガー面を広げる）
  - 理由: rollback 粒度・snapshot 追従は #233 由来の既存設計でスコープ外という整理自体は妥当（Blocker としない理由）。ただし TC-007 の観察は「空セルに 1 文字入力 → プレースホルダ `<br>` remove を含むバッチ → エディタ全体が最終 rebuild snapshot まで巻き戻り → 以降の入力の emit で巻き戻り後本文が自動保存され、**一度保存済みだった編集が無警告で失われる**」という具体的なデータ損失経路であり、この PR が「クリックして入力できるように見える」入口（空 td/`<br>` 付きブロック）を新設したことで初めて自然な操作列として踏めるようになった。`gh issue list` を検索した限り該当のフォローアップ Issue はまだ存在せず、progress.md の「Phase 4 で起票」が実行されない限り追跡が失われる。
  - 提案: マージ前（または同時）にフォローアップ Issue を起票し、PR 本文から参照する。Issue には TC-007 の再現手順と候補対策（rollback 粒度の局所化 / 許可 emit 時の snapshot 追従 / 「テキスト追加と同一バッチでの placeholder `<br>` remove」の classifier 許容 — 3 案目は分類器の条件 1 行で済む可能性があり最小）を転記する。
- **[W-003]** ADR-001 案 2 を案 1 から差別化する当のケース（インラインラッパ越しのメディア）がテストで pin されていない
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx:956`（追加テスト群）
  - 理由: 挙動表の新規 decorate 行のうちテストがあるのは `<p><img></p>` と空 `<p>` のみ。`<p><a href><img></a></p>`（案 1 の `hasDirectMediaChild` では漏れる、案 2 採用の決め手になったケース）と `<td><img></td>` は pin がない。将来 `containsEditableBlock` を「直接子のメディア判定」等に"最適化"する退行が起きても現行スイートは green のままになる。
  - 提案: `value='<p><a href="/x"><img src="/media/abc" alt=""></a></p>'` で `<p>` が decorate されることの pin を 1 件追加する（`<td><img></td>` は同型なので必須ではない）。

#### Notes

- **[N-001]** ゲートの再設計が「例外の列挙」ではなく述語 1 箇所の置き換えに閉じており、4 呼出経路すべてに一様に効く。`isPre` バイパスを一般規則の偶然の帰結（`code` が許可リスト外）に頼らず明示維持した判断は、将来 `EDITABLE_TAGS` に `code` を足した場合の regression を防ぐ良い防御。書き換えられたゲートコメント・`<pre>` バイパスの理由コメントはいずれも WHY を説明しており CLAUDE.md のコメント規約に適合。`containsEditableBlock` の JSDoc も正確。
- **[N-002]** パフォーマンス: 最悪 O(n²) は plan.md の評価どおり実害なし。短絡評価により `querySelector` が走るのは「直接テキスト子を持たない許可リストブロック」だけで、その大半（leaf の td/li 等）は部分木が小さく実コストはさらに低い。rebuild/rollback/disabled トグル時のみの実行でキー入力毎には走らない。現状の実装で十分であり、事前の一括 `querySelectorAll` 化などの最適化は不要。
- **[N-003]** AC-2 テストが実物の `insertMediaIntoHtml` を import して「upload → 文字列追記 → 外部 value 変更 → resync rebuild」の実経路を再現している。挿入側の出力契約（`<p>` ラッパ）が変わればこのテストが割れる構造になっており、モジュール間契約の pin として適切。AC-3 テストの「`createTextNode` の appendChild = キャレット横入力の DOM 等価操作」というコメントも、なぜその操作で代替できるかの WHY として妥当。
- **[N-004]** ブラウザ検証（8/8 PASS）が plan.md のリスク欄で予告した全エッジ（`<br>` プレースホルダ rollback・snapshot 巻き戻り範囲・img 選択置換）を実機で潰し、結果を判断材料として記録している。特に TC-007 の観察は W-002 の根拠となる質の高いレポート。

## 総評

計画との整合は完全で、受け入れ基準 AC-1〜AC-6 はすべて実装・検証されている。変更は述語 1 箇所 + pin テストに閉じ、DOM 操作ロジック・MutationObserver/rollback・serialize との相互作用に欠陥は見つからなかった。Blocker なし。W-001（JSDoc の取り残し）と W-003（差別化ケースの pin）は小さな追い込み、W-002（フォローアップ Issue の起票）はマージ前に実行されるべきプロセス上の残件。
