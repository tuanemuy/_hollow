# 実装計画 — Issue #789: ノート編集画面のタグ入力(tag input)の見た目と入力方法を改善する

**Issue:** #789
**作成日:** 2026-06-28
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面（P12）のタグ入力 `TagsInput` を、まとまったコンテナ枠＋フォーカス可視化の「見た目」と、`loadAllTags` を供給源にした候補ドロップダウン（combobox/listbox）＋キーボードナビゲーション＋入力時バリデーションの「入力方法」の 2 軸で刷新する。既存の reducer/controlled-view 構造・IME 対応・autosave 挙動は壊さない。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | chip + input が 1 つのコンテナ枠で囲まれ、input フォーカス時にフォーカスリング（境界の視覚変化）が出る | Issue 受け入れ条件 1 | 2, 3 |
| AC-2 | タグ未入力時にガイド（placeholder/空状態文言）が表示される。各 chip は明示的な × 削除ボタン（`aria-label="タグ「{name}」を削除"` 等）を持ち、hover/focus-visible でコントラストが変化し、最小ヒット領域を確保している | Issue 受け入れ条件 2 | 2, 3 |
| AC-3 | `loadAllTags` の結果を供給源に、既存タグ候補のドロップダウンが入力中に表示される（未確定 chip を除外） | Issue 受け入れ条件 3 | 1, 3, 4, 5 |
| AC-4 | 候補を ↑↓ で移動し Enter で確定できる（active 候補があれば draft ではなく候補を commit） | Issue 受け入れ条件 4 | 1, 3 |
| AC-5 | 入力中に「既存タグ一致」と「新規タグ作成」が視覚的に区別できる表示がある | Issue 受け入れ条件 5 | 1, 3 |
| AC-6 | 50 文字超・空白/不正文字などのバリデーション違反が入力時に UI 上で即時表示され、その draft の commit が抑止される | Issue 受け入れ条件 6 | 1, 3 |
| AC-7 | input が `role="combobox"`（aria-autocomplete/aria-expanded/aria-controls/aria-activedescendant）、候補リストが `role="listbox"`+`role="option"` を満たし、実フォーカスは input に留めた activedescendant 方式でキーボード操作できる | Issue 受け入れ条件 7 | 1, 3（ARIA 属性付与＝ステップ 3／キーボードナビの index 取り回し＝新ヘルパ `clampSuggestIndex`/`nextSuggestIndex`＝ステップ 1） |
| AC-8 | IME 変換確定中（`isComposing`）の Enter/カンマ/矢印キーが commit・候補移動を起こさない | Issue 受け入れ条件 8 | 3 |
| AC-9 | Enter / カンマ / Backspace(空draft) / blur commit の既存挙動が保持され、autosave がタグを送らない既存挙動も保持される | Issue 受け入れ条件 9 | 3, 6 / スコープ「autosave 仕様の変更なし」: `useAutosave`/`saveDraft` を変更しないことで担保 |
| AC-10 | スタイリングが Tailwind ユーティリティ + `tokens.css` トークンのみで、新規 CSS/@apply を増やさない（data-* 状態属性規約に従う） | Issue 受け入れ条件 10 | 2, 3 |
| AC-11 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通り、TagsInput/モデルの単体テストが緑 | Issue 受け入れ条件 11 | 6, 7 |

## スコープ

### 含まれないもの

- **タグ作成のサーバ往復・即時永続化**: 本 Issue はエディタ内の入力 UX 改善のみ。タグの確定は従来どおり保存/送信時の値オブジェクト構築に委ねる（候補は表示のみ）。
- **autosave 仕様の変更**: `useAutosave` / `saveDraft` は `title/contentHtml/frontMatterJson` のみ送る現状を維持し、本 Issue では一切触らない（タグを送らない挙動の保持はこの不変更によって担保）。
- **reducer のモデル拡張**: combobox の open/active-index は transient UI state なのでローカル `useState` に置き、reducer（`tagNames`/`tagDraft`）は変更しない（ADR-001）。
- **ドメインのタグ正規化ルール変更**: `TagName` の NFKC/`#`除去/長さ/空白規則はそのまま。UI 側はこれを SSOT として参照する（ADR-002）。
- **候補供給ユースケース/loader の新設**: 既存 `loadAllTags`（両ルートで既に warm 済み）を再利用するだけ。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/TagsInput.tsx` — 88 行の controlled view（chips + 末尾 borderless input）。本 Issue の改修主対象。
  - `app/components/note/editor/NoteEditor.tsx` — L88-100 `NoteEditorProps`/`SharedProps`、L488-495 で `TagsInput` をマウント。tag 候補を props で受けてここから渡す。
  - `app/components/note/editor/editorState.ts` — reducer の `addTag`/`removeTag`/`setTagDraft`（L537-570）、`parseTagInput`（L660-671）、`resolveTagNames`（L683-696）。変更不要（参照のみ）。
  - `app/components/note/editor/styles.ts` — `tagsRow`/`tagChip`/`tagChipRemove`/`tagInputControl`（L85-107）。コンテナ枠・候補パネル・候補行・エラー文言のクラス定数を追加/改修。`dirDropdownPanel`/`dirTreeItem`/`dirTreeItemNew`（L121-144）が候補パネルの良い参照。
  - `app/components/note/editor/DirectoryTreeSelect.tsx` — **既存の inline combobox + listbox 実装の手本**（activedescendant 方式・IME ガード・`data-active`/`data-selected`・option `tabIndex={-1}`/`onMouseDown preventDefault`）。本 Issue の a11y モデルはこれに合わせる。
  - `app/components/note/editor/directoryTreeModel.ts` — `clampActiveIndex`（L150-155）/ `nextActiveIndex`（L161-170）。**いずれも下限 0 を仮定し `index<0` を 0 に潰す**ため、本 Issue の `-1`（無アクティブ）始点とは非互換。参照のみ（手本）とし、ナビは下限 -1 保持の専用ヘルパを `tagSuggestModel.ts` に新設する（arch-risk R2 P-001）。
  - `app/components/note/loaders.ts` — `loadAllTags`（L326-356）: `{ tags:[{id,name,noteCount}], byName, byId }` を返す。候補供給源。
  - `app/core/domain/tag/valueObject.ts` — `TagName.create`（NFKC・`#`除去・空文字/空白/50超で `BusinessRuleError`）。inline バリデーションの SSOT。
  - `app/routes/_app/notes/new.tsx`（L18-32）/ `app/routes/_app/notes/$noteId/edit.tsx`（L21-55）— 両方 `loadAllTags` を呼ぶが **結果を NoteEditor に渡していない**（new はコメントで「将来の autocomplete 用に cache を温める」と明記）。ここで候補名を NoteEditor に渡す配線を足す。
  - `app/components/note/editor/__tests__/TagsInput.test.tsx` — 既存挙動（Enter/comma/IME/Backspace/×/blur/disabled）のロック。退行防止に拡張する。
