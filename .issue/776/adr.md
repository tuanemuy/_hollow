# ADR — Issue #776: 残りの不完全 role=tablist パターンの APG 是正

#660 ADR-001（radiogroup vs tabs の判断基準 = 実体 tabpanel の有無）/ ADR-002（segmented 用 roving フック新設）/ ADR-004（roving は矢印移動で即選択）を前提に、本 Issue 固有の判断のみを記す。

## ADR-001: 並び替え軸 segmented（TagListToolbar）は radiogroup/radio を採用する

### Status
Proposed

### Context
TagListToolbar の並び替え軸 segmented（名前 / ノート数 / 作成日時 / 最終使用、`aria-label="並び替え軸"`）は `role="tablist"`/`role="tab"`/`aria-selected` を持つが、roving tabindex / 矢印キー / `aria-controls` / 実体 tabpanel をいずれも欠く不完全な Tabs パターンである。

調査事実:
- ソート選択は `run({type:"setSort"}, {sort})` → `router.navigate` で URL（`?sort=`）を書き換えるだけで、segmented の DOM 兄弟に「タブパネル」と呼べる要素は存在しない（一覧 `TagList` が再描画されるのみ）。
- 相互排他の単一選択（4 択から 1 つ）であり、これは #660 の表示モード segmented（list/tile/calendar）と意味的に同型。

### Decision
**#660 ADR-001 と同じく radiogroup/radio を採用する。** 実体 tabpanel が無く相互排他の単一選択であるため:
- コンテナ: `role="tablist"` → `role="radiogroup"`（`aria-label="並び替え軸"` 維持、`aria-orientation="horizontal"` 付与）
- 各ボタン: `role="tab"` → `role="radio"`、`aria-selected` → `aria-checked`
- `useRovingTablist` を **automatic activation（既定・矢印移動で即選択）** でそのまま再利用（DisplayModeSwitch と同形）。`onSelect(index)` は既存の `run({type:"setSort"})` へ橋渡しし、click 経路と収束させる。
- `role="radio"` を `<button>` に付すため `biome-ignore lint/a11y/useSemanticElements` を併記（#660 ADR-005 と同根拠 — アイコン無しのテキスト segmented だが `<input type="radio">` では既存 design・data-active 表現・Space/Enter 活性化を再現できない）。

### Consequences
- 良い点: UI 実体（相互排他の単一選択）と ARIA が一致。`useRovingTablist` を改変なしで再利用でき、表示モード系で確立した radiogroup パターンと揃う。SR 告知が「ラジオボタン n/N」となり操作モデルと一致。
- トレードオフ: spec モック P18 と TagListToolbar.test の `tablist`/`tab`/`aria-selected` 契約を破壊的に更新する（契約自体が不完全だったため正当）。

---

## ADR-002: 編集モード switch（EditorModeSwitch）は APG Tabs を完成させる（radiogroup フォールバックではなく）

### Status
Proposed

### Context
本 Issue の中心的設計判断。EditorModeSwitch（ビジュアル / WYSIWYG / HTML、`aria-label="編集モード"`）も不完全な `role="tablist"` だが、表示モード / 並び替え軸と決定的に異なる点を実コードで確認した:

**実体 tabpanel が存在する。** `NoteEditor.tsx`（493-544 行）は `state.mode` に応じて body エディタを条件付きレンダーする:
- `mode === "html"` → `<HtmlEditor>` + `<MediaUploader>`
- `mode === "inline"` → `<InlineEditor>` + `<MediaUploader>`
- `mode === "wysiwyg"` → `<WysiwygEditor>` + `<MediaUploader>`

3 モードはいずれも**同一の body（`contentHtml`/`htmlDraft`）を異なる表現で編集する**直接制御パネルであり、tab クリック → React state（`state.mode`）→ パネル内容差し替え、という Tabs の操作モデルそのもの（URL 駆動でも別 island でもない。#660 の表示モードが「別レンダー境界・URL 駆動」だったのと対照的）。#660 ADR-001 の判断基準「実体 tabpanel の有無」に照らすと、ここは **Tabs が正**。

