# ADR — Issue #680: 編集中フォームが routerInvalidate でフォーカスを失う（入力値は保持／再マウントではない）

本 Issue は #670 Step 0 実証（`.issue/670/step0-results.md`、ADR-003）で「再マウント・編集内容喪失は再現しないが、focus だけが invalidate で失われる」と確定した症状を分離対応するもの。よって ADR は「focus 喪失そのものをどう直すか」に集中する。

## ADR-001: 原因は RSC ペイロードコミット時の subtree 一時 detach。対処は「描画構造の見直し」ではなく「コミット後の focus/selection 復元」を採る

### Status
Accepted

### Context
`/_app/views`・`/admin/prompts`・`/_app/settings/prompts`（DEV）の各ルートは `component` が `Route.useLoaderData()`（= `renderServerComponent(...)` の RSC ペイロード）をそのまま返す構造。`routerInvalidate(router)`（本命経路: AppShell 常駐 `UploadDialog` 完了 → `UploadDialog.tsx:452`）が発火すると、これら表示系ルートの loader（`staleTime: 0`）が再実行され、新しい RSC ペイロードが**同一 client component インスタンスを reconcile しつつコミット**される。

#670 Step 0 の実測で確定した事実:
- 再マウントは起きない（mount プローブ "1" のまま）
- 編集 state（`useState`）は保持される（reconcile では lazy initializer は無視される）
- DOM ノードは同一・同位置・document 内に残留
- それでも focus だけが `<body>` に落ちる

この「同一ノードなのに focus が落ちる」挙動は、**プロジェクト内に既知の前例がある**: `app/components/common/useRovingMenu.ts`（#467）の `restoreFocusOnCommit`。JSDoc/コメント（L93-121）が「multi-select listbox が開いたまま filter navigation の RSC 再レンダーが走ると、コミット中に focus 中のアイテムノードが swap され focus が `<body>` に落ちる（focusout の relatedTarget は null、panel ref はコミット中 detach される）」と明記し、**コミット後に `activeElement === document.body` を条件に focus を貼り直す**パスで解決している。#680 はこれと同一機序を、roving menu ではなくフォーム入力（plain `<input>` / `<textarea>`）で踏んでいる。

選択肢:
1. **描画構造の見直し**（focus 中 subtree を RSC コミットで detach させない）。ルートの `component` 形状や `useLoaderData` の使い方を変える、もしくは focus 中フォームを invalidate 影響外の境界へ持ち上げる。
2. **コミット後の focus/selection 復元**。invalidate コミットで focus が `<body>` に落ちた直後、対象要素へ focus と selection（caret/選択範囲）を貼り直す。`useRovingMenu` の `restoreFocusOnCommit` と同型。
3. **invalidate 経路の抑制**（routerInvalidate から対象ルートを除外、または UploadDialog 完了時に invalidate しない）。

### Decision
**2 を採る。** 理由:

- 1（描画構造の見直し）は、TanStack Start RSC の `renderServerComponent` + `useLoaderData` がコミット時に subtree を detach する挙動そのものを変える必要があり、framework の内部挙動に踏み込む。`useRovingMenu` の前例が示す通り、この detach は RSC 再レンダーの構造的性質であって特定コンポーネントの組み方の問題ではない。境界外への持ち上げ（state lift）は #670 ADR-001 が検討した (a)/(b)/(c) と同じ重量級設計で、Step 0 が「守る state も防ぐ remount も無い」と否定した方向。focus は state ではなくブラウザのトランジェントな副作用なので、state lift では直らない。
- 3（invalidate 抑制）は退行を招く。対象3ルートは「自分の保存 → invalidate → 最新値再表示」を受け入れ条件とし（#670 ADR-003 / AC-5）、#669 のようなルート除外は使えないと #670 で確定済み。さらに UploadDialog 完了の invalidate はノート一覧等の表示更新に必要で、フォーム都合で止められない。
- 2 は**最小侵襲**かつ**プロジェクトの既存解法と同型**。focus はブラウザの副作用なので「コミット後に貼り直す」のが正攻法。`useRovingMenu` で確立した「`activeElement === document.body` ガード + コミット後 refocus」パターンをフォーム入力向けに一般化する。

ただし `useRovingMenu` はアイテムを index で再 query して focus するだけ（selection 概念なし）。フォーム入力では **caret 位置 / 選択範囲（`selectionStart`/`selectionEnd`/`selectionDirection`）も復元しないと、focus は戻っても caret が末尾/先頭にジャンプ**する。よってフォーム入力向けの専用フック（`useRestoreFieldFocusOnCommit` 仮称、`app/components/common/` 配置）を新設し、focus + selection の両方を退避・復元する。