- あるべきアーキテクチャ:
  - フロントは TanStack Start。状態は NoteEditor の reducer（モデル）+ 子は controlled view という確立パターン。transient UI state は orchestrator/子の `useState`（NoteEditor の `pendingWysiwygSwitch` コメント、DirectoryTreeSelect の local state が前例）。
  - スタイリングは Tailwind ユーティリティ + `tokens.css` トークン SSOT、状態は `data-*` + `data-[name]:` variant（`data-x={value || undefined}`）。繰り返しユーティリティは `styles.ts` の module-scoped 定数に集約（JIT がスキャン）。
  - a11y combobox は「実フォーカスは入力に留め、`aria-activedescendant` で option をハイライト」する方式が既存 SSOT（DirectoryTreeSelect が a11y 準拠と明記）。
  - 入力検証は「トランスポート境界」と「値オブジェクト構築」の 2 点のみが権威。UI の inline フィードバックは権威ではなくプレビューであり、ルール自体は値オブジェクト（`TagName`）を参照して重複定義を避ける。
- 既存実装の状態:
  - 乖離: `TagsInput` は枠なし/フォーカス不可視/候補なしで Issue の理想に未達。両ルートは候補を読み込むが配線が未接続（コメントで将来対応を明示）。→ 本 Issue で解消。
  - 一致: reducer/controlled-view 構造、IME ガード、autosave がタグを送らない設計は正しく、尊重・保持する。DirectoryTreeSelect の combobox パターンは流用すべき確立形。
- 依存関係:
  - `NoteEditorProps`（`SharedProps`）に候補プロップを追加するため、`NoteEditor` を呼ぶ箇所（`new.tsx`/`edit.tsx`、テスト）が影響。
  - `IngestionPreviewForm` 等が `NoteEditor` を別経路で使っていないか要確認（追加プロップは任意=省略時 `[]` にして後方互換を担保）。

## 設計

フロントエンドのみの変更。内側のモデル（reducer/ドメイン）は変えず、純粋ヘルパ → スタイル → view → 配線 → テストの順で外側へ向かう。

### ドメインモデルへの影響

なし。`TagName` のルールは不変。UI は `TagName.create` を「ルールの SSOT」として参照するだけで、ドメインに変更は加えない（ADR-002）。

### ユースケース / アプリケーションロジック

なし。候補は既存 `loadAllTags`（= `listTags` ユースケース）の結果を再利用するのみ。新規ユースケース・loader は作らない。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