さらに決定的なのが**副作用の重さ**:
- WYSIWYG への切替は `NoteEditor.onModeChange`（223-293 行）で (a) 未保存時の `window.confirm`、(b) `surface==="edit"` かつ未対応タグ検出時の装飾喪失 `ConfirmDialog` をゲートする。
- WYSIWYG パネルは TipTap の重いマウントを伴う。
- 編集 surface のタブ順は `[inline, wysiwyg, html]`。**矢印で inline→html へ移動すると途中の wysiwyg を通過する。**

検討した選択肢:
- **案A: radiogroup フォールバック**（TagListToolbar と同形、`useRovingTablist` を automatic activation で流用）。
  矢印移動 = 即選択（APG Radio Group 必須挙動）なので、inline→html へ矢印移動するだけで wysiwyg を通過する瞬間に装飾喪失ダイアログが開いてしまう。実体 tabpanel が存在する事実も無視する。
- **案B: APG Tabs を automatic activation で完成**（`useRovingTablist` 流用）。
  Tabs だが automatic activation のため案A と同じ「wysiwyg 通過でダイアログ」問題が残る。
- **案C: APG Tabs を manual activation で完成**（`useRovingTablist` に manual モードを追加）。
  矢印はフォーカス移動のみ、活性化（mode 確定）は Enter/Space/click。WAI-ARIA APG は「パネル表示が大きな変化・遅延を伴う場合は manual activation を推奨」しており、TipTap マウント + 確認ダイアログを伴う本ケースはまさにこれに該当。矢印で wysiwyg を通過してもダイアログは開かず、html まで移動して Enter で確定できる。既存の `onChange`（確認ゲート）は click / Enter / Space 経由でのみ発火し続けるため**既存挙動が完全に保たれる**（AC: 既存 editor モード選択・WYSIWYG 装飾喪失確認ゲートの不変）。

### Decision
**案C を採用する。EditorModeSwitch を APG Tabs（manual activation）として完成させる。**
- `role="tablist"`/`role="tab"`/`aria-selected` は **維持**（Tabs パターンなので正。並び替え軸と違い radio 化しない）。
- `aria-orientation="horizontal"` 付与。各 tab に安定 `id`（`editor-mode-tab-${mode}`）と `aria-controls`（実体 tabpanel の固定 id を指す）。
- roving tabindex は**フォーカス追従**（`focusedIndex` 由来、ADR-003）: 現在フォーカス中の tab が `tabIndex=0`、他が `tabIndex=-1`。初回レンダーは `focusedIndex===selectedIndex` なので選択中 tab が `tabIndex=0`、矢印移動後はフォーカスした非選択 tab が `tabIndex=0` になる（選択＝`aria-selected` は活性化まで不変）。
- 矢印（ArrowLeft/Right + Home/End、両端ラップ）は**フォーカス移動のみ**で選択は変えない。`onChange` は呼ばない。活性化は native `<button>` の click（Space/Enter）→ 既存 `onClick={() => onChange(tab.mode)}` が担い、確認ゲートを温存。blur では `focusedIndex` をリセットせず、再 Tab-in は最後にフォーカスした tab へ戻る（標準 APG manual activation 挙動、ADR-003）。
- 実体パネル: `NoteEditor` の body 条件レンダー 3 分岐を 1 つの `<div role="tabpanel" id={EDITOR_BODY_PANEL_ID} aria-labelledby={editorModeTabId(state.mode)}>` で囲む。常に 1 モードのみマウントされる単一パネルで、`aria-labelledby` がアクティブ tab を指し、全 tab の `aria-controls` がこの単一 id を指す（APG の「単一パネル内容差し替え」変種）。
- **FrontMatterEditor は tabpanel に含めない**（#697 で「body モードと並行して常時マウント、排他タブではない」と確定済み。tabpanel は body 3 分岐のみを囲み、FrontMatter の手前で閉じる）。
- id 結合は `editorModeTabId(mode)` ヘルパー + `EDITOR_BODY_PANEL_ID` 定数を EditorModeSwitch（または editor/styles）から export する静的命名で済ませ、生成 id の引き回しはしない。