### フックの置き場所（Issue が「設計が要る」と指摘した点）
Issue は「invalidate のトリガー（UploadDialog）がフォームから遠いため、退避・復元フックをどこに置くか設計が要る」と指摘する。これは **invalidate トリガー側（UploadDialog）には一切置かない**ことで解決する:

- UploadDialog 側で退避・復元するのは不可能（どのフォームが focus 中か知らない／知るべきでない。CLAUDE.md の関心の分離に反する）。
- `useRovingMenu` の前例と同様、**focus を失う当事者コンポーネント側（= 各フォーム入力を持つ client component）にフックを置く**。フックは「コミット後 `activeElement` が `<body>` に落ちていたら、自分が直前まで持っていた focus + selection を復元する」だけで、invalidate の発生源を知る必要がない。トリガーが遠いことは設計上の問題にならない（コミットは全コンポーネントに等しく届くため、focus を失った当人が局所的に検知・復元できる）。
- 復元対象は ref で当該フィールド要素を指す。フックは依存配列なしの `useEffect`（毎コミット後に走る）で、`activeElement === document.body` かつ「自分が直前まで focus を持っていた」場合のみ復元する。

#### caret/selection スナップショットの退避タイミング（P-002 の核心）
当初案は「各コミット直前に `activeElement`/selection を観測して退避する」だったが、これは成立しない。invalidate のコミットでは「focus が body に落ちるコミット」と「`useEffect` が走るコミット」が同一であり、`useEffect`（コミット後＝paint 後の非同期）が走る時点では既に `activeElement` が body へ落ちている。その時点で `activeElement` から selection を読もうとしても遅く、退避ソースが空になる。`useRovingMenu` は `activeIndex`（caller 所有の論理 state）を保持するだけで「直前に DOM focus があったか」を時間軸で追う必要がなかったため、この問題に直面しなかった。

したがって **focus を失う前に selection を継続的にスナップショット保持しておき、復元時はその保持済みスナップショットを使う**。具体的には:

- 当該要素が focus を持っている間、`onSelect` / `onKeyUp` / `onMouseUp` / `onInput` などのユーザー操作イベントで `selectionStart` / `selectionEnd` / `selectionDirection` を ref に随時記録する（focus 中は常に最新 caret が ref にある）。「直前まで自要素が focus を持っていたか」のフラグも同経路で更新する。
- **`focusout`/`blur` 直前の最終退避は必須（S-001）**。イベント駆動退避（`onSelect`/`onKeyUp`/`onMouseUp`/`onInput`）は caret 移動の主要経路を覆うが、「focus 直後・未操作で invalidate」では1つも発火せずスナップショットが空のままになりうる。focus を失う直前に最終退避を必ず1回挟むことで、捕捉漏れの保険とする。
- **スナップショット未取得時のフォールバック（S-001）**: それでもスナップショットが初期値（null）のまま復元に至った場合（`autoFocus` で開いた views inline rename 等で、操作前に invalidate が重なる余地がある）は、caret を末尾/先頭にジャンプさせず **focus のみ復元し `setSelectionRange` を呼ばない**。スナップショットが無いとき caret を強制設定しないことをフックの仕様とする。これにより退避漏れを「caret が末尾に飛んだ」失敗ではなく安全側に倒す。
- 復元は毎コミット後の `useEffect`（dep なし）で、`activeElement === document.body` かつ直前 focus フラグが立っている場合のみ、保持済みスナップショットを使って `el.focus({ preventScroll: true })` + `el.setSelectionRange(start, end, direction)` を行う（スナップショット無しなら focus のみ）。
- 退避（イベント駆動 + focusout/blur 最終退避）と復元（コミット後 effect）を分離するのが要点。両者を同一 effect に同居させると、上記タイミング問題で退避が間に合わない。

#### IME（composition）中の復元抑制（S-003）
日本語入力が主言語のため、IME 変換中（`compositionstart`〜`compositionend`）に `focus()` + `setSelectionRange()` を呼ぶと変換セッションが中断され未確定文字が確定/消失する実害があり得る。composition 中は復元を抑制する（`compositionend` まで保留、または早期 return で復元スキップ）。具体的な抑制方針は実装ステップ2の設計時点で確定する。

