# ADR — Issue #789: ノート編集画面のタグ入力(tag input)の見た目と入力方法を改善する

## ADR-001: combobox の transient UI state はローカル useState に置き、reducer を拡張しない

### Status
Proposed

### Context
タグ候補ドロップダウンの導入で「候補の開閉 (open)」「ハイライト中の候補 (activeIndex)」という新しい状態が必要になる。配置先の候補は (a) NoteEditor の editor reducer を拡張する、(b) `TagsInput` のローカル `useState` に閉じ込める、の 2 つ。reducer はモデル状態（content/mode/autosave/dirty/tagNames/tagDraft）専用で、NoteEditor は `pendingWysiwygSwitch` のような「ダイアログの開閉」等の transient view-only state を明示的に `useState` 側へ寄せている前例がある。既存 `DirectoryTreeSelect` も open/activeIndex/query をローカル state で持つ。

### Decision
open/activeIndex は `TagsInput` のローカル `useState` に置く。確定済みタグ `tagNames` と未確定 `tagDraft` は従来どおり reducer に残し、commit は既存 `onAddTag`/`onRemoveTag`/`onSetDraft` 経由。reducer・`snapshotForSubmit`・autosave 経路には一切手を入れない。

### Consequences
- 良い点: reducer の責務（保存対象モデル）が保たれ、autosave/dirty/submit のロックステップを揺らさない。確立パターン（DirectoryTreeSelect）と一貫。テスト対象が局所化。
- トレードオフ: 候補ハイライト状態は永続化/共有されない（不要なので許容）。draft をフィルタ query として使うため、フィルタの瞬間状態は reducer の tagDraft に依存する（既存の単一 SSOT を保てるので利点でもある）。

---

## ADR-002: inline バリデーションは TagName をルールの SSOT として参照する

### Status
Proposed

### Context
AC-6 で「50 文字超・不正文字などを入力時に即時フィードバック」する必要がある。ルールは既にドメイン値オブジェクト `TagName.create`（NFKC 正規化・先頭 `#` 除去・空文字/空白/50 文字超で `BusinessRuleError`）に存在する。選択肢は (a) UI 側にルールを再実装する、(b) `TagName.create` を try/catch して結果をフィードバックに使う。CLAUDE.md は「検証はトランスポート境界と値オブジェクト構築の 2 点のみが権威」とし、UI の inline 表示はあくまでプレビュー。値オブジェクトは純粋 TS で client からも import 可能（loaders 等で既に domain を import 済み）。

### Decision
`TagName.create` を try/catch する純粋ヘルパ `validateTagDraft` を設け、捕捉した `BusinessRuleError` の `code`（`TagErrorCode` の NameEmpty/NameInvalidChars/NameTooLong）を日本語メッセージにマップして返す。UI はこれを inline 表示に使い、不正な draft の commit を抑止する。権威ある検証は従来どおり保存時の値オブジェクト構築に残す。

### Consequences
- 良い点: ルールの重複定義を排除し、ドメインのルール変更が UI に自動追従する（表記ゆれ・ドリフトが起きない）。
- トレードオフ: client バンドルに `TagName`/`BusinessRuleError`/`TagErrorCode` が含まれる（軽量・既に domain を import している前例ありで許容）。英語の `BusinessRuleError` メッセージは UI で使わず `code` ベースで JP に再マップする一手間が必要。

---

## ADR-003: a11y は aria-activedescendant 方式（実フォーカスは input 固定）

### Status
Proposed

### Context
AC-7 が combobox/listbox の ARIA と roving focus を要求する。roving の実現方式は (a) 候補 option 間で実 DOM フォーカスを移す roving tabindex、(b) 実フォーカスは input に留め `aria-activedescendant` でハイライトを移す、の 2 つ。既存 `DirectoryTreeSelect` は (b) を採用し a11y 準拠と明記。タグ入力は「打鍵しながら候補を選ぶ」インライン combobox であり、入力にフォーカスが残る (b) が打鍵継続と相性が良い。

### Decision
input を `role="combobox"`（aria-autocomplete/expanded/controls/activedescendant）とし、候補 listbox の option は `tabIndex={-1}`・`onMouseDown preventDefault`（実フォーカスを奪わない）。↑↓ は `aria-activedescendant` を移動、Enter で active 候補を commit。`DirectoryTreeSelect` のパターンに揃える。

**Issue 受け入れ条件 7 の「roving focus」は `aria-activedescendant` 方式で満たす**（coverage R2 S-001）。roving の実現には「実 DOM フォーカスを option 間で移す roving tabindex」と「実フォーカスは input に固定し `aria-activedescendant` で論理フォーカス（ハイライト）を移す」の 2 方式があり、後者は ARIA APG の combobox パターンとして正当な roving focus の実装である。本 Issue は roving tabindex を実装しないが、これは受け入れ条件 7 の未達ではなく、activedescendant 方式による達成である（roving tabindex 未実装＝未達と誤読しないこと）。

