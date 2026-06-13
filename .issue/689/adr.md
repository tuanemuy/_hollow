# ADR — Issue #689: エディター画面（P12）残存乖離（タグ行/タイトル/ディレクトリ行/本文枠線）

## ADR-001: タグ行をモックのチップUIに寄せる（#669 ADR-001 の差分許容を supersede）

### Status
Proposed（#669 ADR-001 を supersede）

### Context
#669 ADR-001 は「チップUIは追加・削除・IME 確定・フォーカス管理など当時のスコープを超える」として差分許容（カンマ区切りシンプル入力の踏襲）を選び、「チップUI化が必要になった場合は state 再設計を伴う独立 Issue として起票する」と明記していた。本Issue #689 がまさにその独立 Issue にあたり、受け入れ条件1で「チップ化する／差分許容を正式継続する」の再判断を求めている。

モック `.tags-row` は、確定タグを個別削除可能なチップ（`.tag-chip` 高さ26px・pill・末尾 `×`）として横並び表示し、末尾に borderless の `.tag-input` が同一行に共存する。現実装は単一の `tagInput: string`（カンマ区切り）で、見た目も編集モデルもモックと別物。

選択肢:
1. モック準拠のチップUIを実装する（state を `tagNames[]` + draft の二層に再設計）
2. 挙動はそのまま見た目だけチップ風に装飾する（見せかけチップ）
3. シンプル入力を踏襲し差分を許容し続ける（#669 ADR-001 の継続）

### Decision
1 を選ぶ。本Issueはまさに #669 ADR-001 が起票を予告した「チップUI化の独立 Issue」であり、ここで先送りすると当該乖離が恒久化する。state は `EditorState.tagInput: string` を `tagNames: readonly string[]`（確定タグ）+ `tagDraft: string`（入力中バッファ）に二層化し、`addTag` / `removeTag` / `setTagDraft` アクションで遷移を表現する。`parseTagInput` はバッファ確定時のトークナイザ（カンマ区切り・trim・重複排除）として残し、`addTag` から利用する（ペースト一括追加も同経路）。

2 の見せかけチップは編集モデル（単一テキスト値）と見た目（個別操作できそうなチップ）が乖離し誤操作を招くため不採用（#669 ADR-001 と同じ理由）。3 は受け入れ条件1の「再判断」要請に対し現状維持となり、Issue の主目的（残存乖離の解消）を果たさない。

**未確定 draft の扱い（lockstep）:** submit / autosave 時に入力中の `tagDraft` が非空なら、送信直前に確定して `tagNames` にマージしてから送る。これにより「入力したが Enter を押していないタグが保存されない」事故を防ぐ。この確定は**単一の純粋ヘルパー `resolveTagNames(state)`**（= `state.tagNames` に非空 `state.tagDraft` を `parseTagInput` で確定マージした `readonly string[]` を返す）に切り出し、`editorState.ts` に置く。`NoteEditor.onSubmit` と `useAutosave` の `snapshotForSubmit` の**両方がこの同一関数を通る**ことで `tagNames` ソースを一本化し lockstep を成立させる（submit だけ確定して autosave は確定しない、という非対称を排除）。これに伴い `snapshotForSubmit` / `EditorSnapshotInput` から `tagInput` 依存を除去し、`useAutosave` の `useMemo` deps を `tagInput` から `tagNames` + `tagDraft` の両方へ更新する。`resolveTagNames` は vitest で単体検証する（型 + テストで lockstep を担保）。

### Consequences
- 良い点: モックの編集体験（個別チップ削除・即時追加）に一致。autosave/submit の `tagNames` 配列契約はサーバー側そのまま維持されるためバックエンド影響ゼロ。
- トレードオフ: reducer・テスト・autosave・submit 配線に波及する中規模変更。IME 確定中の Enter 誤確定など入力ハンドリングの作り込みが必要。

---

## ADR-002: チップ入力は既存 toggle chip を再利用せず編集用 `TagsInput` を新設する

### Status
Proposed

### Context
PR #691（#654）で公開ページに「タグを追加」chip が入り、`app/components/public/styles.ts` の `CHIP` / `CHIP_REMOVE`、`app/components/note/list/styles.ts` の `filterChip` 系などチップ系スタイルが存在する。再利用できないか調査した。

