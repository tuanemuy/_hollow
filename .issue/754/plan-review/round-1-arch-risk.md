# Plan Review — Issue #754（Round 1 / 視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/754/plan.md` / `.issue/754/adr.md`
レビュー観点: あるべきアーキテクチャ（CLAUDE.md「Styling」規約）との整合性、`Dialog` 再利用の実現可能性、デスクトップDOM温存とテストへの影響、JSX共通化と制約の両立、`useOptimistic`/`run()` の再利用、見落とされた依存・副作用・エッジケース。

---

## 総評

方針（ADR-001: 集約トリガー + 既存 `Dialog` ボトムシート / ADR-002: モック逸脱を ADR で追跡）は、実コードに照らして妥当かつ実現可能。`Dialog` がモバイルで実際にボトムシート化される挙動（`dialogBackdrop` の `items-end p-0 sm:items-center`、`dialog` の `rounded-t-lg sm:rounded-lg`、`dialogGrabber` の `hidden max-sm:block`）は実在し、フォーカストラップ・ESC・スクロールロック・トリガー復帰・`showCloseButton`/`closable` も完備で、計画の用途を満たす。`useOptimistic`/`run()` を所有者の `FilterBar` に置いたままハンドラだけシート内コントロールから呼ぶ構成も、現コードのハンドラ群（`toggleTag`/`selectPreset`/`updateDate`/`selectVisibility` 等）がすべて引数だけで完結しているため成立する。

一方で、計画には事実誤認（テスト環境）と、コアステップで顕在化する具体的リスク（ネスト Dialog、テストヘルパーの曖昧化、`hasAnyHomeFilter` との二重定義）が残っており、下記を修正・明記しないと Step 3/6 で手戻りが出る。

---

## 問題点（要修正）

- **[P-001]** 計画・ADR が一貫して「jsdom」と書いているが、`FilterBar.test.tsx` の実環境は **happy-dom**（1行目 `// @vitest-environment happy-dom`）。
  - 理由: plan の Step 5/6・リスク節・テスト方針、ADR-001 Consequences が「jsdom はメディアクエリ未評価」を前提に立論している。結論（メディアクエリ未評価で両UIがDOM共存しうる）は happy-dom でも同じだが、計画が依拠する前提エンジンを誤認したまま進めると、テスト挙動（happy-dom 固有の synthetic keydown 配送など。`NotePickerDialog.test.tsx:208` に注記あり）の見積もりがずれる。
  - 提案: 文言を happy-dom に統一し、「happy-dom もメディアクエリ（`window.matchMedia`）を実評価せず、`max-sm:` variant は CSS として効かないため両UIがDOMに共存する」と正確に書き直す。

- **[P-002]** ネストした `Dialog`（フィルターシート内から `NotePickerDialog` を開く）の挙動が未分析。
  - 理由: 計画 Step 3 は「内部リンク参照：既存 `NotePickerDialog` を開くボタン」をシート内に置く前提だが、`NotePickerDialog` 自体が `Dialog`（`app/components/note/list/NotePickerDialog.tsx:194`）であり、フィルターシート（`Dialog`）の中からさらに `Dialog` を開くと **2重のフォーカストラップ・2つの document-level ESC ハンドラ・2重のスクロールロック**が同時に立つ。`Dialog` の ESC ハンドラは `event.stopPropagation()` するが（`Dialog.tsx:255`）、両者とも `document.addEventListener("keydown")` で document に直付けのため、ESC 1回で「最後に登録されたリスナ＝NotePicker側」が閉じる挙動になるか、両方が閉じるかは登録順序依存になりうる。スクロールロックは module-scope カウンタ（`bodyScrollLockCount`）で多重対応済みなので実害は小さいが、フォーカストラップの入れ子は背後シートへフォーカスが漏れる/戻る経路が複雑。
  - 提案: シート内の「内部リンク参照」は (a) シートを一旦閉じてから `NotePickerDialog` を開く（同時表示しない・トリガー復帰を NotePicker→FilterBar の順に効かせる）、または (b) シート内では「適用中チップ + 解除」のみ提供し、新規選択はデスクトップ同様の経路に寄せる、のいずれかに方式を確定し ADR/plan に明記する。ネスト Dialog を許容するなら、ESC・初期/復帰フォーカスの期待挙動を Step 6 のテストで明示的に固定する。