### Consequences
- 良い点: 実体 tabpanel と ARIA セマンティクスが一致（ADR-001 基準通り Tabs）。manual activation により矢印で wysiwyg を通過してもダイアログが暴発せず、既存の確認ゲート挙動が完全保存される。`role="tab"` を維持するため EditorModeSwitch.test / noteEditorModeChange.test の `[role="tab"]` セレクタが生き、テスト churn が小さい。
- トレードオフ: `useRovingTablist` に manual activation モード（`focusedIndex` 内部 state）を追加する必要がある。state は常設されるが automatic（radiogroup）経路はこれを参照せず挙動不変（ADR-003）。roving の発火責務が automatic（radiogroup）/ manual（tabs）の 2 系統になる（操作モデルの差に忠実）。

---

## ADR-003: `useRovingTablist` に manual activation モードを追加する（automatic 既定で後方互換）

### Status
Proposed

### Context
ADR-002 で EditorModeSwitch を manual activation Tabs にすると決めたため、`useRovingTablist`（現状 automatic 専用・stateless・`selectedIndex` から tabIndex を導出し矢印で即 `onSelect`）に manual 経路が要る。manual activation では:
- roving tabindex は**フォーカス位置**に追従する（選択ではなく）。よって `selectedIndex` から導出できず、内部 `focusedIndex` state が要る。
- 矢印はフォーカス移動のみで `onSelect` を呼ばない（活性化は caller の native button click）。

既存 consumer は DisplayModeSwitch と PublicTopControls の 2 箇所のみ（いずれも automatic）。

### Decision
`useRovingTablist` に `manualActivation?: boolean`（既定 `false`）オプションを追加する。

`focusedIndex` の `useState(selectedIndex)` は **Rules of Hooks に従い `manualActivation` の値に関わらず常に宣言する**（条件付きフック呼び出しはしない）。差は「どちらの index から `getTabIndex` を導出し、矢印で何を発火するか」だけである:
- **automatic（既定）:** `focusedIndex` state を**参照しない**。`getTabIndex` は `selectedIndex` 由来、矢印で `onSelect(next)` 即発火。挙動は現状と同一で、既存 2 consumer は無改変で動作（後方互換）。
- **manual:** `getTabIndex` は `focusedIndex` 由来。矢印/Home/End は `focusedIndex` 更新 + 対象 tab へ `.focus()` のみ（`onSelect` を呼ばない＝選択は変えない）。`selectedIndex` が外部変化（＝活性化）したらレンダー中調整（`prevSelected` ref 比較 → `setFocusedIndex`）で `focusedIndex` を追従させる。

**再 Tab-in 挙動（確定）:** blur では `focusedIndex` をリセットしない。したがって矢印でフォーカス移動した後 Tab で離脱し再 Tab-in すると、**最後にフォーカスした tab に戻る**（選択中 tab ではない）。これは WAI-ARIA APG の roving-tabindex 標準挙動（最後にフォーカスした要素に tabIndex=0 が残る）であり、manual activation Tabs として正しい。「選択中 tab に戻す」挙動は APG 上不要であり、それを実現するには blur で `focusedIndex` を `selectedIndex` にリセットするハンドラが追加で要る（複雑度増）ため採らない。

型安全（不正状態の排除）を厳密にするなら automatic = `onSelect` 必須 / manual = `onSelect` 不要の discriminated union も検討余地があるが、既存 consumer の推論を壊さない範囲で boolean フラグ + JSDoc 明記を第一候補とする（実装時に最終形を確定 — 実装時評価）。

