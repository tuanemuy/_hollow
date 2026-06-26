# ADR — Issue #781: データ駆動 RSC ルートの roving radiogroup でのフォーカス復元

## ADR-001: フォーカス復元は automatic variant 限定のオプトイン `restoreFocusOnCommit` として `useRovingTablist` に追加する

### Status
Proposed

### Context
`/tags` の並び替え軸 radiogroup は automatic activation（矢印移動 = 即選択）で、選択が `loaderDeps` 内の `sort` を変えるため RSC loader が再実行され、サブツリー再レンダーで client island のフォーカスが `<body>` へ脱落する。`onKeyDown` 内の同期 `items[next].focus()` は再レンダー前に走るため上書きされ、連続矢印操作（roving の継続）が成立しない。

修正には共有プリミティブ `useRovingTablist` への変更が必要だが、同フックの automatic consumer には **client-only**（再レンダーを伴わずフォーカスを保持できている）の `DisplayModeSwitch` / `PublicTopControls` 表示形式 segmented と、**manual activation** の `EditorModeSwitch` があり、これらの後方互換を壊してはならない。

検討した選択肢:

- **案A: automatic variant にオプトイン `restoreFocusOnCommit?: boolean` を追加する（`useRovingMenu` と同名）。** データ駆動 consumer（`TagListToolbar`）だけが `true` を渡し、復元 effect を有効化する。非オプトインはデフォルト off で観測可能な挙動差なし。
- **案B: 復元専用の別フック（例 `useRovingTablistWithRestore`）を新設する。** automatic/manual + 復元の組合せを別フックに分離。
- **案C: 全 automatic consumer で無条件に復元する（オプション無し）。** フック内部で常に復元 effect を走らせる。
- **案D: フックを変えず `TagListToolbar` 側で復元を自前実装する。**

`useRovingMenu` は既に `restoreFocusOnCommit?: boolean` を持ち、「panel が開いたまま選択をまたぐ multi-select listbox で RSC 再レンダー後に focus が body へ落ちるのを復元する」という**同一問題の解をコードベース内に確立済み**（`TagAddPopover` が利用）。本件はその確立済みパターンの横展開であり、新規発明ではない。

### Decision
**案A を採用する。** `useRovingTablist` の **automatic variant（`UseRovingTablistAutomatic`）に** `restoreFocusOnCommit?: boolean` を、**manual variant（`UseRovingTablistManual`）に** `restoreFocusOnCommit?: never` を追加し、`TagListToolbar` だけが `true` を渡す。

- 命名・コントラクトは `useRovingMenu.restoreFocusOnCommit` と統一する（「コミットが body へ落としたフォーカスを復元する」という共通理解 / API 一貫性）。
- **型の扱い（discriminated union 両メンバーに宣言）**: 既存フック引数は `UseRovingTablistOptions`（`UseRovingTablistAutomatic | UseRovingTablistManual`）を直接分割代入している（`{ orientation, count, selectedIndex, onSelect, manualActivation }`）。union から分割代入できるのは全メンバーに存在するプロパティのみのため、automatic 側だけに生やすと `{ restoreFocusOnCommit = false }` が `UseRovingTablistManual` に存在せず typecheck エラー（TS2339）になる。よって manual variant にも `restoreFocusOnCommit?: never` を宣言し、(1) union の共通プロパティ化で分割代入を型安全にし、(2) manual で `true` を渡す組合せを型エラーにする。`?: never` を採用（`?: false` だと `restoreFocusOnCommit: false` を明示的に渡せて意味的にノイズ）。これにより manual（`EditorModeSwitch`、client-only・再レンダーなし・`focusedIndex` が tabIndex を保持し症状が出ない）+ 復元の組合せが**型レベルで表現不能**になり（illegal state unrepresentable）、automatic だけが復元をオプトインできる。
- デフォルト off により、非オプトイン consumer はフックのデフォルト挙動が #776 と等価（観測可能な挙動差なし。常時宣言の useEffect が1つ増えるが先頭で early-return しノーオペ）に保たれる。

案B は #660 ADR-002 が「roving プリミティブの無秩序な増殖を避け、小さな専用フックに閉じる」とした方針に反し、automatic 経路のロジックを二重化する。案C は client-only consumer や初期ロード時に焦点を横取りする回帰を生む（常時マウントの segmented では「いつ復元してよいか」のスコープが必須 — ADR-002 参照）。案D はフォーカス復元という横断的関心をプリミティブの外へ漏らし、`useRovingMenu` が同関心を内包しているのと非対称になる。

