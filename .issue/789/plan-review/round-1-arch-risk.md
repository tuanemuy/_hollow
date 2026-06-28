# Plan Review — Issue #789 (Round 1: アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## 総評

計画は**アーキテクチャ的に非常に良く整っている**。内側（reducer/ドメイン/ユースケース/アダプター）を一切変えず、フロントのみで完結させる方針、transient UI state をローカル `useState` に閉じる（ADR-001）、`TagName.create` をバリデーションの SSOT として参照する（ADR-002）、`aria-activedescendant` 方式（ADR-003）はいずれも既存の確立パターン（`DirectoryTreeSelect` / `NoteEditor` の `pendingWysiwygSwitch`）と CLAUDE.md の規約（検証は 2 境界のみが権威・UI はプレビュー）に正確に沿っている。スタイリングも既存トークン（`border-hairline`/`bg-bg`/`shadow-focus`/`accent`/`text-error`/`accent-surface`）の再利用のみで、新規 CSS/@apply を増やさない。純粋ヘルパ（`tagSuggestModel`）を切り出してテスト可能にし、`clampActiveIndex`/`nextActiveIndex` をコピーせず再利用する点も DRY で好ましい。

一方で、**インライン combobox 特有の「draft 自体が確定値」という性質**を `DirectoryTreeSelect`（draft は検索フィルタにすぎない）からそのまま流用すると破綻する箇所が 1 点あり、これは要修正。フォーカスリングの二重化も実装どおりに作ると視覚的欠陥になる。

## 検証した事実（コード照合）

- `TagsInput` コンポーネントを描画するのは `NoteEditor`（editor）のみ。`NoteEditor` の利用元は `new.tsx` / `edit.tsx` の 2 ルートのみ。`IngestionPreviewForm` は `TagsInput` を**使わず**独自の `<input>`＋`parseTagInput` でタグを扱う（`app/components/ingestion/IngestionPreviewForm.tsx:33,162,310`）。→ 計画のリスク「IngestionPreviewForm 等が別経路で使っていないか」は実質ノーリスク。`tagSuggestions` 任意化の後方互換策は依然妥当。
- `edit.tsx` は既に `tags`（`loadAllTags` 結果）をスコープに持ち `tags.byId` を使用済み（L37-40）。`tagSuggestions` 配線は容易。`new.tsx` は `loadAllTags` を呼ぶが結果を `[tree]` で捨てている（L23-30）→ 計画どおり捕捉が必要。
- トークンは全て実在を確認: `--shadow-focus: 0 0 0 2px var(--color-accent)`（tokens.css:122）、`--color-error`（:26）、`--color-accent-surface`（:6）、`border-hairline`/`bg-bg` 等。
- グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css:175-179）が**全フォーカス要素に効く**。`titleInput` だけが `focus-visible:shadow-none` で打ち消している。現 `tagInputControl` は打ち消していない（styles.ts:106）。
- reducer の `addTag`→`parseTagInput` は trim のみで、**NFKC 正規化も `#` 除去も長さ検証も行わない**（editorState.ts / valueObject.ts 照合）。確定済み `tagNames` は生の文字列であり得る。

---

## 問題点（要修正）