1. **純粋ヘルパ `tagSuggestModel.ts`（新規, テスト可能なロジック）**
   - `filterTagSuggestions(allNames, committed, draft, limit)`: draft で前方/部分一致した既存タグ名から、既に確定済み（`committed`）を除外し、上限件数で返す。マッチ規則・除外規則ともに **同一の正規化規則（`TagName` の NFKC・`#`除去・case-insensitive）を SSOT として両辺へ適用**してから比較する（S-002）。committed は reducer 由来で生文字列・未正規化（`#Foo`/全角等）であり得るため、候補（DB 正規化済み）と素の文字列等価で比べると除外漏れ・重複表示が起きる。不正な committed は `TagName.create` の try/catch でスキップする。
     - **空 draft は空配列を返す（契約, arch-risk R3 S-001）**: trim 後に空（または空白のみ）の draft は前方/部分一致が「全件マッチ」になり得る（空文字は任意文字列の prefix）。フォーカスしただけ（未入力）で全タグ候補が出るのは本 Issue の意図ではない（入力開始まで候補非表示）。そこで空 draft では一致処理に入る前に空配列を返す。これにより `classifyDraft("")="empty"` / `validateTagDraft("")=null` と一貫し、フォーカス直後はパネル閉・`aria-expanded="false"`（`hasSuggestions=false` かつ `isNewDraft=false`）・エラー非表示になる。typing を始めて初めて候補/新規作成行が出る。テスト境界に空 draft → 空配列を追加する。
   - `classifyDraft(allNames, committed, draft)`: 現 draft が「既存一致 (exact)」「新規作成」「重複（確定済みと一致）」「空」のいずれかを返す → AC-5 の表示分岐に使う。マッチ判定は上と同じ正規化 SSOT を通す（S-002）。
   - `validateTagDraft(draft)`: `TagName.create` を try/catch し、`BusinessRuleError` の `code` を JP メッセージへマップして返す（valid: null）。ルール重複を避けるためここで `TagName` を唯一の判定器にする（ADR-002）。
     - **空欄時はエラー非表示**: trim 後に空（または空白のみ）の draft は `null`（エラー無し）を返す。`TagName.create("")` は `NameEmpty` を投げるが、空入力欄に常時「タグ名を入力してください」を出すのはノイズであり、AC-6 が求めるのは「50 文字超・不正文字など」の即時フィードバックである。`classifyDraft` の "empty" と整合させる（S-002 / S-003）。
     - **検証単位と commit 単位を一致させる**: commit 時 reducer の `parseTagInput` はカンマ分割した全トークンを長さ検証なしで chip 化するため、inline 検証も `parseTagInput` で分割した **commit 対象の全トークン**を検証し、1 つでも不正なら invalid とする（最後のトークンだけ見ると、ペースト等で「不正トークン＋末尾に正常トークン」が来たとき不正タグが commit され AC-6 を満たさない）（S-001）。
   - **候補ナビは `-1`（無アクティブ）始点を正しく扱う TagsInput 専用の薄いヘルパを新設する**（arch-risk R2 P-001）。既存 `directoryTreeModel` の `clampActiveIndex`/`nextActiveIndex` は **下限を 0 と仮定しており `-1` センチネルと非互換**（コード照合済み: `clampActiveIndex(-1, n)=0` → `nextActiveIndex(-1,"down",n)` は内部 clamp で `-1→0` に潰してから +1 し `1` を返す＝**無アクティブから ↓ で先頭候補 index 0 を飛ばす**）。そのまま再利用するという 1 周目の前提は誤りなので採らない。代わりに `tagSuggestModel.ts` に次の純粋ヘルパを置く:
     - `clampSuggestIndex(index, count)`: **下限 `-1`（無アクティブ）を保持し、上限超過（`index >= count`）のときのみ `count-1` に丸める**。`count<=0` のときは `-1`。既存 `clampActiveIndex`（下限 0・空で 0）とはセマンティクスが異なるため別関数として新設する（既存ヘルパは無改変）。
     - `nextSuggestIndex(current, direction, count)`: `count<=0` なら `-1`。`current < 0`（無アクティブ）のとき ↓ は `0`、↑ は `count-1`（末尾）を返す。それ以外は既存 `nextActiveIndex` と同じ巡回（`(current±1+count)%count`）。これにより「無アクティブから最初の ↓ で先頭候補 index 0、最初の ↑ で末尾」を保証する。
     - **DirectoryTreeSelect 流の「options 長変化で clamp に丸める useEffect」はそのまま流用しない**: `clampActiveIndex(-1)=0` で無アクティブ既定が即 0 に押し戻されるため。候補件数が変化したら `clampSuggestIndex`（下限 -1 保持）で丸める useEffect を使い、かつ draft 変化時は明示的に `activeIndex=-1` にリセットする（このリセットが clamp useEffect に 0 へ押し戻されないことを `clampSuggestIndex(-1)=-1` が保証する）。

2. **`styles.ts` のクラス定数追加/改修**
   - `tagsRow` を「コンテナ枠 + フォーカス可視化」へ刷新: `rounded-lg border border-hairline bg-bg` をベースに、`focus-within:border-accent focus-within:shadow-focus`（`--shadow-focus` トークン）でフォーカスリング。`relative`（候補パネルのアンカー）。`mb-5` 維持。
   - `tagChip` / `tagChipRemove`: 各 chip の × 削除ボタンは明示的な `aria-label`（例: `タグ「{name}」を削除`）を持ち、hover/focus-visible でコントラストが変化し、最小ヒット領域を確保する（AC-2 の検証可能基準）。現 `tagChipRemove` は既に hover/focus-visible のコントラスト変化を持つのでそれを基準として明文化・踏襲。data-* 規約準拠。
   - `tagInputControl`: borderless/transparent は維持（枠はコンテナが担う）。**`focus-visible:shadow-none` を追加**してフォーカスリングをコンテナの `focus-within` 側に一本化する（P-002）。グローバルな `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css）が全フォーカス要素に効くため、打ち消さないと内側 input とコンテナで二重リングになる（`titleInput` が同じ打ち消しを行う前例）。`outline-none` だけでは box-shadow は消えない。JSDoc に「リングはコンテナが担うため input 自身のグローバルリングは打ち消す」理由を残す。caret は `caret-accent` 等で補ってよい。
   - 候補パネル系を新設（`dirDropdownPanel`/`dirTreeItem`/`dirTreeItemNew` を踏襲。Popover を使わず手書き絶対配置にする = ADR-004 / S-004。モバイルはみ出しは `dirDropdownPanel` の `max-sm` 全幅化で吸収）: `tagSuggestPanel`（絶対配置の listbox 枠）、`tagSuggestOption`（`data-[active]:bg-surface`、既存一致は通常色）、`tagSuggestOptionNew`（新規作成行=accent 色 + `＋`/`#` グリフ）、`tagInputError`（`text-error` の inline メッセージ）。