調査結果: これらはいずれも **URL の `tags` クエリを toggle するフィルタ chip**（選択状態を URL/検索条件に反映する read 操作）であり、`data-[active]` で塗りを反転する設計。編集用に必要な「入力バッファ + 任意文字列の追加 / 個別削除 / Backspace 削除」というモデルを持たない。`app/components/common/styles.ts` の `chip` は base スタイル定数のみ。

選択肢:
1. 既存 toggle chip コンポーネント／スタイルを流用する
2. 編集専用の `TagsInput` コンポーネントを新設し、スタイルはモック `.tag-chip` / `.tag-input` 値を utility 化して `editor/styles.ts` に置く

### Decision
2 を選ぶ。toggle chip と編集チップは責務（read フィルタ vs write 入力）も a11y 構造（`button[aria-pressed]` の toggle vs `list`+`listitem`+削除ボタン+`textbox`）も異なり、無理に共通化すると分岐が増えて両者が壊れやすくなる。スタイル値（pill・26px・surface・accent-ink）は共通だが、それは utility 文字列の一致であって構造の共有ではない。編集用 `TagsInput` を `app/components/note/editor/` に新設し、繰り返す utility は `editor/styles.ts` に module-scoped 定数として集約する（CLAUDE.md styling 規約）。

### Consequences
- 良い点: フィルタ chip の挙動を凍結したままエディター専用の入力体験を最適化できる。a11y 構造が用途に正しく対応する。
- トレードオフ: チップの見た目を表す utility がフィルタ側とエディター側に2系統並存する（値は近いが SSOT はモック）。将来チップ意匠を変える際は両方を確認する必要がある。

---

## ADR-003: ディレクトリ行を単一 pill トリガー + ツリードロップダウンへ完全移行する（#669 ADR-002 の内装非再現方針を supersede）

### Status
Proposed（#669 ADR-002 を supersede）

### Context
モック `.dir-row` は「ラベル + 単一 `.dir-pill`（フォルダーアイコン + 現在パス + キャレット）」の1トリガーで、クリックで `.dir-dropdown`（検索 input + 折りたたみ可能なツリー + 選択ハイライト + 「新規ディレクトリを作成…」項目）が開くコンパクトUI。現実装 `DirectoryPicker` の `variant="row"` は `DirectorySelectField`（検索付きコンボボックス）+ 新規名 pill input の2フィールド常時表示で、見た目も操作モデルもモックと別物。なお、モック HTML の日本語ラベルは `場所`・a11y ロールは `listbox`/`option` だが、本Issueでは**ラベル文言は現行実装の SSOT「ディレクトリ」を維持**し（後述）、**a11y ロールも本 ADR で確定する combobox+listbox モデル**（後述）に従う（モック HTML の表記には拘束されない）。

#669 ADR-002 は「`.dir-dropdown` の完全再現はしない。`DirectorySelectField` が同等機能を提供する」と差分許容を選んでいた。本Issueでユーザーが**完全移行を選択**したため、当該方針を supersede する。

