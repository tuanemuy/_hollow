# ADR — Issue #669: エディター画面（P12）がデザインモックと不一致 ＋ 編集中にフォーカスが外れる

## ADR-001: タグ入力はモックのチップUIに寄せず、カンマ区切りシンプル入力を踏襲する（差分許容）

### Status
Proposed

### Context
モック `P12-editor.html` のタグ行は `.tag-chip`（高さ26px・pill・個別削除「×」付き）+ 末尾の `.tag-input` というチップUI。実装は `parseTagInput`（カンマ区切りテキスト）による単一テキスト入力で、Issue 本文によれば過去にシンプル入力とする判断があった（本文は「#233 ADR-003」を引くが、実際の `.issue/233/adr.md` ADR-003 は MutationObserver ロールバック方式の ADR であり引用はズレている。ただしシンプル入力が確立済みの実装・挙動であることはコードから確認できる）。

選択肢:
1. モック準拠のチップUIを実装する（state 構造・編集挙動・a11y の作り込みが必要）
2. 挙動はそのまま、見た目だけチップ風に装飾する
3. シンプル入力を踏襲し、モックとの差分を意図的なものとして記録する

### Decision
3 を選ぶ。チップUIの実装はタグの追加・削除・IME 確定・フォーカス管理など本 Issue（デザイン整合 + フォーカス喪失修正）のスコープを大きく超える。2 の「見せかけチップ」は、実際の編集モデル（1つのテキスト値）と見た目（個別操作できそうなチップ）が乖離し誤操作を招くため最も悪い。余白（モック `.tags-row` の `margin-bottom: var(--space-5)` 相当）のみモックに合わせる。

チップUI化が必要になった場合は、編集 state（`tagInput: string` → `tagNames: string[]` + 入力中バッファ）の再設計を伴う独立 Issue として起票する。

### Consequences
- 良い点: 確立済みの挙動・autosave スナップショット・テストを壊さない。本 Issue のスコープが UI スタイルと invalidate 修正に収まる
- トレードオフ: P12 モックとの視覚差分が残る（本 ADR を spec 側の差分根拠として参照する）

---

## ADR-002: ディレクトリ行のモック準拠は `DirectoryPicker` の `variant` opt-in で実現する

### Status
Proposed

### Context
モックのディレクトリ行は `.dir-row` + `.dir-pill`（コンパクトな1行・pill トリガー・ドロップダウンツリー）。実装の `DirectoryPicker` は `fieldset` + 共通 `field` スタイルの重い枠で見た目が別物。ただし `DirectoryPicker` は `IngestionPreviewForm` とも共用されており（`legendSlot` / `allowExistingActions` / `allowNestedPath` で分岐済み）、機能面（検索付き選択・リネーム・削除・新規名入力）はモックの機能スーパーセット。

選択肢:
1. エディター専用のディレクトリ行コンポーネントを新設し、`DirectoryPicker` から分離する
2. `DirectoryPicker` に表示 variant（`"fieldset" | "row"`）を追加し、NoteEditor のみ `"row"` を使う
3. `DirectoryPicker` 全体をモック寄りに restyle し、Ingestion 側も巻き込む

### Decision
2 を選ぶ。既に props ベースの利用面分岐（ADR-007 of #363 等）が確立しているコンポーネントであり、機能ロジック（pendingDirectoryName 契約・ダイアログ）を複製する 1 は重複を生む。3 は Ingestion 画面のデザイン検証がスコープ外で退行リスクだけが増える。variant は見た目（コンテナ・ラベル・余白・pill 形状）のみを切り替え、機能と a11y 構造は共通に保つ。

なお、モックの `.dir-dropdown`（カスタムツリードロップダウン）の完全再現はしない。既存 `DirectorySelectField` が同等機能（検索付き選択）を提供しており、ドロップダウンの内装再現は本 Issue の受け入れ条件（「ディレクトリ行」の見た目一致）を超える。

### Consequences
- 良い点: Ingestion 側の見た目を凍結したままエディター行をモックへ寄せられる。機能ロジックは1実装のまま
- トレードオフ: `DirectoryPicker` の props が1つ増える。ドロップダウン内装はモックと完全一致しない（行の佇まいレベルの一致）

---

## ADR-003: エディター系ルートの invalidate 除外は `routerInvalidate` ラッパーの不変条件として実装する

### Status
Proposed（Issue #669 コメントで方針合意済み — 本 ADR はその記録）