- **[P-003]** 既存テストヘルパー `buttonByText` / `tagButton` がモバイルUI追加で曖昧化するリスクが、計画で「精査する」止まりで具体策が無い。
  - 理由: `buttonByText`（test 150-157）は **container 内の全 `button` を走査**し、テキスト前方一致で最初の1件を返す。`tagButton`（94-104）は `button[aria-pressed]` 全件走査。モバイルトリガーバー（`hidden max-sm:flex`）は happy-dom 上では常時 DOM 存在するため、(a) 「絞り込み」トリガーは既存テキストと衝突しないが件数バッジ等が `button[aria-pressed]` を持つと `tagButton` が誤検出しうる、(b) シートを `open` でマウントした瞬間にシート内の「期間」「公開状態」セクションのボタンが `buttonByText("期間")` 等と二重一致し、既存の DatePopover/VisibilityPopover テスト（`renderBarWith` 経由でシート未オープン）でも、もしモバイルトリガーバー側に同テキストの常設ラベルがあれば衝突する。
  - 提案: 「モバイルUIは常時DOM存在」を前提に、(1) モバイルトリガー/シート内コントロールに `data-*`（例 `data-mobile-filter` / `data-filter-sheet`）スコープを付け、新規テストはそのスコープに限定、(2) 既存テストが拾う要素はデスクトップラッパ（`filterBar` 配下）に限定する形で `buttonByText`/`tagButton` のクエリ起点を `filterBar` ラッパに絞れるよう、デスクトップラッパに識別可能な目印（`data-*` か既知クラス）を残す——を Step 6 の確定タスクとして記載する（「曖昧化したら直す」ではなく、衝突しない設計を先に固定）。

- **[P-004]** 適用中フィルター件数の算出を「`FilterBar` 内で導出」と「`listSelectors` に追加（任意）」の二択のまま放置しており、`hasAnyHomeFilter`（`listSelectors.ts:538`）との二重定義リスクが残る。
  - 理由: 件数判定（タグ数 + 期間有無 + 公開有無 + 参照有無 + dangling ディレクトリ有無）は `hasAnyHomeFilter` および `FilterBar` 内 `hasAnyFilter`（FilterBar.tsx:297-302）と**同一の材料**を使う。3箇所目の独立実装を生むと、フィルター種別が増えたとき判定が乖離する（CLAUDE.md「make illegal states unrepresentable / 判定の単一情報源」の精神に反する）。なお `hasAnyHomeFilter` は `search`（サーバ確定値）を入力に取るのに対し、件数は **楽観的値 `optimistic` を正にしたい**ため、`hasAnyHomeFilter` をそのまま件数化に流用はできない点も整理が必要。
  - 提案: `FilterBar` 内 `hasAnyFilter` の算出に使っている `optimistic` 由来の各 boolean/size を1つの「件数導出ヘルパー（純粋関数, optimistic 値を引数に取る）」へ集約し、`hasAnyFilter = count > 0` で導出するように一本化する。`listSelectors` へ出すか否かは「`search` ベースの `hasAnyHomeFilter` とは入力が違う（optimistic vs search）」ことを根拠に決め、二重定義しない方針を明記する。

---

## 改善提案（検討推奨）

- **[S-001]** デスクトップDOM不変の検証を「目視 + 既存テスト無改変パス」だけに頼らず、機械的に固定する。
  - 理由: AC-4（`sm` 以上で DOM/クラス/挙動が完全同一）は本Issueの厳格制約。「ラッパに `max-sm:hidden` を足すだけ」でも、ラッパ要素の追加・既存 `filterBar` クラス文字列の変更はテストの `cls).toContain(...)`（test 503-516）や `compareDocumentPosition`（460-467）に影響しうる。snapshot ではなく、既存の DOM 構造アサーション（ghost chip の前後関係、`popoverSheetPanel` 由来クラス）が無改変で通ることを Step 5 のチェックリストに列挙しておくと回帰検出が確実。

- **[S-002]** 期間フォーム / 公開状態リストの JSX 共通化は「中身を変えずに包む」ではなく「**presentational な内側 JSX を props 駆動の純コンポーネントに切り出し、デスクトップ Popover とモバイルシートの双方から同一コンポーネントを描画**」する方向を推奨。
  - 理由: 現状 `DatePopover`/`VisibilityPopover` は「トリガー（chip/ghost）+ Popover シェル + 内側コントロール」が一体。デスクトップDOMを変えずに共通化するには、`Popover` シェルやトリガーは触らず、**内側のプレゼンテーション部分のみ**（プリセットグリッド `grid grid-cols-3` + 日付 input 行、VISIBILITY の `menuitemradio` 群）を子コンポーネント化し、デスクトップは従来どおり `Popover` の children に、モバイルはシート内に同じ子を置く。これなら「デスクトップDOMが変わる」リスクを内側に閉じ込められ、P-003 のテストスコープ分離とも整合する。ただし `menuitemradio`/`useRovingMenu`/`role="menu"` の a11y 文脈はモバイルシート内では `Dialog` 配下になり意味づけが変わる点（menu はメニューバー/ポップアップ文脈前提）に注意——シート内はラジオ群（`role="radiogroup"` + `radio`）か単純なボタン群に置き換える判断を ADR に残すと良い。