既存部品の再利用可否を実コードで調査した:
- **`common/Popover.tsx` + `usePopover.ts`（Issue #467）は再利用できる。** `haspopup="listbox"` モードを備え、外側 mousedown / Escape / Tab-out での閉じ、トリガーへのフォーカス復帰、`aria-haspopup`/`aria-expanded`/`aria-controls` 配線、ビューポートクランプ（`clampToViewport`）を提供する。`ViewSwitcher`（`note/list/ViewSwitcher.tsx`）が `Popover haspopup="listbox"` + `useRovingMenu({ itemRole: "option" })` + `role="option"` ボタン群でほぼ同型の listbox ドロップダウンを実装しており、これを直接の実装リファレンスにできる。
- **`useRovingMenu.ts`（Issue #467）は本ドロップダウンでは使わない。** `useRovingMenu` は `activeIndex` を**実 DOM の `.focus()`** に反映する実フォーカス roving であり、検索 input にフォーカスを残したまま `aria-activedescendant` で論理的アクティブ option を指す combobox パターン（本 ADR の採用モデル・後述）と相反する。両モデルを同居させると衝突するため不採用。先例の `ViewSwitcher` は `useRovingMenu` を使うが**検索 input を持たない**点が本ケースと異なる。可視 option フラット列の index は自前の `activeIndex`（`aria-activedescendant` が指す対象）として呼び出し側が算出・所有する。
- **ツリーの折りたたみ表示は `DirectoryTree.tsx` の `expanded` ロジック（`role="tree"`/`treeitem`）が参考になるが、そのままは使えない。** `DirectoryTree` は `treeitem` + Link ナビ + Rename/Delete メニュー前提のサイドバー部品であり、`listbox`/`option` の単一選択ドロップダウンとは a11y 構造も用途も異なる。折りたたみアルゴリズム（`expanded` map + 子の再帰描画）は移植・参考にするが、コンポーネントは新規に書く。
- **ツリーデータは props 供給。** `FlatDirectory[]`（`id` / `parentId` / `name` / `depth` / `path`）が `loadDirectoryTreeFlat`（RSC）/ `getDirectoryTreeFn`（client）経由で `NoteEditor` → `DirectoryPicker` に渡る。親子関係は `parentId` で再構成でき、折りたたみツリー描画に十分。
- **選択契約は維持必須。** 現行は「既存 `directoryId`（string）」XOR「新規 `pendingDirectoryName`（string）」の二者択一を orchestrator（`NoteEditor` reducer / Ingestion の useState）が所有する。`pendingDirectoryName` は保存時に `createDirectoryFn` で実体化され、解決した id が `createNoteFn`/`saveNoteFn` に渡る。submit / autosave ペイロードはこの契約に依存しているため**新UIでも同一の `onSelectExisting` / `onSetPendingName` コールバックを温存**する。
- **`variant="fieldset"` は Ingestion 専用で凍結する。** `IngestionPreviewForm` が default の `fieldset` を使い、`allowNestedPath`（`/` 区切りパス）・`legendSlot`（AI サジェストバッジ）・`allowExistingActions=false` を要求する。`fieldset` には移行を一切適用しない。

選択肢:
1. 単一 pill + カスタムツリードロップダウンを `variant="row"` に新規実装し、モックに完全一致させる（`fieldset` は据え置き）
2. `variant="row"` の佇まいだけ寄せ、2フィールド構造は維持して差分許容とする（#669 ADR-002 の継続）

### Decision
1 を選ぶ。決め手は2つ:
- **ユーザー判断:** 確認の結果、ユーザーがディレクトリ行の完全移行（モック完全準拠）を明示的に選択した。差分許容を続けると当該乖離が恒久化する。
- **モック完全準拠:** モック `.dir-row` は単一 pill トリガー + ツリードロップダウンが意匠の核であり、2フィールド常時表示では佇まいレベルでも一致しない。

`variant="row"` を、`Popover`（閉じ/フォーカス復帰/クランプの土台）+ 折りたたみツリー（`expanded` map）+ 検索 input + 選択ハイライト + 「新規ディレクトリを作成…」インライン作成導線からなる新コンポーネント `DirectoryTreeSelect`（仮）に置き換える。`DirectorySelectField` は `row` からは使われなくなる（`fieldset` 系・他サーフェスの利用は据え置き、本Issueでは削除しない）。

**a11y モデル（本 ADR で確定 / 「6bで確定」の先送りを廃止）:** WAI-ARIA「**combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox**」パターンを採用する。
- 検索 input に `role="combobox"` / `aria-expanded` / `aria-controls`（listbox の id）/ `aria-activedescendant`（現在ハイライト中の option id）を付け、**実フォーカスは常に検索 input に留める**。
- option 群（折りたたみツリー）は検索 input の**兄弟**として `role="listbox"` コンテナに置き、`role="option"` を並べる。combobox を listbox の子にはしない（`role="listbox"` の子は option/group のみという WAI-ARIA 制約を満たす）。
- ArrowUp/Down は `aria-activedescendant` を「可視 option フラット列」に沿って移動させる（DOM フォーカスは動かさない）。Enter で activedescendant の option を選択、Escape で閉じる。
- **`useRovingMenu`（実フォーカス roving = tabindex 移動）はこのドロップダウンには使わない。** これにより (1) 実フォーカス roving と `aria-activedescendant` 仮想フォーカスの2モデル衝突、(2) `role="listbox"` 直下に `combobox`/`textbox` を子として置く WAI-ARIA 不正、の双方を回避する。駆動の実装は `DirectorySelectField` / `NotePickerDialog` の自前 `activeIndex` + `aria-activedescendant` をリファレンスにする（`ViewSwitcher` の roving 方式は採らない）。
- 可視 option フラット列と `activeIndex` は折りたたみ/検索で可視数が変わるたびに一致・クランプさせる（ステップ6 の純粋関数で算出し vitest 検証）。