3. **`TagsInput.tsx` の combobox 化（主改修）**
   - props 追加: `suggestions: readonly string[]`（候補となる全タグ名。`disabled` 等は維持）。既存 `tagNames/draft/onAddTag/onRemoveTag/onSetDraft` は据え置き。
   - ローカル `useState`: `open`（候補表示）, `activeIndex`。`useId` で listbox/option id 生成。option 用 ref 配列で `scrollIntoView`。
   - 候補は `useMemo(filterTagSuggestions(suggestions, tagNames, draft))`。
   - **候補の初期状態は「未選択」(`activeIndex = -1`)**（P-001）。インライン combobox では draft 自体が確定値なので、DirectoryTreeSelect と同型の「draft 変化で 0 へ再アンカー」を採ると、部分一致する既存タグが 1 件でもあれば常に先頭候補が active になり Enter が draft（新規タグ）の確定を奪う（例: 既存 `foobarbaz` がある状態で `foobar`+Enter が `foobarbaz` を入れてしまう）。そこで draft 変化では `activeIndex` を `-1`（無アクティブ）に戻し、ユーザーが ↑↓ を押して初めて候補がハイライトされる。draft があっても候補が未選択（`-1`）なら Enter は draft をそのまま新規タグとして確定し、候補がハイライトされている時だけその候補を採用する（多くのタグ入力 UI の標準挙動）。DirectoryTreeSelect との初期値の差異の理由は ADR-003 に明記。**この `-1` 始点は上記の `nextSuggestIndex`/`clampSuggestIndex`（ステップ 1）で取り回す**（既存 `nextActiveIndex`/`clampActiveIndex` は下限 0 仮定で非互換のため流用しない＝arch-risk R2 P-001）。候補件数の useMemo 再計算後は `clampSuggestIndex`（下限 -1 保持）で丸め、draft 変化では `activeIndex` を `-1` に明示リセットする（clamp が `-1` を保持するため 0 へ押し戻されない）。
   - **パネル可視述語と ARIA 属性の役割分離（arch-risk R3 P-001）**: パネルの可視述語は `open && hasSuggestions` ではなく **`panelOpen = open && (hasSuggestions || isNewDraft)`** とする。`isNewDraft` は `classifyDraft(...) === "new"`（非空 draft が正規化後に既存タグ・既 committed のいずれとも一致しない有効な新規 draft）。`open && hasSuggestions` のみにすると、AC-5 が区別したい主ケース＝「draft がどの既存タグにも一致しない新規タグ」（このとき `hasSuggestions=false`）でパネル自体が描画されず「新規作成」インジケータの表示場所が無くなり、AC-5 が主ケースで未達になる。`isNewDraft` を可視述語に含めることで新規作成行だけのパネルも描画される。
     - 入力 `<input>` を `role="combobox" aria-autocomplete="list"` に。**`aria-expanded` はパネル（ポップアップ）が表示されているか＝`panelOpen` を反映する**（`hasSuggestions` 単独ではない。Escape で `open=false` にした後も `hasSuggestions`/`isNewDraft` は true のままになり得るため、`hasSuggestions` 単独だと「パネル非表示なのに `aria-expanded="true"`」矛盾が起きる）。
     - **`aria-controls={listboxId}`・`aria-activedescendant={activeOptionId}` は `role="listbox"` が既存候補 option を持って実在するとき＝`open && hasSuggestions` の時のみ付与する**（`panelOpen` ではなく `hasSuggestions` 条件のまま）。新規作成行は `role="option"` でない非インタラクティブ表示（S-002 の不変条件）なので listbox に含まれず、ナビ対象 0 件のため activedescendant も無い。したがって「新規作成行のみ表示（`hasSuggestions=false && isNewDraft=true`）」のときは **`aria-expanded="true"` かつ `aria-controls`/`aria-activedescendant` 非付与**という組み合わせを許容する（ARIA 上、popup が表示されていて listbox が空/不在でも矛盾ではない＝活性化可能な option が無いだけ）。`aria-controls`/`aria-activedescendant` の実在条件付与は DirectoryTreeSelect:242-246 に倣う。コンテナ div を chips+input のラッパとし `aria-label="タグ"` を移設。
   - **パネル開閉トリガー（明文化, arch-risk R2 S-003）**:
     - 開く: input への `focus` 時、および draft の入力（`onChange`）時に `open=true`。実際にパネルが描画されるのは **`panelOpen = open && (hasSuggestions || isNewDraft)`** の時（既存候補も新規作成行も無いとき＝空 draft や重複 draft では開フラグが立っても非表示）。空 draft では `filterTagSuggestions` が空配列を返し（R3 S-001）`classifyDraft="empty"` のため、`focus` で `open=true` でもパネルは描画されず `aria-expanded="false"`。
     - 閉じる: `Escape`（draft は保持・`open=false`）、`blur`（option クリック由来は `onMouseDown preventDefault` で除外）、候補 or draft の commit 成功時。
     - 再オープン: Escape クローズ後でも再度のキー入力（`onChange`）や ↓ で `open=true` に戻す。
     - `aria-expanded` は `panelOpen` と一致させる。`aria-controls`/`aria-activedescendant` は `open && hasSuggestions`（listbox 実在）の時のみ付与する（R3 P-001 の役割分離）。
   - キーボード（`onKeyDown`）:
     - `ArrowDown`/`ArrowUp`: `isComposing` なら無視。候補があれば **`nextSuggestIndex`（`-1` 始点対応、ステップ 1）**で移動・`preventDefault`（無アクティブからの最初の ↓ は先頭候補 index 0、↑ は末尾）。閉じている場合は ↓ で `open=true` にしてから移動してよい。
     - `Enter`/`,`: `isComposing` なら無視・`preventDefault`。**候補がハイライト中（`activeIndex >= 0`）で Enter のとき**はその候補名を `onAddTag`（AC-4）。候補が未選択（`activeIndex === -1`）なら従来どおり `validateTagDraft` が valid な draft を `onAddTag`（不正なら commit 抑止 = AC-6）。空 draft は no-op。
     - `Escape`: 候補を閉じる（draft は保持）。
     - `Backspace`（draft 空 & chip あり）: 末尾 chip 削除（従来維持）。
   - blur: 候補クリック由来の blur と区別するため option は `onMouseDown preventDefault`（実フォーカスを奪わない）。従来どおり非空 draft を blur で commit（valid のときのみ）。`open` も閉じる。
   - 候補リスト: `role="listbox"`、各 option は `role="option" tabIndex={-1} aria-selected={isActive} data-active={isActive||undefined}`、`onMouseEnter` で `activeIndex` 同期、`onClick` で `onAddTag`。
   - **「新規作成」行はキーボードナビ対象の `role="option"` とはしない（非インタラクティブな表示インジケータ扱い）**（arch-risk R2 S-002）。`directoryTreeModel` の JSDoc が強調する「activedescendant の index は可視 option 件数と厳密に一致」という不変条件を守るため、ナビ対象 option は `filterTagSuggestions` の既存タグ候補のみとし、**`activeIndex` の上限 = `suggestions.length`（候補件数）、ref 配列長・`activeOptionId`・`nextSuggestIndex(count)` の `count` もすべてこの件数に一致させる**。新規作成行は `classifyDraft` が new のとき `tagSuggestOptionNew` で表示するだけで、その確定は P-001 の「候補未選択（`activeIndex=-1`）で Enter → draft を新規タグ確定」経路が担う（新規行を option として選ぶ二重経路を作らない）。クリックでの新規確定が必要なら `tabIndex={-1}`・`onMouseDown preventDefault` のボタンにし、`role="option"`／activeIndex の数え上げには含めない。先頭/末尾どちらに置くかは AC-5 の視認性で決めるが、いずれの場合も index 計算に算入しない。
   - 空状態ガイド（AC-2）: chip 0 件時の placeholder 文言、必要なら入力下の補足。
   - inline エラー（AC-6）: `validateTagDraft(draft)` のメッセージを `role` 付き（`aria-live="polite"` か入力の `aria-describedby`）で表示。**空/空白のみの draft ではエラーを表示しない**（`validateTagDraft` が `null` を返すため自然に非表示。S-002/S-003）。エラー表示は非空 draft の時だけ。
   - disabled 時は open させない・候補/×/input を不活性（既存テスト維持）。