`aria-expanded`/`aria-controls`/`aria-activedescendant` は **パネルが実際に開いている時のみ** true / 付与する（arch-risk R2 S-001）。Escape クローズ後も `hasSuggestions` は true のままになり得るため、`hasSuggestions` 単独では「パネル非表示なのに `aria-expanded="true"`／存在しない listbox を `aria-controls` が指す」矛盾が起きる。

**ただし `aria-expanded` と `aria-controls`/`aria-activedescendant` は役割を分離する**（arch-risk R3 P-001）。パネルの可視述語は `panelOpen = open && (hasSuggestions || isNewDraft)`（`isNewDraft = classifyDraft==="new"`）であり、AC-5 が区別したい主ケース＝「draft がどの既存タグにも一致しない新規タグ」（`hasSuggestions=false`）でも新規作成インジケータを描画できるよう、可視述語に `isNewDraft` を含める。`open && hasSuggestions` のみだと新規作成行の表示場所が無くなり AC-5 が主ケースで未達になる。

- `aria-expanded` は **パネル（ポップアップ）が表示されているか＝`panelOpen`** を反映する。
- `aria-controls`（指す `role="listbox"`）と `aria-activedescendant` は **既存候補 option を持つ listbox が実在するとき＝`open && hasSuggestions` の時のみ**付与する。「新規作成」行は `role="option"` でない非インタラクティブ表示インジケータ（後述の不変条件）なので listbox に含まれず、ナビ対象 0 件のため activedescendant も無い。
- したがって「新規作成行のみ表示（`hasSuggestions=false && isNewDraft=true`）」のときは **`aria-expanded="true"` だが `aria-controls`/`aria-activedescendant` は非付与**という組み合わせを許容する。ARIA 上、popup が表示されていて listbox が空/不在でも矛盾ではない（活性化可能な option が無いだけ）。

空（trim 後空白のみ）の draft では `filterTagSuggestions` が空配列を返し（arch-risk R3 S-001）`classifyDraft="empty"` となるため、`hasSuggestions=false && isNewDraft=false` で `panelOpen=false`。フォーカスしただけ（未入力）では全タグ候補を出さず、`aria-expanded="false"`・エラー非表示で、typing 開始後に初めてパネルが開く。

候補ナビの index 取り回しには **`-1`（無アクティブ）始点を正しく扱う TagsInput 専用の純粋ヘルパ `clampSuggestIndex`/`nextSuggestIndex`（`tagSuggestModel.ts`）を新設する**（arch-risk R2 P-001）。既存 `directoryTreeModel` の `clampActiveIndex`/`nextActiveIndex` は下限 0 を仮定し `-1` を 0 に潰す（`nextActiveIndex(-1,"down",n)=1` で先頭候補を飛ばす）ため、`-1` センチネルとは非互換であり流用しない。新ヘルパは **clamp の下限 `-1` を保持し上限超過（`index>=count`）のみ `count-1` に丸め**、`nextSuggestIndex` は無アクティブ（`current<0`）から ↓ で `0`・↑ で `count-1` を返す。これにより「最初の ↓ で先頭候補」「draft 変化での `-1` リセットが clamp に 0 へ押し戻されない」を両立する。DirectoryTreeSelect 流の「options 長変化で clamp に丸める useEffect」はそのまま流用せず、`clampSuggestIndex`（下限 -1 保持）版を使う。

ナビ対象 option は `filterTagSuggestions` の既存タグ候補のみ（`activeIndex` 上限 = 候補件数）とし、「新規作成」行は `role="option"` に含めない非インタラクティブ表示インジケータとする（arch-risk R2 S-002。新規確定は `activeIndex=-1` での Enter 経路が担い、index 計算に算入しない）。

ただし **`activeIndex` の初期値・再アンカー方針は DirectoryTreeSelect と意図的に変える**。DirectoryTreeSelect は draft が「検索フィルタ」にすぎないため draft 変化で先頭候補（index 0）を active に再アンカーしてよいが、`TagsInput` の draft は「確定値そのもの（新規タグ）」なので、先頭候補を既定 active にすると Enter が新規タグ確定を奪う（部分一致する既存タグがあれば常にそちらが入る）。そこで **初期/再アンカー先を `-1`（無アクティブ）**とし、ユーザーが ↑↓ を押して初めて候補がハイライトされる。候補が未選択なら Enter は draft を新規タグとして確定し、ハイライト中の時だけその候補を採用する。

### Consequences
- 良い点: 既存実装と一貫した a11y モデル。打鍵中もフォーカスが input に残り IME・連続入力と両立。option のクリックで blur commit が暴発しない。インライン combobox 特有の「新規タグ Enter 確定」と「既存候補選択」を両立できる。
- トレードオフ: 矢印キーを自前でハンドリングするため、IME 変換中（`isComposing`）の矢印を明示的に無視する必要がある（DirectoryTreeSelect は Enter のみガードだが、本 Issue では矢印もガードする）。`activeIndex` 初期値が DirectoryTreeSelect（0 再アンカー）と異なるため、両者を「同一パターン」とみなして読むと齟齬が出る点をコメント/本 ADR で補う必要がある。`-1` 始点を扱うため `directoryTreeModel` のナビ／clamp ヘルパを流用できず、`tagSuggestModel.ts` に下限 -1 保持版（`clampSuggestIndex`/`nextSuggestIndex`）を新設する（既存ヘルパは無改変で DirectoryTreeSelect への影響なし。新ヘルパには `-1` 始点・上限丸めの回帰テストを付ける）。