**ラベル文言:** ユーザー向け表記は**現行実装の SSOT「ディレクトリ」を維持**する（不用意な文言変更を避ける）。モックの英字 `DIRECTORY` は uppercase 体裁の参照であり日本語表記を変える根拠にしない。a11y ロール（`combobox`/`listbox`/`option`）は上記モデルに従い、モック HTML の `role` 記述には拘束されない。

新規実装の切り分け:
- **再利用（新規に書かない）:** `Popover` / `usePopover`（閉じる・フォーカス復帰・クランプ・外側クリック/Escape/Tab-out）、`FlatDirectory` データ、`pendingDirectoryName` 契約と Rename/Delete ダイアログ連携、`dirRowPillInput` 等の既存トークン utility。combobox+listbox の駆動は `DirectorySelectField` パターンを踏襲（部品としての import ではなく実装参照）。
- **新規に書く:** pill トリガー（フォルダーアイコン + 現在パス + キャレット、`aria-expanded`）、ドロップダウンパネル本体（`role="combobox"` 検索 input + その兄弟の `role="listbox"` 折りたたみツリー描画 + 選択 option + 区切り線 + 新規作成 option/インライン名入力）、`FlatDirectory` → 折りたたみツリー & 「可視 option フラット列」算出ロジック、`aria-activedescendant` 駆動の `activeIndex` 管理、検索フィルタ（query で `name`/`path` 部分一致、ヒット時は祖先を自動展開）。

2 はユーザー判断に反するため不採用。