### Consequences
- 良い点: 1 フックで radiogroup（automatic）と tabs（manual）の両 APG パターンを賄え、segmented 系 roving の単一実装を維持。既存 consumer 後方互換。
- トレードオフ: フックに `focusedIndex` state が常設される（Rules of Hooks 上、条件付きでは宣言できない）。ただし automatic 経路はこの state を参照しないため挙動は現状と不変で、#660 ADR-004 の「automatic は `selectedIndex` 由来で矢印即選択」という性質は保たれる（「stateless」は厳密には「automatic 経路は `focusedIndex` を参照しない」の意。JSDoc で 2 経路の差を明記して責務を保つ）。
- 安全弁（arch-risk S-001）: manual の「常に厳密に 1 つの tab が `tabIndex=0`」不変条件は `focusedIndex ∈ [0, count)` に依存する。`count` はマウント中不変のため現計画では破綻しないが、`getTabIndex` の範囲外フォールバックか「`focusedIndex` は常に `[0,count)`」の JSDoc 明記を安全弁として実装時に入れ、将来 surface 可変化したとき全 tab が `tabIndex=-1` になる（グループが Tab 到達不能）退行を防ぐ。

---

## ADR-004（実装時確定）: `useRovingTablistOptions` は discriminated union で表現する

### Status
Accepted（実装時確定）

### Context
ADR-003 では API 形を「`manualActivation: boolean` フラグ + JSDoc を第一候補、discriminated union も検討余地あり、実装時に最終形を確定」としていた。CLAUDE.md の原則「不正状態を型レベルで排除する（Make illegal states unrepresentable）」を踏まえ、実装時に最終形を選定した。

### Decision
`UseRovingTablistOptions` を以下の discriminated union とした:
- `UseRovingTablistAutomatic`: `manualActivation?: false` + `onSelect`（**必須**）。automatic（APG Radio Group）は矢印移動＝即選択なので `onSelect` は必須。
- `UseRovingTablistManual`: `manualActivation: true` + `onSelect?`（**任意**）。manual（APG Tabs）は矢印でフォーカスのみ移動し選択は呼び出し元の native click が担うため `onSelect` を呼ばない。

### Consequences
- 良い点: manual で `onSelect` を渡し忘れてもエラーにならず（呼ばれないため正しい）、automatic で `onSelect` を渡し忘れると型エラーになる。「automatic だが選択ハンドラ無し」という不正状態を型レベルで排除できる。既存 2 consumer（DisplayModeSwitch / PublicTopControls）は `manualActivation` 未指定 → Automatic 分岐に解決され `onSelect` 必須のまま無改変で通る（後方互換）。boolean フラグ案より厳密で、既存推論を壊さない。
- トレードオフ: なし（boolean フラグ案の上位互換）。

---

## ADR-005（実装時確定）: P12 モックの mode-tabs inventory から stale な FrontMatter タブを除去する

### Status
Accepted（実装時確定）

### Context
計画ステップ7 は「P12 mode-tabs の各 tab に `id` + `aria-controls` を付与し、FrontMatter タブの stale 表記（#697 で削除済み）は注記で触れるに留め inventory 完全同期は spec-sync 領域として深追いしない」とした。しかし実装時、各 tab に `aria-controls="editor-body-panel"` を付与する段で、FrontMatter タブにこの属性を与えると「FrontMatter は body tabpanel の中身ではない（#697 で常時マウントの別 UI に分離済み）」という事実と矛盾する半端なマークアップになることが判明した。

### Decision
P12 mode-tabs の inventory を実装の new サーフェス実体（`[WYSIWYG, HTML]`）に合わせ、stale な FrontMatter タブを除去した。残る 2 タブに `id` / `aria-controls` / roving 由来 `tabindex` を付与し、注記で「FrontMatter タブは #697 で削除済み（常時マウントに移行）」「実装の可視タブは 新規=[WYSIWYG, HTML] / 既存=[ビジュアル, WYSIWYG, HTML]」を明記した。

### Consequences
- 良い点: モックの ARIA 契約が首尾一貫する（全 tab が実体 tabpanel を指す）。FrontMatter の stale 表記も同時に解消され、モックがより正確になる。
- トレードオフ: 計画が「inventory 同期は spec-sync 領域」とした方針をわずかに踏み越える。ただし ARIA 契約の整合に必要な最小限の是正であり、edit サーフェスの完全な inventory（ビジュアルタブ等）までは同期していない（そこは引き続き spec-sync 領域）。