### Consequences
- 良い点: `TagListToolbar` の1行追加（`restoreFocusOnCommit: true`）だけで連続矢印操作が成立。他3 consumer は無変更で後方互換。`useRovingMenu` と API・コントラクトが揃い、roving プリミティブ全体の一貫性が保たれる。型で automatic 限定を強制。
- トレードオフ: `restoreFocusOnCommit` という同名オプションが2フックに並存し、内部の発火条件は微妙に異なる（menu は `open` ゲート、tablist はキーボード意図フラグ — ADR-002）。ただし公開コントラクトは同一で、JSDoc で内部差分を明記すれば理解可能。

---

## ADR-002: 常時マウントの segmented では「キーボード操作意図フラグ + dep 配列なし post-commit effect」で復元をスコープする

### Status
Proposed

### Context
`useRovingMenu` の復元は「`open` の間だけ + `activeElement === document.body` + dep 配列なし（毎コミット後）」で動く。`open` が「ユーザーが今この panel を操作中」という暗黙のスコープを与えるため、その間の body 脱落は常に操作起因で、復元してよい。

しかし `useRovingTablist` の対象は**常時マウントの segmented control**で `open` の概念が無い。無条件に毎コミット復元すると、初期ロード時・他 island 操作時・ウィンドウ blur 時など「キーボード操作と無関係に `activeElement` がたまたま body」の局面で焦点を radiogroup へ引き戻す回帰が出る。よって「キーボード操作の最中」を示す別のスコープが必要。

加えて、automatic 経路の `onKeyDown` は同期 `focus()` を行うため、フォーカス脱落は「commit-1（optimistic 反映、focus はまだ target に乗っている）→ commit-2（RSC 再レンダーで body へ脱落）」の2コミット構造で遅れて起きる。スコープ機構はこの遅延を越えて復元を発火できなければならない。

検討した選択肢:

- **案A: キーボード操作意図フラグ（`restorePendingRef`）+ dep 配列なし post-commit effect。** 矢印押下でフラグを立て、毎コミット後の effect が「フラグ立ち + `activeElement===body`」で復元しフラグを倒す。target に focus が保持されている間（commit-1）はフラグを維持し、body 脱落（commit-2）で復元する。
- **案B: `selectedIndex` を dep にした effect で復元する。** 選択 index 変化を検知して復元。
- **案C: `onKeyDown` 内で `requestAnimationFrame` / `setTimeout` 後に復元する。**

### Decision
**案A を採用する。** `useRovingMenu` と同型の「dep 配列なし post-commit effect + `activeElement===document.body` ガード + `preventScroll: true`」に、segmented 特有のスコープとして**キーボード操作意図フラグ**を重ねる。

- 矢印/Home/End 確定時（automatic 経路、opt-in 時）に `restorePendingRef.current = true`。
- effect: opt-in でなければ即 return（非オプトイン consumer は実質ノーオペ）。フラグが立っていなければ return。`activeElement` が復元先 radio なら（同期 focus 保持中 = commit-1）フラグを維持して return。`activeElement` が body 以外なら（ユーザーが意図的に別所へ移動）フラグを倒して return（横取りしない）。body なら復元先（`Math.min(Math.max(selectedIndex, 0), len-1)` で上下限クランプ）へ `focus({ preventScroll:true })` しフラグを倒す。

案B は不適。optimistic により `selectedIndex` は click/矢印で即座に変わり、その後の RSC 再レンダー commit は同じ `selectedIndex` の別コミットなので、`selectedIndex` dep の effect は body 脱落の前に発火して取りこぼす（`useRovingMenu` が dep 配列を持たない理由と同じ「脱落はコミット内で起き、確実なフック点は post-commit のみ」）。案C はタイマー依存でテスト不安定・レース誘発。

### Consequences
- 良い点: `useRovingMenu` の確立済み機構（post-commit / body ガード / preventScroll）をそのまま流用しつつ、常時マウント故の焦点横取りをフラグで確実に防止。2コミット遅延の脱落も復元できる。
- トレードオフ: フラグ解除ロジック（保持中は維持・body で復元解除・別所で解除のみ）に微妙な順序依存があり、誤ると「永続フラグ」化（後続の無関係 body 脱落で復元）や「早期解除」（commit-2 の脱落を取りこぼす）を招く。JSDoc とテストで意図を固定する。理論上フラグが消費されず残る極端ケース（キーボード操作後に一度も body 脱落が起きない）は残るが、対象（データ駆動 `TagListToolbar`）では再レンダーが必ず body 脱落を起こすため実害はない。

---