**Rename/Delete ダイアログ連携:** `Popover` は非モーダル（フォーカストラップ無し）のため、選択行の Rename/Delete アクション押下時は `close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順序にする。消える option を `RenameDirectoryDialog` の `previousActiveRef` が掴まないようにするため。

**新規作成導線の扱い:** モック末尾の「新規ディレクトリを作成…」option を選ぶと、ドロップダウン内にインライン名入力（NoteEditor は単一名 / Ingestion 系は対象外）を出し、確定で `onSetPendingName(name)` を呼ぶ。既存選択と新規名は相互排他（既存 ADR-004 #363 の two-mode 契約を踏襲）で、`onSelectExisting(id)` 時は `pendingDirectoryName` を null に、`onSetPendingName(name)` 時は `directoryId` を null にする（呼び出し側が既に行っている排他を維持）。pill トリガーの表示は「選択中ディレクトリの `path`」/「新規: {name}」/「未選択（ディレクトリを選択）」を出し分ける。

### Consequences
- 良い点: モックの「単一 pill + ツリードロップダウン」意匠に完全一致。`Popover` 再利用で閉じる・フォーカス復帰・クランプの作り込みを最小化できる。a11y モデルを combobox+listbox に計画段階で確定したため、最難点（roving モデルの選択）の不確実性を実装前に解消できる。サーバー契約（`directoryId` / `pendingDirectoryName`）はそのままなのでバックエンド影響ゼロ。
- トレードオフ / リスク: 本Issue 中で最も工数が大きいステップ。`row` 専用の新ツリードロップダウン部品を新規に書くため退行リスク（既存選択の保存、新規作成、autosave 連携）がある。`DirectorySelectField` の検索/IME/`aria-activedescendant` 駆動を新部品で再現する必要がある（既存実装を参考にできるが移植コストはかかる。`useRovingMenu` は使わないため roving 配線の再利用はできない）。折りたたみ × `activeIndex` の整合（可視 option フラット列）の作り込みが必要。
- Ingestion 影響: `variant="fieldset"` は完全に据え置くため Ingestion は無変更。`DirectoryPicker` の props 契約（`onSelectExisting` / `onSetPendingName` / `pendingDirectoryName` / `allowExistingActions` / `allowNestedPath` / `legendSlot`）は変えず、`row` ブランチの内部実装だけを差し替える。両 variant が壊れないことをテストで担保する。

---

## ADR-004: 本文 editor body は border/rounded を撤去するが `p-4` と `focus-within` フォーカス表現は温存する

### Status
Proposed

### Context
モック `.editor` は `min-height` / `font-size` / `line-height` / `color` のみで border・rounded・padding を持たない原稿キャンバス。実装の `EditorContent`（WysiwygEditor.tsx:576）は `min-h-[480px] rounded-md border border-hairline bg-bg p-4 ... focus-within:border-accent focus-within:shadow-focus`。Issue ④ は border/rounded 撤去を求めるが、Issue 補足でフォーカス表現の刷新は #692 範囲と明記され「同一 wrapper を触るため連動に注意」とある。

選択肢（padding の扱い）:
- A: モック厳密準拠で `p-4` も撤去する
- B: `p-4` は残し、border/rounded のみ撤去する

選択肢（focus 表現）:
- C: `focus-within:border-accent focus-within:shadow-focus` も今回撤去/刷新する
- D: focus 表現は一切触らず温存する

### Decision
B + D を選ぶ。
- padding: `p-4` を残す（B）。モックは静的見本のため padding 0 でも成立するが、実エディターでは行頭クリック領域・キャレット余白・本文の読みやすさのため左右上下の内側余白が実用上必要。border を外しても `p-4` 維持で原稿キャンバスとしての佇まいは保てる。撤去は #692 のフォーカス/レイアウト再設計時に併せて再評価する。
- focus 表現: `focus-within:border-accent focus-within:shadow-focus` は #692 のスコープなので **温存し触らない**（D）。本Issueの変更は `rounded-md border border-hairline` の除去に厳密に限定する。これにより #692 着手時のコンフリクト/二重対応を避ける。

### Consequences
- 良い点: 受け入れ条件④（枠線撤去）を満たしつつ #692 との責務境界を明確に保つ。`p-4` 維持で編集体験の劣化を防ぐ。
- トレードオフ: border を外した状態で `focus-within:border-accent` が一時的に「枠のない要素に focus 時だけ枠が出る」挙動になる（#692 で caret-only 化されるまでの過渡的な見た目）。本Issue単体では許容し、#692 と連動して解消する。

---

## ADR-005: 実装段階で確定した補足判断（ADR-001〜004 の具体化）

### Status
Accepted（実装時に確定。ADR-001〜004 を実コードへ落とす過程の細部であり、上位 ADR の方針は変えない）

### Context
ADR-003 の「combobox + sibling listbox を `Popover` の上に構築する」「純粋ロジックを別モジュールに切り出す」を実コードに落とす際、`Popover` の API 形状・ファイル名の casing・キーボード非依存の展開操作・draft 確定の取りこぼしについて非自明な判断が必要になった。

### Decision
1. **`Popover` は `haspopup="dialog"` で使う。** `Popover` の `haspopup="listbox"` モードはパネル自身に `role="listbox"` を付けてしまい、ADR-003 が要求する「検索 input(combobox) と option 群(listbox) を**兄弟**に置く」構造（listbox 直下に combobox 子を置かない WAI-ARIA 制約）と両立しない。そこで `haspopup="dialog"`（パネルが汎用 `role="dialog"` コンテナ）を採用し、その内側に `role="combobox"` 検索 input と兄弟の `role="listbox"` を自前で描画する。`menu`/`listbox` 分岐に付く option 用 `onMouseDown` ガードが dialog 分岐には無いため、各 option/コントロールの `onMouseDown` で個別に `preventDefault()` してフォーカスを検索 input に保持する。

2. **純粋ロジックのファイル名は `directoryTreeModel.ts`。** 当初 `directoryTreeSelect.ts` としたがコンポーネント `DirectoryTreeSelect.tsx` と大文字小文字だけが異なり、case-insensitive FS で TS2305/TS1261 衝突。`directoryTreeModel.ts`（テストは `__tests__/directoryTreeModel.test.ts`）へ改名した。

3. **ツリー展開のキャレットは option `<button>` の入れ子ではなく兄弟 `<button>`。** option 行を `role="option"` の `<button>` にしているため、その内側に展開トグル `<button>` を入れると HTML 不正（button-in-button）になる。`relative` ラッパー内に「絶対配置のキャレット `<button>`（`aria-expanded`/`aria-label` 付き、展開のみ）」と「`role="option"` 本体 `<button>`（選択のみ）」を兄弟で並べ、本体に `aria-activedescendant` 用 id を振る。キーボードからの展開は検索フィルタの祖先自動展開で代替し、キャレットはポインタ操作のアフォーダンスに限定する。

4. **`TagsInput` は `ul`/`li` セマンティクス。** モックは `div[role=list]`/`span[role=listitem]` だが Biome の `useSemanticElements` が `ul`/`li` を要求するため、行を `<ul>`、各チップを `<li>`、末尾入力を `<li>` 包んだ `<input>` とした（`input` は `ul` 直下に置けないため `li` で包む）。見た目は flex のため変わらない。

5. **未確定 `tagDraft` の onBlur 確定。** `resolveTagNames` による submit/autosave 時の救済（ADR-001）に加え、`TagsInput` の入力 `onBlur` でも非空 draft を `onAddTag` 確定する。Enter を押さず別フィールドへ移った場合にチップが即座に確定し、画面表示と保存内容が一致する（reducer の `addTag` が冪等＝重複は無視なので二重確定は無害）。

### Consequences
- 良い点: ADR-003 の a11y モデル（combobox+兄弟 listbox・仮想フォーカス）を WAI-ARIA 制約・HTML 妥当性・Biome a11y ルールすべてを満たした形で実装できた。純粋ロジック（`visibleDirectoryOptions`/`searchMatchSet`/`clampActiveIndex`/`nextActiveIndex`）は vitest で独立検証済み。
- トレードオフ: `haspopup="dialog"` トリガーの `aria-haspopup` は厳密には "dialog" になる（combobox トリガーとしてはやや不正確）。ただし実フォーカスは開いた直後に検索 input(combobox) へ移り、以降の a11y セマンティクスは combobox+listbox が担うため実害は小さい。キャレット展開はキーボード単独では直接操作できない（検索の祖先自動展開で代替）。

---

## ADR-006: 本文枠線撤去（AC-5）は `WysiwygEditor` だけでなく `InlineEditor` にも適用する

### Status
Accepted（ブラウザ検証で発覚し修正）

### Context
Issue 本文・plan.md は AC-5（本文エディタの枠線撤去）の対象を `WysiwygEditor.tsx:576` と記述していた。しかし `EditorModeSwitch.tsx` のタブ→モードのマッピング上、**編集画面（surface="edit"）の「ビジュアル」タブが描画するのは `inline` モード = `InlineEditor`** であり、`WysiwygEditor`（`wysiwyg` モード）は新規作成画面（surface="new"）の「WYSIWYG」タブ専用。本Issueのモック対象は P12 = 編集画面なので、ユーザーが実際に編集時に見る本文は `InlineEditor`。`WysiwygEditor` だけを撤去しても編集画面では枠線・角丸が残り、ブラウザ検証 TC-body が FAIL した。

### Decision
AC-5 の「本文エディタのボーダーレス化」を、編集画面の実エディタ `InlineEditor.tsx`（`.note-detail-content` host）にも適用する。`WysiwygEditor` と同一の変更＝ `rounded-md border border-hairline` のみ撤去し、`p-4` / `min-h-[480px]` / `focus-within:border-accent focus-within:shadow-focus`（#692 範囲）は温存する。HTML モードの textarea（`HtmlEditor` の `fieldControl`）と `<details>` アコーディオンは本文キャンバスではなくフォームコントロールなので対象外（枠線を残す）。

### Consequences
- 良い点: 編集画面・新規画面の両ビジュアルエディタが一貫してボーダーレスな原稿キャンバスになり、モック `.editor` に揃う。
- トレードオフ: なし（同種の変更を取りこぼしていた箇所を揃えただけ）。Issue 本文の参照（WysiwygEditor のみ）が実際の編集画面の描画コンポーネントと食い違っていた点を本 ADR で明示する。