### 適用範囲
- 対象は **#680 が実機で focus 喪失を観測した3箇所**: `/_app/views` inline rename の `<input>`（`SavedViewsList/index.tsx` L360）、`/admin/prompts` の text `<textarea>`（`admin/PromptsForm/index.tsx` L189）＋ variables `<input type="text">`（同 L211、カンマ区切りプレースホルダ）の2フィールド、`/_app/settings/prompts` の text `<textarea>`（`identity/PromptsForm/index.tsx` L224、DEV のみ `staleTime:0`。本番は `Infinity` で loader 再実行されず影響しないが、フックは無害なので一律適用してよい）。新規フックは `HTMLInputElement | HTMLTextAreaElement` 双方対応なので `<input>`・`<textarea>` の別を問わず同一フックで配線できる。
- **スコープ外**: `identity/PromptsForm` 同ファイルの `PreviewPanel.sample` `<textarea>`（L362、`useState("")` のユーザー入力・loader 非由来）は配線しない。#680 が観測した3箇所＝loader 表示系フォーム入力に含まれず、#670 ADR-002 でスコープ外整理済み。なお #680 の復元対象は「loader-seed か否か」ではなく「invalidate コミットで focus が落ちるか否か」であり `sample` も技術的には同症状を持ちうるが、本 Issue のスコープ（実機観測3箇所）として明示的に線引きする。
- フックは UploadDialog 由来に限らず、`routerInvalidate` でも raw `router.invalidate()` でも、**コミットで focus が `<body>` に落ちる全経路**に効く（コミット後 `activeElement` を見るだけで発生源非依存のため）。

### Consequences
- 良い点: framework 挙動に踏み込まず、プロジェクトの既存解法（`useRovingMenu.restoreFocusOnCommit`）と同型で一貫。3フォーム + 将来の同型フォームに再利用できる共通フック。invalidate 経路を変えないため最新値再表示（AC-5）の退行ゼロ。
- トレードオフ: 「コミット後に `activeElement === body` なら refocus」は、ユーザーが意図的に focus を外した直後にたまたま invalidate が重なると意図に反して refocus しうる。ただし `useRovingMenu` 同様、`<body>` に落ちている＝どこにも明示的に focus が移っていない状態に限定するため実害は小さい（ユーザーが別要素へ移したなら activeElement はその要素で、復元は走らない）。
- **window blur（タブ切替）ケースのガード扱い（S-004）**: タブ非アクティブ化や window blur では `activeElement` は当該要素のまま残り、`<body>` にはならない（`useRovingMenu` L101-103 が明示的に依拠する挙動）。よって `activeElement === document.body` ガードは window blur では復元を走らせない＝何もしない。これは望ましい挙動で、タブ復帰時にユーザーの focus を勝手に奪わない。「タブ非アクティブ中に invalidate が走り復帰時に body へ復元が誘発される」懸念も、復帰前に body へ落ちていればコミット後 effect が拾う／落ちていなければガードで何もしない、のいずれかで破綻しない。jsdom では window blur の activeElement 挙動を忠実再現できないため、ユニットでは可能な範囲で pin し、最終確認は実機（ステップ7）に委ねる。
- **`preventScroll: true` の根拠の引き継ぎ（S-002）**: 復元時の `focus({ preventScroll: true })` は `useRovingMenu` L116-120 と同じく、復元がユーザースクロールと競合して表示位置が飛ぶのを防ぐためのもの。この WHY をフック JSDoc に残し、後続保守者が辿れるようにする。clamped index は roving menu 固有（コミットで option 集合が変わる）だが「コミットで対象が変わりうる前提」の知見として JSDoc に共有する。
- フックは毎コミット後に走る `useEffect`（dep なし）。`activeElement` 参照と早期 return のみで副作用は復元時だけなので、コストは無視できる（`useRovingMenu` の前例と同じ）。selection スナップショットの記録はユーザー操作イベント時のみで、こちらもコストは軽微。

---

## ADR-002: focus/selection 復元フックは新規共通フックに切り出し、3フォームから利用する

### Status
Accepted

### Context
3フォームはそれぞれ別ファイルの別 client component（views / admin prompts / settings prompts）で、focus を失う入力要素の型も `<input>` と `<textarea>` で異なる。`useRovingMenu` は menu アイテム前提で selection を扱わないため流用できない。

選択肢:
1. 各フォームに復元ロジックをインラインで重複実装する。
2. focus + selection 退避・復元を共通フック（`app/components/common/useRestoreFieldFocusOnCommit.ts` 仮称）に切り出し、3箇所が ref を渡して利用する。