4. **`NoteEditor.tsx` の配線**
   - `SharedProps` に `tagSuggestions?: readonly string[]`（任意・省略時 `[]`）を追加。L488 の `<TagsInput>` に `suggestions={props.tagSuggestions ?? []}` を渡す。reducer は不変。

5. **ルート配線（`new.tsx` / `edit.tsx`）**
   - 既に取得済みの `loadAllTags` 結果から `tags.tags.map(t => t.name)`（または `[...byName.keys()]`）を `NoteEditor` の `tagSuggestions` に渡す。new.tsx の「将来の autocomplete 用」コメントを実配線に更新。

6. **テスト**
   - `tagSuggestModel.test.ts`（新規）: filter（除外/部分一致/上限、**`#Foo` 確定済みが `Foo` 候補を除外する正規化ケース** = S-002）、classify（exact/new/dup/empty）、validate（空→null/空白→null/50超/`#`正規化/正常、**カンマ＋不正トークンで invalid** = S-001）。
     - **`-1` 始点ナビヘルパの回帰テスト**（arch-risk R2 P-001）: `clampSuggestIndex(-1, n) === -1`（下限 -1 保持）、`clampSuggestIndex(n, n) === n-1`（上限超過のみ丸め）、`clampSuggestIndex(2, 0) === -1`（空）、`nextSuggestIndex(-1, "down", n) === 0`（無アクティブから ↓ で**先頭候補。index 1 を飛ばさない**）、`nextSuggestIndex(-1, "up", n) === n-1`（↑ で末尾）、巡回（`nextSuggestIndex(n-1,"down",n)===0` / `nextSuggestIndex(0,"up",n)===n-1`）。
   - `TagsInput.test.tsx` 拡張: 既存ロック全維持に加え、候補表示、↑↓+Enter で候補 commit、**初期 `activeIndex=-1` のため Enter は draft を新規確定（既存部分一致があっても候補に奪われない）** = P-001、**無アクティブから最初の ↓ で先頭候補（index 0）がハイライトされる（飛ばさない）** = arch-risk R2 P-001、**draft 変化後も `activeIndex` が `-1` に戻り clamp で 0 へ押し戻されない** = arch-risk R2 P-001、IME 中の矢印/Enter 無視、Escape クローズ、**Escape クローズ後は `aria-expanded="false"`（候補が残っていても）** = arch-risk R2 S-001、不正 draft の commit 抑止、空 draft でエラー非表示、新規/既存の区別表示、combobox/listbox ARIA 属性。
     - **新規作成行のみのパネル（arch-risk R3 P-001）**: draft がどの既存タグにも一致しない（`hasSuggestions=false && isNewDraft=true`）とき、パネルが描画され新規作成行が見え、`aria-expanded="true"` かつ `aria-controls`/`aria-activedescendant` が**非付与**（listbox 不在＝ナビ対象 0 件）であることを固定。
     - **空 draft フォーカス（arch-risk R3 S-001）**: 空（未入力）の draft で input に focus しても候補が出ず（`filterTagSuggestions` が空配列）、`aria-expanded="false"`・エラー非表示であることを固定。
     - **invalid draft が chip 化されず draft のまま残る（arch-risk R3 S-002）**: 不正 draft で Enter/blur しても chip が増えず draft が保持される（権威ある弾きは保存時の `resolveTagNames`→`TagName.create` に委ねる二重防御）ことを固定。
   - **既存テストの DOM 構造変更を「意図的変更」として具体化**（S-005）: 既存 `TagsInput.test.tsx` は `querySelectorAll("li")` の件数と `input[aria-label="新規タグ"]` に依存。コンテナを `ul/li` から `div` 構造に刷新するため、(a) chip 件数アサーションを新 chip 要素のセレクタへ一括置換、(b) 入力の `aria-label` は据え置く（`新規タグ` のまま）か変更時は `getInput()` の取得関数とセレクタを一括更新、(c) コンテナの `aria-label="タグ"` の移設先（ラッパ `role="group"` か listbox の `aria-label`）を明記。退行ではなく構造刷新としてアサーションを更新する。