- **[P-001]** `activeIndex` を draft 変化のたびに 0 へ再アンカーする方式（DirectoryTreeSelect と同型）は、インライン combobox では「新規タグ作成（draft 自体の commit）」を Enter で行えなくする。
  - 理由: 計画 Step 3 は「draft 変化で activeIndex を 0 に再アンカー」かつ「active 候補があり Enter のときは候補名を `onAddTag`、それ以外は draft を `onAddTag`」としている。両者を合わせると、**部分一致する既存タグが 1 件でもあれば常に index 0 が active になり、Enter は必ず候補をコミットして draft はコミットされない**。例: 既存タグ `foobarbaz` がある状態で新規タグ `foobar` を打って Enter すると、`foobar` ではなく `foobarbaz` が入ってしまう。`DirectoryTreeSelect` はそもそも検索入力（draft は値ではない）なのでこの問題が起きないが、`TagsInput` の draft は確定値そのものなので前提が異なる。これは AC-9（Enter の既存挙動保持）と新規タグ作成 UX を壊す。
  - 提案: 次のいずれかを採る。(a) **初期 activeIndex を -1（無アクティブ）**にし、ユーザーが ↑↓ を押して初めて候補がアクティブになる。Enter は「明示的にナビゲートした候補があればそれを、なければ draft を」コミットする（多くのタグ入力 UI の標準挙動）。(b) **「新規作成」行を候補リストの先頭に置き、それを既定の active** にする（classifyDraft が new のとき）。これなら既定 Enter は新規 draft を commit し、↑↓ で既存候補へ移れる。いずれにせよ「再アンカー先を 0（＝先頭の既存候補）にする」を無条件採用しないこと。ADR-003 の Consequences かプランにこの相違（DirectoryTreeSelect と activeIndex 初期値の扱いが異なる理由）を明記する。

- **[P-002]** コンテナの `focus-within:shadow-focus` と、入力要素自身に効くグローバル `:focus-visible` の box-shadow が二重リングになる。
  - 理由: グローバル `:focus-visible`（index.css:176）は全フォーカス要素に `box-shadow: var(--shadow-focus)` を付与する。計画は `tagsRow` コンテナに `focus-within:shadow-focus` を足すが、内側 `<input>` がフォーカスされると input 自身にもグローバルのリングが出る。`tagInputControl` は現状 `focus-visible:shadow-none` を持たない（`outline-none` だけでは box-shadow は消えない）。結果、コンテナ枠とその内側 input の二重リングになり AC-1 の「フォーカス状態が視覚的に分かる」を汚す。
  - 提案: `tagInputControl` に `titleInput` と同じく `focus-visible:shadow-none` を追加し、リングはコンテナの `focus-within` 側に一本化する（caret は `caret-accent` 等で補ってよい）。styles.ts の該当 JSDoc にも「リングはコンテナが担うため input 自身のグローバルリングは打ち消す」と理由を残すと一貫する。

---

## 改善提案（検討推奨）

- **[S-001]** `validateTagDraft` の「カンマ区切りの最後のトークンを評価」方針と、commit 時 reducer が全トークンを取り込む挙動が食い違う。
  - 理由: Enter/blur は draft 全体を `onAddTag` に渡し、reducer の `parseTagInput` がカンマ分割して**各トークンを長さ検証なしで chip 化**する。`validateTagDraft` が最後のトークンしか見ないと、ペースト等で「先頭に 50 文字超の不正トークン＋末尾に正常トークン」が来た場合、最後が valid なら commit が通り不正タグが chip に入る（即時抑止できない）。権威ある検証は保存時に残るので致命的ではないが、AC-6「不正 draft の commit 抑止」を厳密には満たさない。
  - 提案: `validateTagDraft` を「parseTagInput で分割した**全トークン**を検証し、1 つでも不正なら invalid」とするか、計画に「マルチトークン（カンマ含む）draft は最後のトークンのみ即時検証し、残りは保存時検証に委ねる」と明示してスコープを限定する。テストでこの境界（カンマ＋不正トークン）も固定する。

- **[S-002]** 候補の除外・マッチングは、確定済み `tagNames`（生文字列）と候補名（DB 正規化済み）の双方を同じ規則で正規化してから比較する必要がある。
  - 理由: reducer の `tagNames` は trim のみで NFKC/`#` 除去がされていないため、`#Foo` や全角を含む生の値があり得る。`filterTagSuggestions` の「committed 除外」を素の文字列等価で行うと、候補側（正規化済み）と一致せず除外漏れ・重複表示が起きる。計画は「マッチは NFKC 後 case-insensitive」と書くが、**除外（committed）側にも同じ正規化を適用する**ことを明記したい。
  - 提案: `filterTagSuggestions`/`classifyDraft` 内で committed と candidate の両方を `TagName.create` で正規化（不正な committed は try/catch でスキップ）するか、共通の正規化ヘルパを通してから Set 比較する。`tagSuggestModel.test.ts` に「`#Foo` 確定済みが `Foo` 候補を除外する」ケースを加える。