### Decision
**2 を採る。** `useRovingMenu` が `app/components/common/` の単一フックとして3つ以上の consumer に使われている前例に倣う。フックは:

- `"use client"`。
- `HTMLInputElement | HTMLTextAreaElement` の ref（または ref を返す形）を受け取り、`<input>`・`<textarea>` 双方に対応する。
- selection スナップショットは focus 中のユーザー操作イベント（`onSelect`/`onKeyUp`/`onMouseUp`/`onInput` 等）で ref へ継続記録し、加えて `focusout`/`blur` 直前の最終退避を必須とする（ADR-001 の P-002 退避タイミング・S-001 を参照）。focus を失う前に最新 caret を手元に保持しておくのが目的。
- 復元は毎コミット後の `useEffect`（dep なし）で、(1) `activeElement === document.body` かつ (2) 直前に当該要素が focus を持っていた、ことを確認し、保持済みスナップショットで `el.focus({ preventScroll: true })` + `setSelectionRange(start, end, direction)` を行う。**スナップショットが未取得（null）なら focus のみ復元し `setSelectionRange` は呼ばない**（ADR-001 S-001 フォールバック）。
- selection は input/textarea のみ API を持つので型で絞る。composition 中は復元を抑制する（ADR-001 S-003）。

命名・配置・JSDoc は `useRovingMenu` / `routerInvalidate` の library-level JSDoc 文化（WHY を残す）に合わせる。JSDoc には RSC コミットでの focus 喪失機序・selection スナップショット継続保持の理由・`preventScroll: true` の根拠（`useRovingMenu` L116-120 を引き継ぐ、S-002）・clamped index の知見を残す。

### Consequences
- 良い点: 1実装・1テスト。`<input>`/`<textarea>` 両対応。将来 invalidate 影響下の編集中フォームが増えても同じフックで守れる。CLAUDE.md「cross-cutting concern はフック/ポートに集約」と整合。
- トレードオフ: 新規ファイルが1つ増える。ただし重複インライン実装（選択肢1）よりは保守容易。

---

## ADR-003: 原因特定はコードリーディング + 既存前例で確度高だが、復元挙動は実機で再検証する

### Status
Accepted

### Context
「同一 DOM ノードが RSC コミットで detach され focus が落ちる」機序は、(a) #670 Step 0 の実機観測（focus → body）と (b) `useRovingMenu.restoreFocusOnCommit` の既存コメント（同一機序を明文化）の2つで裏付けられており、原因特定は確度が高い。ただし「コミット後 `useEffect` で復元する」タイミングが、RSC コミットの detach→再 attach サイクルに対して確実に**後**に走るか（= 復元が再び detach で打ち消されないか）は、framework のコミット詳細に依存し、コードリーディングだけでは断定できない。`useRovingMenu` が同型で機能している事実は強い傍証だが、対象が roving item から text field + selection に変わる。

### Decision
- 実装は ADR-001/002 の方針（コミット後 focus + selection 復元フック）で進める。
- **実装フェーズで #670 Step 0 と同じ手法（`pnpm dev` + agent-browser、`window.__TSR_ROUTER__.invalidate({filter})` で本命経路を忠実再現、focus を動かさず観測）で再検証する**ステップを必須化する。3フォームすべてで「invalidate 後も focus と caret 位置が保持される」ことを確認する。
- 万一フックでは復元しきれない（再 detach で打ち消される等）場合に備え、フォールバックとして ADR-001 選択肢1（描画構造見直し）を残課題として記録する。ただし `useRovingMenu` 前例から、フックで解決する見込みが高い。
- **フォールバック遷移条件は観測値で一意化する（S-003）**: 実機ゲートでの「フックで復元しきれない」判定を主観に流さないため、(a)「復元後に focus が当該要素へ戻らない」、または (b)「focus は戻るが、スナップショットが存在したのに `setSelectionRange` 後の `selectionStart` が退避値と一致しない」のいずれかが3フォームで1つでも起きたら、という閾値で起票判断する。S-001 で追加した before/after 実測値をこの判定に使う。

### Consequences
- 良い点: 不確実性を計画に明記し、実機ゲートで担保する（#670 が確立した検証文化を踏襲）。
- トレードオフ: 実装に実機検証ステップが必須で、CI だけでは完結しない（focus 挙動は jsdom では忠実に再現できないため、ユニットテストは退避・復元ロジックの単体検証に留め、統合挙動は実機で見る）。

---

## ADR-004: 「直前まで focus を持っていた」フラグは focus イベントだけでなくコミット後の `activeElement` でも arm する

### Status
Accepted