---

## ADR-004: 候補パネルは既存 Popover を使わず手書きの絶対配置にする

### Status
Proposed

### Context
候補 listbox の表示基盤として (a) 既存の `Popover`/`Dropdown` 基盤（`DirectoryTreeSelect` が採用。外側クリックで閉じる・viewport クランプ・focus 管理を内蔵）を流用する、(b) `tagsRow` を `relative` にして絶対配置の div を直接置く、の 2 択がある。本件はインライン combobox で**実フォーカスを input に固定**する設計（ADR-003）なので、Popover が提供する focus-trap/別レイヤ focus 管理はむしろ不要であり、パネルのクローズは blur/Escape で概ね成立する。

### Decision
(b) を採る。`tagsRow` を `relative` アンカーにして絶対配置パネル（`dirDropdownPanel` を踏襲）を直接置き、クローズは blur + Escape に依存する。

### Consequences
- 良い点: 入力にフォーカスを残すインライン combobox と素直に両立（focus-trap/別レイヤ管理が不要）。既存クラス定数（`dirDropdownPanel`/`dirTreeItem`/`dirTreeItemNew`）を再利用でき、新規 CSS/@apply ゼロ。
- トレードオフ: Popover が内蔵する (1) 外側クリックでのクローズ、(2) viewport クランプ（小幅 viewport でのはみ出し制御・スクロール追従）を自前で担保する必要がある。(1) は実フォーカスが input に残る設計なので blur で概ね閉じるが、(2) の `clampToViewport` 相当は付かない。モバイルでのはみ出しは `dirDropdownPanel` の `max-sm` 全幅化規則で吸収できることを実装時に確認する。将来クランプ要件が強まれば Popover への移行を再検討する。

---

## ADR-005: 実装時に確定した細部（matchKey / isNewDraft ゲート / 候補 option 要素）

### Status
Accepted（実装時に確定）

### Context
ステップ 1〜3 の実装で、plan に明記されていない以下 3 点の細部判断が必要になった。

### Decision
1. **比較用 `matchKey` は lenient（never-throw）にする**: `filterTagSuggestions`/`classifyDraft` のマッチ判定で使う正規化キーは「NFKC + 先頭 `#` 除去 + 小文字化」のみを行う純粋関数 `matchKey`（長さ/空白などの検証は含めない）を `tagSuggestModel.ts` に置いた。検証（長さ・空白）は ADR-002 どおり `validateTagDraft → TagName.create` のみが権威。`matchKey` は「比較キー算出」という別関心であり、入力途中の未確定（=まだ不正）な draft でもマッチ計算を継続できるよう全域関数にした。委員 committed 側は plan どおり `TagName.create` の try/catch で不正値をスキップしてからキー化する（有効値では `matchKey` と同一結果）。

2. **`isNewDraft = classifyDraft==="new" && validateTagDraft===null` とゲートする**: plan の素の式は `isNewDraft = classifyDraft==="new"` だが、`classifyDraft` は lenient なため 51 文字や空白入りの draft も「new」と分類される。これらは「新規作成」インジケータを出すべきではない（同時にエラーも出て矛盾する）。そこで component 側で `validateTagDraft(draft)===null`（有効）を AND 条件に加え、有効な新規 draft の時だけ作成行を出す。`classifyDraft` 自体は plan どおり exact/new/dup/empty の 4 値・全域のまま保つ。

3. **候補 option は `<button role="option">` で描画する**: plan は `role="option" tabIndex={-1}` とだけ規定。`<div>` に `onClick`/`onMouseEnter` を付けると biome `lint/a11y/useKeyWithClickEvents` が出るため、DirectoryTreeSelect:321 と同じく `<button type="button" role="option" tabIndex={-1} onMouseDown preventDefault>` を採用した（手本と完全一致）。コンテナ枠は `role="group" aria-label="タグ"` とし、`useSemanticElements`（fieldset 提案）は FilterBar 等の前例に倣い biome-ignore で抑止。

### Consequences
- 良い点: 検証の権威を `TagName` に一本化したまま（ADR-002 維持）、入力途中でも候補/分類が安定して計算できる。不正 draft で作成行が誤表示されない。a11y lint を既存パターンに準拠して通過。
- トレードオフ: `matchKey` が `TagName` の正規化（NFKC + `#`除去）の比較サブセットを再記述する形になる（`TagName` に `normalize` 単独 API が無く、`create` は throw するため）。将来 `TagName` の正規化規則が変わったら `matchKey` も追従が要る（JSDoc に明記済み）。

---