7. **最終ゲート**
   - `pnpm typecheck && pnpm lint:fix && pnpm format` を実行して通すこと（AC-11）。テスト方針セクションの最終ゲート記述と対応。コード変更ステップではないが、AC-11 の対応ステップとして明示的に独立させる（coverage P-001）。

## 設計判断

- **ADR-001**: combobox の open/active-index は transient UI state としてローカル `useState` に置き、reducer（`tagNames`/`tagDraft`）は拡張しない。
- **ADR-002**: inline バリデーションは `TagName.create` を try/catch して `*ErrorCode` を JP メッセージにマップする（ルールを UI に再実装せず、ドメインを SSOT に保つ）。
- **ADR-003**: a11y は実フォーカスを input に留めた `aria-activedescendant` 方式（DirectoryTreeSelect 準拠）。roving 実フォーカスは採らない。ただし `activeIndex` 初期値は DirectoryTreeSelect（0 再アンカー）と異なり `-1`（無アクティブ）にする（インライン combobox の新規タグ Enter 確定を奪わないため）。
- **ADR-004**: 候補パネルは既存 Popover を使わず `tagsRow` を `relative` アンカーにした手書きの絶対配置にする。実フォーカスを input に残す設計なので focus-trap 不要で、クローズは blur+Escape で足りる。代わりに viewport クランプ/外側クリッククローズを自前で担保する必要がある（S-004）。

詳細は `.issue/789/adr.md` 参照。

## リスクと注意点