- **[S-003]** 空 draft では inline エラー（NameEmpty 由来）を表示しないことを明記する。
  - 理由: `TagName.create("")` は `NameEmpty` を投げるが、空入力欄に「タグ名を入力してください」を常時出すのはノイズ。計画は「空 draft は no-op」とするので、`validateTagDraft("")` は `null`（エラー無し）を返す扱いにすべき。
  - 提案: `validateTagDraft` は trim 後空なら `null` を返す、と仕様を明記。`classifyDraft` の "empty" と整合させる。

- **[S-004]** 候補パネルを `Popover` でなく手書きの絶対配置 div にする選択のトレードオフを明記する。
  - 理由: `DirectoryTreeSelect` は `Popover`（外側クリックで閉じる・viewport クランプ・focus 管理）を使うが、本計画は `tagsRow` を `relative` にして絶対配置パネルを直接置き、クローズは blur/Escape に依存する。インライン combobox では入力にフォーカスが残る設計なので blur クローズで概ね成立するが、(1) パネル表示中のスクロール追従や小幅 viewport でのはみ出し、(2) パネル内クリック以外での外側クリッククローズ、を自前で担保する必要がある。`dirDropdownPanel` の `max-sm` 全幅化は踏襲できるが、`clampToViewport` 相当は付かない。
  - 提案: 「Popover を使わない理由（入力にフォーカスを残すインライン combobox なので blur+Escape で閉じれば足り、focus-trap/別レイヤ管理が不要）」をプランに 1 行で明記。モバイルでのパネルはみ出しは `dirDropdownPanel` の `max-sm` 規則で吸収できることを確認しておく。

- **[S-005]** テスト DOM 構造の刷新点（`ul/li`→`div`、入力 `aria-label`）の移行を、退行ではなく意図的変更として既存テスト側で具体的に置換する旨を明記。
  - 理由: 既存 `TagsInput.test.tsx` は `querySelectorAll("li")` の件数と `input[aria-label="新規タグ"]` に依存（test:86, 67）。計画は構造刷新を認識済みだが、`getInput()` のセレクタ（aria-label）を変える場合は全アサーションの参照点がずれる。
  - 提案: 入力の `aria-label` を据え置く（例: `新規タグ` のまま）か、変更するならテストの取得関数とセレクタを一括更新する旨を Step 6 に具体化。コンテナの `aria-label="タグ"` 移設先（`role="group"` か listbox の `aria-label`）も明記。

## 良い点

- 内側レイヤー無改修・フロント完結の方針が明確で、ドメイン/ユースケース/アダプター「なし」を各節で言い切っている。レイヤー依存方向を一切侵さない。
- ADR-001/002/003 がいずれも既存の確立パターンと CLAUDE.md 規約に正確に接地している（transient state のローカル化、検証 SSOT としての `TagName`、activedescendant 方式）。トレードオフ記述も具体的。
- **IME と矢印キーの競合**を最重要リスクとして自力で特定し、「`DirectoryTreeSelect` は Enter のみガードだが本件は矢印もガードが必要」と既存実装の差分まで正しく見抜いている。
- **blur と option クリックの競合**を `onMouseDown preventDefault` で回避する既存定石を踏襲。
- スタイリングが既存トークン・既存クラス定数（`dirDropdownPanel`/`dirTreeItem`/`dirTreeItemNew`）の再利用に閉じ、新規 CSS/@apply ゼロ。`data-[active]` 等の data-* 規約も踏襲。
- 純粋ヘルパ `tagSuggestModel` を切り出して単体テスト可能にし、`clampActiveIndex`/`nextActiveIndex` をコピーせず再利用。
- AC を検証可能な表形式にし、各 AC に対応ステップを紐付け。`new.tsx` の「将来の autocomplete 用」コメントを実配線へ更新する点まで拾えている。
- autosave がタグを送らない不変条件を「`saveDraft`/`useAutosave` を一切触らない」ことで構造的に担保している（誤って snapshot 経路を変えない注意も明記）。
