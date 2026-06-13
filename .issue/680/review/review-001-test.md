# レビュー記録 — Issue #680 / PR #684（観点: Test）

- レビュアー観点: Test
- 対象: `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx`（新規8ケース）
- 参照: `.issue/680/plan.md`（テスト方針 / 受け入れ基準）、`.issue/680/manual-test/results/summary.md`、`useRestoreFieldFocusOnCommit.ts`
- 実測補助: happy-dom 上で `field.focus()` / `setSelectionRange()` がどの合成イベントを発火するかをプローブ実験で確認（下記 B-001 の根拠）

## Test

### Blockers

- **[B-001]** 「スナップショット未取得フォールバック（focus のみ復元・`setSelectionRange` を呼ばない）」を pin したと称する2ケースが、実際にはフォールバック分岐を一度も通っていない（偽陽性）
  - 場所: `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx:124-140`（"restores focus only (no setSelectionRange) when no snapshot was captured"）および `:142-159`（"restores an autoFocus-style field armed only from the post-commit activeElement"）
  - 理由: happy-dom 上での実測で、`field.focus()`（プログラム的 focus）は **React 合成 `onFocus` を発火する**（プローブで focusFired=1 を確認）。フックは `onFocus: capture` を配線しているため（`useRestoreFieldFocusOnCommit.ts:69,141`）、両テストとも focus 時点で `capture()` が走り snapshot が **必ず非 null になる**（focus 直後の input は happy-dom では caret=末尾。autoFocus テストでは snapshot={11,11} が入り、復元時に `setSelectionRange(11,11)` が実際に呼ばれることをプローブで確認）。つまり `if (snapshot !== null)` の false 側（`useRestoreFieldFocusOnCommit.ts:121` の skip パス）は **どのテストでも実行されない**。両テストの本文コメント（`:138-139`「no snapshot was captured」、`:156-158`「no snapshot was captured, so the caret is left to the browser default」）は事実に反する。加えて両テストは caret に関する assertion を一切持たず `activeElement === field` しか見ないため、`setSelectionRange` が呼ばれていても/呼ばれていなくてもグリーンになり、ラベルとのズレが不可視になっている。
  - さらに重大なのは、このフォールバック分岐こそ実機ゲート E-1（`TC-E1.md` / `summary.md:21,29-37`）で **バグが発見され修正された load-bearing なコード**（`useRestoreFieldFocusOnCommit.ts:125-131` の「post-commit `activeElement` から hadFocus を arm」）だという点。実機では autoFocus が React の合成ハンドラ配線前に focus するため `onFocus` が発火せず `hadFocusRef` が arm されなかった（だから focus が body に残った）。しかし happy-dom の `field.focus()` は `onFocus` を発火してしまうので、テストは event 経路で `hadFocusRef` を arm してしまい、修正が追加した `activeElement` 経路（`:129-131`）を通らない。よってテスト名 "armed only from the post-commit activeElement"（`:142`）が主張する経路は検証されておらず、E-1 修正に対する回帰防御が成立していない。
  - 提案: フォールバック分岐を確実に通すよう、(1) snapshot を強制的に null に保つ条件を作る（例: focus させず `ref.current` だけ存在させて `activeElement` 経路だけで arm する、または `capture` が snapshot を入れない状況＝`selectionStart===null` を作る）か、(2) 最低限 `setSelectionRange` の呼び出し有無を観測する（`el.setSelectionRange` をスパイし call 回数で「snapshot あり→呼ぶ／なし→呼ばない」を分岐 assert する）。特に「autoFocus armed only from post-commit activeElement」は、`onFocus` を発火させずに `activeElement` だけが field を指す状態を作って復元されることを示す形に組み替える必要がある（現状は event 経路で arm しており主張を検証していない）。

### Warnings

- **[W-001]** `isConnected === false` ガードがどのテストでも実行されていない（plan ステップ3が列挙した分岐の取りこぼし）
  - 場所: `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx:109-122`（"does nothing when the field is gone from the tree on the next commit"）
  - 理由: 実測で、要素を `show=false` で commit から外すと `ref.current` は **null になる**（プローブで確認）。よってこのテストが通すのは `el !== null` ガード（`useRestoreFieldFocusOnCommit.ts:115`）であって、`el.isConnected`（`:116`）ではない。テストコメント（`:117-118`「the null/`isConnected` guards」）は両方に効くかのように書くが、`isConnected === false`（ref は残るがノードが document から切れている状態）の分岐は未到達。plan ステップ3（`plan.md:100`）は「`el.isConnected === false` の場合 → 何もしない（クラッシュしない）」を独立ケースとして明示していた。
  - 提案: ref を保持したままノードだけ `el.remove()` して `isConnected===false` を作る別ケースを追加するか、本テストの名前/コメントを「null ガード（ツリーから消えた場合）」に正し、`isConnected` ガードは別ケースで pin する。