- **IME と矢印キーの競合**: 日本語変換中は ↑↓ が IME 候補移動に使われる。`isComposing` ガードを Enter/カンマだけでなく矢印にも適用しないと変換操作を奪う（DirectoryTreeSelect は Enter のみガード。本 Issue では矢印も要ガード）。
- **autosave 非送信の維持**: `useAutosave`/`saveDraft` は触らない。タグ commit が reducer の `tags` dirty を立てても draft 送信ペイロードに tags は含まれないため挙動は保たれるが、誤って snapshot 経路を変えないこと。
- **候補クリックで blur commit が暴発**: option を `onMouseDown preventDefault` にしないと、クリック前に input blur が走り draft が誤 commit される恐れ。
- **後方互換**: `tagSuggestions` を任意（省略時 `[]`）にし、`NoteEditor` の他の利用箇所（`IngestionPreviewForm` 等）を壊さない。実装前に NoteEditor の全呼び出し元を確認。
- **既存 TagsInput テストの DOM 構造前提**: テストは `li` 要素数や `aria-label="新規タグ"` に依存。コンテナを `ul/li` から `div` に変える場合は該当アサーションを合わせて更新する（退行ではなく構造刷新として明示）。
- **大量タグ時の候補件数**: `filterTagSuggestions` に上限（例: 8〜10 件）を設け、`loadAllTags` の `TAG_RESOLVE_LIMIT` 規模でも DOM/操作が重くならないようにする。
- **既存ナビヘルパの下限 0 仮定**: `clampActiveIndex`/`nextActiveIndex`（`directoryTreeModel.ts:150-170`）は下限 0 を仮定し `-1` を 0 に潰す。本 Issue の `-1`（無アクティブ）始点とは非互換なので**そのまま流用しない**。`tagSuggestModel.ts` に下限 -1 を保持する `clampSuggestIndex`/`nextSuggestIndex` を新設して取り回す（既存ヘルパは無改変。DirectoryTreeSelect への影響なし）。
- **inline 抑止と submit 経路の二重防御（arch-risk R3 S-002）**: AC-6 の inline 検証は **chip 化のプレビュー抑止**であり、「不正タグが絶対に送信されない」保証ではない。未クリアの不正 draft は `resolveTagNames`（`editorState.ts:683` 付近）が非空 draft を submit ペイロードへ無条件に畳み込むため、権威ある値オブジェクト構築 `TagName.create` が**保存時に弾く**（二重防御）。inline はプレビュー・保存時が権威という CLAUDE.md の整理どおりで正しい挙動。invalid draft は blur/Enter で chip 化されず draft のまま残る（valid のときだけ chip 化）挙動をテストで固定する。

## テスト方針

- 純粋ヘルパ（`tagSuggestModel`）の単体テストで filter/classify/validate の境界（50 文字・`#`・空白・重複・部分一致・上限）を網羅。
- `TagsInput` のコンポーネントテストで既存 6 ロック + 新規（候補ナビ/IME 矢印ガード/Escape/不正抑止/新規・既存区別/ARIA）を検証。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を最終ゲート。
- 手動: 編集・新規両画面で、候補表示・↑↓Enter・IME 確定（矢印で候補選択→確定が壊れない）・50 文字超エラー・blur commit・autosave がタグ未送信（ネットワークで確認）を確認。

## レビュー履歴

### 1周目

**修正した点**:
- **[arch-risk P-001]**（activeIndex 0 再アンカーが新規タグ Enter 確定を奪う）: 候補の初期/再アンカーを `-1`（無アクティブ）に変更。draft があっても候補未選択なら Enter は draft を新規タグとして確定し、↑↓ でハイライトした時だけ候補を採用する設計に改めた（設計ステップ 3・キーボード節を更新、ADR-003 の Decision/Consequences と plan の設計判断に DirectoryTreeSelect との初期値差異の理由を明記、テストにも固定ケースを追加）。
- **[arch-risk P-002]**（focus-within リングとグローバル :focus-visible の二重化）: styles ステップに `tagInputControl` へ `focus-visible:shadow-none` を当ててリングをコンテナ側に一本化する旨と理由（`titleInput` 前例・`outline-none` だけでは box-shadow が消えない）を明記。
- **[coverage P-001]**（AC 表が未定義ステップ 7 を参照）: 最終ゲート（`pnpm typecheck && pnpm lint:fix && pnpm format`）を独立した実装ステップ 7 として設計セクションに追加し、AC-11 の「6, 7」を実在ステップに整合させた。

**取り込んだ改善提案**:
- **[coverage S-001]**: AC-9 の対応ステップ欄にスコープ除外「autosave 仕様の変更なし（`useAutosave`/`saveDraft` を変更しないことで担保）」を併記。
- **[coverage S-002 / arch-risk S-003]**: `validateTagDraft` は trim 後空/空白のみの draft で `null` を返し、空欄時は inline エラーを表示しない（エラーは非空 draft の時だけ）旨を helper ステップ・TagsInput ステップ・テストに明記。
- **[coverage S-003]**: AC-2 を検証可能な具体基準（各 chip に明示的な × 削除ボタン＋`aria-label`、hover/focus-visible でコントラスト変化、最小ヒット領域）に落とし、styles ステップにも反映。
- **[arch-risk S-001]**: `validateTagDraft` を「`parseTagInput` で分割した commit 対象の全トークンを検証し、1 つでも不正なら invalid」とし検証単位と commit 単位を一致させた。テストにカンマ＋不正トークンの境界を追加。
- **[arch-risk S-002]**: `filterTagSuggestions`/`classifyDraft` の committed 除外・マッチ判定を、committed（生文字列・未正規化）と候補（DB 正規化済み）の双方に同一の正規化規則（`TagName` を SSOT）を適用してから比較する旨を明記。`#Foo` 確定済みが `Foo` 候補を除外するテストを追加。
- **[arch-risk S-004]**: 候補パネルを Popover でなく手書き絶対配置にする選択のトレードオフ（外側クリッククローズ・viewport クランプを自前担保、Popover 使用案との比較）を ADR-004 として記録し、plan の設計判断・styles ステップから参照。
- **[arch-risk S-005]**: 既存 TagsInput テストの `ul/li`→`div` 構造変更・入力 `aria-label`・コンテナ `aria-label="タグ"` 移設先を「意図的変更」としてテストステップ 6 に具体化。