### Context
編集中のフォーカス喪失は「mutation 完了時の `routerInvalidate(router)` → edit ルート（`staleTime: 0`）の loader 再実行 → RSC ツリー差し替えでエディター再初期化」の連鎖で発生する。本命経路は AppShell 常駐 `UploadDialogMount`（`UploadDialog.tsx:452,887`）。

選択肢:
1. 各呼び出し側（UploadDialog 等）で edit ルートを除外する filter を渡す
2. `routerInvalidate` ラッパー側でエディター系ルート（`/_app/notes/$noteId/edit`, `/_app/notes/new`）を `_app` 同様に常時除外する
3. edit ルートの `staleTime` を変更する / NoteEditor 側のみで防御する

### Decision
2 を選ぶ。edit/new ルートの loader はフォーム初期値の seed 専用で、マウント後の source of truth はエディターのローカル state（`useReducer`）。loader 再実行は「無視される」か「編集中 state を破壊する」かのどちらかで恩恵がなく、アンマウント中は `staleTime: 0` により次回進入時に必ず fresh load されるためキャッシュ腐敗も起きない。つまり「エディタールートを invalidate する正当なケースが構造的に存在しない」ため、呼び出し側ごとの判断（1）ではなく不変条件としてラッパー1箇所（2）で表現する。これは `_app` 除外を集約した #293 ADR-010 と同型の設計。

3 の `staleTime` 変更は「再進入時に必ず fresh load」という望ましい性質を壊す。NoteEditor 側の seed-once pin は併用するが、これは「将来の props 再同期コード混入」への退行防止であり、生の `router.invalidate()`（3ルール例外）による RSC ツリー差し替え＝再マウントに対する防御にはならない。

**既知の残課題（本 Issue スコープ外）:** エディター内から開ける `RenameDirectoryDialog` / `DeleteDirectoryDialog` は rule 2 の生 `router.invalidate()` を呼ぶため、編集中にディレクトリをリネーム/削除すると edit ルートの RSC loader が再実行され、未保存の編集内容が失われる経路が本修正後も残る。発生にはユーザーの明示的なダイアログ操作が必要で、本命経路（AppShell 常駐 UploadDialog の自動 invalidate）とは頻度・性質が異なるため、対策（ダイアログ側 invalidate のエディター除外等）は本 Issue では行わず、手動検証で現状を記録したうえで必要なら後続 Issue とする。

### Consequences
- 良い点: 全 mutation 経路（約25ファイル）を変更せずに本命経路を断てる。routeId のリネーム追従が1ファイルで済む。「invalidate = 表示系ルートの再評価」という意味論が明文化される
- トレードオフ: ラッパーがエディタールートの routeId 文字列を知る（ルートファイル移動時に追従が必要 — テストで pin する）。生の `router.invalidate()`（auth / directory / displayName の3ルール例外）はラッパーを通らないため、rule 2 経由の編集内容喪失経路が残る（上記・既知の残課題）
- ラッパーはエディター loader が供給する補助表示データ（`DirectoryPicker` の `tree` 等）も併せて凍結する。エディター滞在中は他経路の mutation でディレクトリが増減してもピッカーの選択肢は再進入まで更新されない（エディター内の rename/delete ダイアログは rule 2 の生 invalidate なので追従する）。loader を「seed 専用」前提で拡張する際はこの凍結に注意

### 実測による前提の補正（TC-009, PR #676 Round 1 N-001）
本 ADR と plan は「生の `router.invalidate()` → RSC ツリー差し替え = エディター再マウント → 未保存編集の喪失」を前提としたが、TC-009 の実測では rule 2 の生 invalidate（編集中のディレクトリ rename）後も未保存の編集内容が維持された。loader 再実行が同一コンポーネントインスタンスへの props 更新で済み、seed-once（lazy `useReducer` initializer）が実際に効いたためと考えられる。前提より良い方向の乖離であり、「既知の残課題」（rule 2 経由の編集内容喪失）は実測上は再現していない。後続 Issue の要否はこの実測を踏まえて判断すること（現時点では起票不要と判断）。

---

## ADR-004: ツールバーは wrapper 分離せず単一要素で sticky + モバイル横スクロールを両立する

### コンテキスト
plan ステップ3は「`sticky` と `overflow-x-auto` が同一要素で両立しない場合は sticky wrapper + pill 本体の2要素構成にする」としていた。CSS 仕様上、sticky が無効になるのは **祖先** に overflow を持つスクロールコンテナがある場合で、sticky 要素自身が overflow を持つことは問題にならない。