- **[W-002]** IME ガードの「composition 終了後に復元が再開する」半分が pin されていない
  - 場所: `app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx:161-179`（"does not restore while an IME composition is in progress"）
  - 理由: 当該テストは composition 中の抑制（`document.activeElement === document.body` のまま）のみ assert する。`onCompositionEnd` での `composingRef` 解除 + `capture()` 再実行（`useRestoreFieldFocusOnCommit.ts:159-162`）と、その後の commit で復元が再開し caret も戻ることは検証していない。プローブ実験では compositionend 後の commit で `activeElement===field`・caret=(1,4) 復元を確認できており、本来 pin 可能。日本語入力が主言語のプロジェクトで「変換確定後に focus/caret が戻る」は重要挙動。`composingRef` を解除し忘れても抑制テストはグリーンのままになる（恒久抑制バグを見逃す）。
  - 提案: compositionstart→drop→commit（抑制）→compositionend→commit（復元・caret 一致）まで通すケースに拡張、または独立ケースを追加する。

- **[W-003]** テスト本文コメントが実環境の挙動と食い違っており、誤誘導になっている
  - 場所: 同ファイル `:138-139`、`:146-148`、`:156-158`、`:117-118`
  - 理由: B-001/W-001 で示したとおり、コメントが主張する前提（「snapshot 未取得」「autoFocus は onFocus を発火しない」「isConnected ガード」）は happy-dom の実挙動と一致しない。コメントが assertion で裏付けられていないため、将来の読み手が「この分岐は守られている」と誤解する。
  - 提案: B-001/W-001/W-002 の修正に合わせ、コメントを実際に検証している内容へ揃える（検証していない前提は書かない）。

### Notes

- **[N-001]** 復元ハッピーパス（`:68-84`）は良質。`activeElement` を body に落としてから commit し、focus 復帰 + caret(2,5) 一致を assert しており、トートロジーでなく実体を pin している（フックを外せば落ちる）。
- **[N-002]** window-blur 相当（`:181-197`）は非トートロジーで価値が高い。`activeElement` が field のまま（body に落ちない）ケースで、ページが設定した caret(6,6) が改変されないことを assert。`activeElement === document.body` ガード（`:117`）を外すと snapshot(0,2) に上書きされて落ちるため、ガードを正しく pin している。S-004 をユニットで担保できている。
- **[N-003]** 「別要素へ focus 移動 → 非復元」（`:86-97`）、ハッピーパス、window-blur の3本でガード（body 限定 + 直前 focus）の主要分岐を押さえている。テスト設計の骨格（再レンダーを commit に見立て、activeElement を手で body に落として RSC detach を simulate）は plan の限界明記（`plan.md:156,160-161`）と整合し、jsdom/happy-dom で再現不能な統合挙動を実機ゲートへ委ねる責務分担は妥当。
- **[N-004]** 実機ゲート（`summary.md`）は before/after caret 数値一致（TC-2〜9）、発生源非依存（TC-6）、文中 caret（TC-7）、value 非退行（R-2）、品質ゲート（R-3）まで観測値で記録されており、ユニットでは賄えない統合挙動を妥当に補完している。ユニット⇔実機の責務分担そのものは適切。ただし B-001 のフォールバック分岐は「実機で一度バグった」経緯がある以上、ユニットでも分岐到達を保証しておく価値が高い（実機 E-1 は autoFocus 起点で、ユニットでは happy-dom の差異により別経路で素通りしているため）。
- **[N-005]** フォーム3箇所の配線（`SavedViewsList/index.tsx:267,376`、`admin/PromptsForm/index.tsx:107-108,203,227`、`identity/PromptsForm/index.tsx:148,239`）はテストの Probe（`{...handlers}` を `onChange` の後に spread）と同形で、`onChange` と衝突しない別プロップであることを確認。テストの Probe は実利用を忠実に代表している。

## サマリ

ハッピーパス・window-blur・別要素 focus・未 focus・ツリー消失の主要ガードは堅実に pin されている。一方で、plan/AC が明示的に要求した「スナップショット未取得フォールバック」分岐は、happy-dom の `field.focus()` が React 合成 `onFocus` を発火する性質により、2ケースが揃って分岐を素通りしており（しかも caret assertion を持たないためラベルと挙動のズレが不可視）、実機 E-1 で修正された load-bearing な経路に対する回帰防御が成立していない。これを Blocker とする。`isConnected` ガードと IME 復元再開は Warning（取りこぼし／半検証）。