### Context
実装当初、復元ゲートの「直前まで当該要素が focus を持っていた」フラグ（`hadFocusRef`）は、ユーザー操作イベント（`onFocus`/`onSelect`/`onKeyUp`/`onMouseUp`/`onInput` + `onBlur` 最終退避）でのみ arm する設計だった。実機ブラウザ検証（plan ステップ7）の異常系 E-1 で、この設計の穴が判明した:

- `/_app/views` の inline rename `<input>` は `autoFocus` で開く。**`autoFocus` による DOM focus は React がイベントハンドラを配線する前に起きるため、React の合成 `onFocus` を発火させない**。
- よって「rename を開いた直後・一度も操作せずに invalidate が重なる」と、どの capture イベントも走っておらず `hadFocusRef` が false のまま。復元 effect が早期 return し、focus が `<body>` に落ちたまま復元されない。
- ADR-001 S-001 フォールバックの JSDoc は「`autoFocus`-opened field hit by an invalidate before any interaction → focus is restored（caret は触らない）」と focus 復元を想定していたが、実機ではその focus 復元自体がスキップされていた。

なお happy-dom 上では programmatic `field.focus()` が React 合成 `onFocus` を発火させてしまうため、この穴はユニットテストでは再現せず、実機ゲートで初めて顕在化した（ADR-003 が実機検証を必須化した意義が実証された形）。

### Decision
復元 effect（毎コミット後・dep なし）の末尾で、`ref.current !== null && document.activeElement === ref.current` なら `hadFocusRef` を arm する処理を追加する。イベント駆動 capture は退避（selection スナップショット）のためにそのまま残し、**held-focus フラグの arm 経路だけをコミット後 `activeElement` 観測でも補う**。これにより:

- `autoFocus` / 任意の programmatic focus で開いた要素も、マウントコミット後の effect で「いま focus を持っている」ことが検知され arm される。次の invalidate コミットで body に落ちれば復元される。
- 復元で `el.focus()` した直後も `activeElement === el` になるため、連続 invalidate でフラグが立ち続ける。

実機再検証で E-1 は PASS（focus 復元、caret は snapshot 未取得のため強制移動なし）、E-2（別要素へ移動時は復元しない）・通常ケース（focus/caret 保持）も回帰なしを確認。ユニットでは、selection 捕捉ハンドラを spread しない Probe で「snapshot=null だが post-commit `activeElement` 経路で arm → focus のみ復元、`setSelectionRange` 未呼出」を pin し、E-1 修正の回帰防御を成立させた。

### Consequences
- 良い点: `autoFocus` を含む全 focus 経路で復元が効く。ADR-001 S-001 の「snapshot 未取得時は focus のみ復元」仕様が実機でも成立する。
- **レビュー Round 1 Frontend W-001 の扱い（受容リスクとして見送り）**: 「`hadFocusRef` が解除されないため、ユーザーが `<body>` へ意図的に blur した後、無関係な invalidate が偶然重なると focus を奪い返しうる」という指摘。見送りの主たる根拠は**実害の小ささ**にある。別要素へ focus を移したケースは `activeElement === body` ガードで既に復元が走らず（実機 E-2 PASS）、残るのは「`<body>` へ意図的 blur ＋ 直後に無関係 invalidate が偶然重なる」稀なケースのみで、実害も小さい（value は保持され、再クリックで継続可能、focus が編集対象に戻るだけ）。

  代替案として `hadFocusRef` を `onBlur` で解除する（ユーザー blur 時に arm を落として復元を抑止する）案も考えられるが、確実とは言えない: RSC detach 由来の focus 落ちも `relatedTarget: null` の `focusout` を発生させる（ADR-001 / フック JSDoc 参照）ため、detach とユーザーの意図的 body blur を `onBlur` だけで分離できるかは未実測で、分離できない場合は本来復元したい detach ケースまで `onBlur` 解除で取りこぼすリスクがある。`useRovingMenu` は明示的な「編集継続中（menu open）」状態ゲートでこの種の区別を回避しているが、常時編集可能なフォーム入力には等価なゲートがない。完全な解決には ADR-001 選択肢1（描画構造見直し）が必要だが、発生条件の狭さと実害の小ささに見合わない。よって**このフックでは追加の解除ロジックを入れず、受容リスクとして記録し見送る**（必要が生じれば onBlur の relatedTarget 観測を実機で裏取りしてから判断する）。
- トレードオフ: コミットごとに `activeElement` 比較が1回増えるが、参照比較のみでコストは無視できる。