### 決定内容
`editorToolbar` は単一要素のまま `sticky top-[calc(var(--header-height)+var(--space-2))] z-20` を付与し、`sm` 以上は `inline-flex flex-wrap self-start`（pill の shrink-to-fit）、`max-sm` は `self-stretch flex-nowrap overflow-x-auto`（既存 #522 系の横スクロールレール）に切り替える。

### 理由
wrapper 分離は要素数と sticky 解除時のレイアウトシフト懸念を増やすだけで、単一要素で仕様上問題なく両立できるため。flex 列内で `inline-flex` 子は stretch されるので、pill の見た目には `self-start` が必須（モバイルではレール幅確保のため `self-stretch` に戻す）。

## ADR-005: HtmlEditor の textarea は共通 `fieldTextarea` を参照せず utility を直書きする

### コンテキスト
plan ステップ7は「textarea に editor 固有の `min-h-[480px]` を追加（共通 `fieldTextarea` は変更しない）」。しかし `fieldTextarea` 自体が `min-h-[320px]` を含むため、`${fieldTextarea} min-h-[480px]` の併記は同一プロパティの Tailwind ユーティリティ競合になり、勝敗が CSS 出力順依存で非決定的。

### 決定内容
HtmlEditor の textarea は `fieldTextarea` の参照をやめ、`font-mono text-mono min-h-[480px] resize-y` を直書きする（`fieldControl` は引き続き使用）。共通 `fieldTextarea` は変更しない。

### 理由
`!` important 修飾で上書きするより、競合を発生させない構成のほうが明確。重複は utility 3個分で、editor 固有値であることが className 上で自明になる。

## ADR-006: form の `gap-4` 撤去に伴い、間隔は各構成要素の margin に移譲する

### コンテキスト
plan ステップ4の余白戦略（gap をやめ各行 `mb-*`）を適用すると、`mb-*` 指定のない form 直下の子（EditLockBanner・各モードエディター・FrontMatterEditor・エラー表示）の間隔が消える。

### 決定内容
EditLockBanner に `mb-4`、submit エラー `<p>` に `mt-4` を追加。WysiwygEditor 内部の `gap-3` 列は廃止し unsupported バナーに `mb-3`、ツールバーは `mb-4`（モック値）。3モードエディターの wrapper `mt-4` は撤去し、直前要素（tags 行 `mb-5`）の margin に一本化。FrontMatterEditor は既存の root `mt-4` をそのまま利用。MediaUploader の `mt-4` は維持。

### 理由
モックは行ごとの margin で間隔を定義しており、gap と margin の二重管理を残すと値の出所が不明瞭になる。間隔の SSOT を「各行の margin」に統一する。

## ADR-007: InlineEditor の DOM ライフサイクルをマウント effect と value リシンク effect に分離する

### コンテキスト
TC-007（inline モードでキー入力後にフォーカスが BODY へ落ちる）の原因は、DOM ライフサイクル effect が `[value]` 依存で、cleanup 末尾の `host.replaceChildren()` が effect 再実行前にホストを空にするため、self-emit ガードの `host.childNodes.length > 0` 条件が常に偽になり、自身の emit が round-trip するたびに DOM 全再構築が走ることだった（`.issue/669/manual-test/results/analysis.md`）。ガード条件だけ直すと cleanup で外したリスナー・observer が再登録されず編集不能になるため、effect の構造ごと直す必要があった。

### 決定内容
ホスト `<section>` 要素は value 変更をまたいで安定であることを利用し、(1) リスナー登録・MutationObserver 生成・`rebuild(nextValue)` 関数（ref 経由で公開）を持つマウント専用 effect（`[]` 依存）と、(2) `value !== lastEmittedHtmlRef.current` のときだけ `rebuild` を呼ぶリシンク専用 effect（`[value]` 依存）に分離した。`lastEmittedHtmlRef` は `null` 初期化（初回マウントで必ずビルド）とし、マウント effect の cleanup で `null` に戻す（StrictMode 再マウントで self-emit と誤判定して空ホストになるのを防ぐ）。`rebuild` の失敗パス（parse 失敗・空 body）でも observer を再 observe して以後の状態を一貫させる。

### 理由
リスナーはホスト要素に付くため value リシンクで再登録する必要がなく、分離により self-emit round-trip で live DOM（＝フォーカス・キャレット）が一切触られなくなる。外部由来の value 変更（モード切替・別ノート遷移・メディア挿入）は従来どおり `rebuild` で全再構築されるので invariant 5（External value sync）は維持される。observer を ref 化して cleanup をスキップする代替案は「どの cleanup を走らせないか」の条件分岐が増え、React の effect セマンティクスに反する形になるため不採用。