- **[S-003]** ADR-001 のシート内コントロールの a11y 設計（ロール）が未定。
  - 理由: デスクトップは `role="listbox"`（タグ）/ `role="menu" + menuitemradio`（公開状態）/ `role="dialog"`（期間 Popover）を使うが、これらは「フローティングポップアップ」を前提にしたロール。`Dialog`（`aria-modal` 済み）の中にさらに `role="menu"` を入れ子にするのは APG 的に不自然。シート内は素直なフォーム要素（チェックボックス/ラジオ/ネイティブ date input + トグルボタン）で組む方が堅い。ADR-001 に「シート内ロールはデスクトップと別系統（フォーム/トグル）」を明記すると Step 3 の迷いが減る。

- **[S-004]** `scrollbarHidden` の import 整理（plan リスク節に既出）は、`styles.ts` で `filterBar` 以外に未使用かを事前確認しておく。
  - 理由: `app/components/note/list/styles.ts` 内の `scrollbarHidden` 利用箇所は現状 `filterBar` の1箇所のみ（4行目 import）。撤去後は import ごと削除しないと Biome の未使用 import で lint 落ちする。`common/styles.ts` 側の定数自体は BulkActionBar 等が使うため残す——この区別は plan に書かれているが、`styles.ts` 側 import 削除を Step 2 の明示タスクにすると漏れない。

- **[S-005]** ディレクトリ・フォールバックチップとモバイル集約トリガーバーの **縦並び**で AC-3（縦スペース現状以下）を割らないか、レイアウトを明示。
  - 理由: フォールバックチップは現状「`filterBar` の外・`mb-5` の別 `<div>`」（FilterBar.tsx:444-458）。モバイルでトリガーバー（1行）+ フォールバックチップ別行（稀ケース）だと最大2行になる。稀ケースなので許容で良いが、トリガーバーとフォールバックチップを同一行に並べる（`flex` でラップ）か別行かを Step 3 で確定し、AC-3 の「現状の横スクロール1行と同等以下」を満たす配置を図示しておくと手戻りが減る。

- **[S-006]** `aria-busy`（`filterBar` の `aria-busy={isPending}`, FilterBar.tsx:314）がデスクトップラッパに付いている点の引き継ぎ。
  - 理由: デスクトップラッパを `max-sm:hidden` にすると、モバイルでは `aria-busy` を持つ要素が非表示になる。モバイルのトリガー/シートにも pending 表現（`aria-busy` か視覚的 pending）を引き継ぐか、不要と判断するかを明記。フィルター適用中の状態フィードバックがモバイルで欠落しないようにする。

---

## 良い点

- `Dialog` の「モバイル=ボトムシート」挙動が**実コードで実在**することを正しく前提化できている（`dialogBackdrop`/`dialog`/`dialogGrabber` の `max-sm:` variant、`#587 ADR-001`/`#588`）。新 primitive を発明せず既存資産を再利用する CLAUDE.md / Issue 指示に忠実。
- `useOptimistic`/`run()`/各ハンドラを `FilterBar` 本体に残し、シート内コントロールはハンドラを呼ぶだけ、という所有権設計が現コード（ハンドラが引数だけで完結・`run` が `applyOptimistic` + `router.navigate` を内包）と整合し、ナビゲーション/楽観的更新ロジックを一切触らずに実現可能。実現可能性の評価が妥当。
- AC-4（デスクトップ不変）を最重要制約として繰り返し明示し、「既存 JSX を温存しラッパに `max-sm:hidden` を足すだけ」「抽出は中身を変えずに包む範囲」と制約条件を具体化できている。CLAUDE.md の utility-first・`max-sm:` 静的 variant 分岐・文字列ホイスト・JSDoc 更新・ADR 参照という Styling 規約に正しく沿っている。
- ADR-002 で「モック（`spec/design/` SSOT）からの意図的逸脱」を明示し、`#749 ADR-001` の前提更新と spec 同期をスコープ外として切り出した判断が、プロジェクトの SSOT 規約・追跡可能性の方針に適合。
- スコープの「含まれないもの」（URL search / `homeSearchUpdater` / `reduceFilters` / ドメイン・ユースケース不変）が明確で、提示層に閉じた変更であることが正しく言語化されている。
