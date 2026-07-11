# PR #839 レビュー — Test 観点

対象: PR #839（fix(editor): inline モードでメディア挿入直後の `<img>` 単体ラッパを編集可能にする）
計画: `.issue/287/plan.md` / ADR: `.issue/287/adr.md`
レビュー日: 2026-07-11

## 検証プロセス

- `inlineEditor.test.tsx`（41件）/ `mediaInsert.test.ts`（20件）/ AC-6 対象の `wysiwygEditorImageButton.test.tsx` + `noteEditorImageButtonWiring.test.tsx`（4件）をローカル実行し全件 green を確認。
- **ミューテーション検証 1**: ゲートを旧規則 `if (!isPre && !hasDirectTextChild(el)) continue;` に戻して実行 → 新規4テスト（AC-1 / AC-2 resync / AC-3 emit / 空 `<p>`）が fail。新規 pin の弁別力を実証。
- **ミューテーション検証 2**: `containsEditableBlock` を ADR-001 の棄却案1相当（直接メディア子判定 + 空ブロック許容）に置き換えて実行 → **全 41 件 green のまま**。採用案（案2）を棄却案から弁別する pin が存在しないことを実証（→ W-001）。
- 計画ステップ2の7項目（AC-1〜AC-4 pin・空 `<p>` pin・img force-remove rollback pin・contract docstring 更新）と実装の突き合わせ、既存テスト無変更（AC-5 の前提）の diff 確認、diff スコープが `InlineEditor.tsx` + テストファイル + `.issue/` ドキュメントに閉じていること（AC-6 (a)）の確認を実施。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** ADR-001 が案2採用の決め手として挙げた弁別ケース `<p><a href><img></a></p>`（インラインラッパ越しのメディア）が pin されていない
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx:959`（新規 pin テスト群に該当ケースなし。計画 `plan.md` 真理値表の最終行）
  - 理由: ミューテーション検証 2 のとおり、`containsEditableBlock` を「直接メディア子を持つ or 子要素なしなら decorate」という棄却案1相当の実装に置き換えてもスイートは全件 green で通過する。この置き換えで挙動が変わる（decorate → skip に転ぶ）唯一の行が `<p><a><img></a></p>` であり、まさに ADR-001 が案1を棄却して一般規則を選んだ根拠のケース。将来の「簡略化」リファクタが設計判断を静かに巻き戻してもテストが検出できない。計画の真理値表 8 行のうち decorate 側の新挙動 3 行（`<p><img></p>`・空 `<p>`・`<p><a><img></a></p>`/`<td><img></td>`）のうち最後の行だけが未 pin という状態でもある。
  - 提案: `value='<p><a href="/x"><img src="/media/abc" alt=""></a></p>'` で `<p>` が decorate されることの pin を 1 本追加する（`<td><img></td>` を同一テスト内の第2フィクスチャにすれば真理値表 7 行目も同時に固定できる）。
- **[W-002]** `containsEditableBlock` の「任意深さの子孫探索」という述語のコアが skip 側で pin されていない（既存の skip pin は深さ1の `<li><p>` のみ）
  - 場所: `app/components/note/editor/InlineEditor.tsx:141`（述語定義）/ `app/components/note/editor/__tests__/inlineEditor.test.tsx:394`（唯一の skip 側 pin）
  - 理由: 新ゲートの skip 判定は `el.querySelector(...)`（子孫全域）に依存する。これを直接子の走査に書き換える誤リファクタをすると、`<blockquote><ul><li>x</li></ul></blockquote>` のような「editable 子孫が深さ2以上にある純粋コンテナ」の外側が skip → decorate に転ぶが、現行スイートにこの形のフィクスチャがなく検出されない。旧ゲート（`hasDirectTextChild` のみ）では深さが無関係だったため既存テストが深さを固定していないのは自然だが、新ゲートでは深さ非依存性が新たに仕様の一部になった。
  - 提案: `<blockquote><ul><li>x</li></ul></blockquote>` で外側 `<blockquote>` に `contenteditable` が付かず `<li>` に付くことを pin する 1 本を追加する。

#### Notes

- **[N-001]** 計画ステップ2の全7項目が過不足なく実装されている。AC-4（`contenteditable` 非漏出）は AC-3 テストへの統合だが、計画自体が「上記 emit 値に」と統合前提で書いており整合。既存テストは 1 件も変更されておらず、AC-5 を「既存スイートの green 維持」で検証するという計画の建付けが成立している。テストファイル先頭の contract docstring と `InlineEditor.tsx` の JSDoc 不変条件1も新規則で同期済み（計画ステップ 2-7 / 1-5）。
- **[N-002]** AC-2 テスト（`inlineEditor.test.tsx:975`）が実物の `insertMediaIntoHtml` を import して「文字列追記 → 新 `value` prop → resync rebuild」を再現しており、実挿入経路への忠実性が高い。モジュール間契約（`mediaInsert` の出力形が decorate 対象であること）のテストにもなっており、`mediaInsert.ts` の出力形が変わればこのテストが落ちる。
- **[N-003]** アサーション設計が false-positive しにくい。AC-3 は `textContent === "after"`（rollback なら空文字で fail）・`emitted` の `src="/media/abc"` / `"after"` 包含・`not.toContain("contenteditable")` を全て検査し、旧ゲートでは rollback 経路（`isContentEditable === false`）に落ちて確実に fail する（ミューテーション検証 1 で実証）。img force-remove テストは既存の td force-remove テスト（`:108`、target 非 contentEditable 分岐）と異なり「contentEditable target 上での `removedNodes` Element 検査」という分類器の別分岐を通るため、重複ではなく補完。なお同テストは旧ゲートでも pass する（decorate 有無に依らない構造保持の pin）が、これは「削除はスコープ外」制約の仕様固定という意図（テスト名 "structure preservation" と一致）どおり。
- **[N-004]** テスト環境の信頼性は既存実績で担保。happy-dom（jsdom ではない）上の MutationObserver + `flushMutations`（80ms 待ち > debounce 50ms）は既存 30 件超が依存する実証済みパターンで、分類器が使う `isContentEditable`（属性でなくプロパティ、継承込み）も既存テスト（`:422`）が既に pin している。新テストはこのパターンからの逸脱なし。
- **[N-005]** ユニットで再現不能な経路のギャップが手動検証記録に正直に残されている: IME 入力（TC-002 で agent-browser 制約により SKIP と明記）、`<td><br></td>` プレースホルダ `<br>` remove による rollback 実挙動（TC-007 で実ブラウザ確認、フォローアップ判断材料として記録）。ユニット側は composition イベントの既存テスト群が分類器の IME 分岐を汎用形で押さえており、役割分担が明確。

## サマリー

Blockers: 0 / Warnings: 2 / Notes: 5

新ゲートの真理値表のうちタスクで求められた5ケース（純粋コンテナ skip / img のみ / 空ブロック / mixed / pre）はすべて pin されており（前3者は本 PR の新規、後2者は既存）、新規 pin は旧ゲートに対して弁別力を持つことをミューテーションで確認した。残る弱点は、ADR の設計判断そのもの（一般規則 vs 例外列挙）をロックする pin（W-001）と、新述語の深さ非依存性の pin（W-002）の2点。いずれも回帰の芽であってこの PR の挙動の欠陥ではない。