### 2周目

**修正した点**:
- **[arch-risk P-001]**（1 周目で導入した `activeIndex=-1` センチネルが再利用予定の `nextActiveIndex`/`clampActiveIndex` と非互換）: 既存ヘルパは下限 0 を仮定し `-1` を 0 に潰す（`nextActiveIndex(-1,"down",n)=1` で先頭候補を飛ばす／clamp useEffect が `-1` を 0 に押し戻す）ことをコード照合で確認。**そのまま流用する前提を撤回**し、`tagSuggestModel.ts` に `-1`（無アクティブ）始点を正しく扱う専用ヘルパ `clampSuggestIndex`/`nextSuggestIndex`（**下限 -1 を保持し上限超過のみ丸める**／無アクティブから ↓ で先頭・↑ で末尾）を新設する方式に確定。draft 変化での `-1` リセットが clamp に 0 へ押し戻されないこと、options 長変化の clamp useEffect を DirectoryTreeSelect 流のまま流用しないことを設計ステップ 1/3 に明記。回帰テスト（最初の ↓ が先頭候補／draft 変化後も `-1` 保持／上限丸め）をテストステップ 6 に追加。調査結果・リスク節・ADR-003 を更新。

**取り込んだ改善提案**:
- **[coverage S-001]**: Issue 原文「roving focus」と plan が採る `aria-activedescendant` 方式の対応を ADR-003 の Decision に明記（roving tabindex 未実装＝未達と誤読されないよう、activedescendant が roving focus 要件を満たす正当な実装である旨を補足）。
- **[arch-risk S-001]**: `aria-expanded` を `hasSuggestions` でなく `open && hasSuggestions` を反映する旨を設計ステップ 3・ADR-003 に明記。`aria-controls`/`aria-activedescendant` も同条件付与。Escape クローズ後 `aria-expanded="false"` のテストを追加。
- **[arch-risk S-002]**: 「新規作成」行はキーボードナビ対象 `role="option"` に含めない非インタラクティブ表示インジケータとし、`activeIndex` 上限＝候補件数（ref 配列/`activeOptionId`/`nextSuggestIndex(count)` も一致）という不変条件を設計ステップ 3・ADR-003 に明記。新規確定は `activeIndex=-1` Enter 経路が担い二重経路を作らない。
- **[arch-risk S-003]**: 候補パネルの開閉トリガー（focus/onChange で開く、Escape/blur/commit で閉じる、Escape 後の再入力で再オープン）を設計ステップ 3 に明文化し、`aria-expanded`（S-001）の付与条件と一致させた。

### 3周目

**修正した点**:
- **[arch-risk P-001]**（パネル可視述語 `open && hasSuggestions` のみだと、draft が既存タグに一致しない主ケース＝`hasSuggestions=false` で「新規作成」表示が出せず AC-5 が主ケースで未達）: パネル可視述語を **`panelOpen = open && (hasSuggestions || isNewDraft)`**（`isNewDraft = classifyDraft==="new"`＝非空で正規化後に既存タグ・既 committed と一致しない有効 draft）に拡張。`aria-expanded`（＝`panelOpen` を反映）と `aria-controls`/`aria-activedescendant`（＝既存候補 listbox が実在しナビ対象がある `open && hasSuggestions` の時のみ付与）の役割を分離。「新規作成」行はナビ対象外で `activeIndex` 上限に数えない不変条件を維持。設計ステップ 3（input ARIA／開閉トリガー）と ADR-003 に役割分離を明記。「新規作成行のみ表示」時の `aria-expanded="true"` ＋ `aria-controls`/`aria-activedescendant` 非付与の組み合わせをテストステップ 6 に追加。

**取り込んだ改善提案**:
- **[coverage S-301]**: AC-7 の対応ステップに、キーボードナビが依存する新ヘルパ `clampSuggestIndex`/`nextSuggestIndex`（ステップ 1）を併記し、ARIA 属性付与＝ステップ 3／index 取り回し＝ステップ 1 のトレーサビリティを厳密化。
- **[arch-risk S-001]**: 空 draft でフォーカスした時の `filterTagSuggestions` の振る舞い（空 draft → 空配列＝入力開始まで候補非表示、フォーカス直後の全件表示はしない）を helper ステップ 1 の契約・テスト境界に明記。これに伴う `aria-expanded="false"` の挙動を設計ステップ 3・ADR-003 で確定。
- **[arch-risk S-002]**: inline バリデーション抑止は「chip 化のプレビュー抑止」であり、未クリアの不正 draft は `resolveTagNames`（`editorState.ts:683` 付近）経由で submit に畳み込まれ、権威ある `TagName.create` が保存時に弾く二重防御である旨をリスク節に一行明記。invalid draft が chip 化されず draft のまま残る挙動をテストステップ 6 に追加。

3周完了。両視点とも残課題なしで収束。
