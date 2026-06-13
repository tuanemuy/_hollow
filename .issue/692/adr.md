# ADR — Issue #692: input/エディタのフォーカス表現を見直す

## ADR-001: 書く面要素（エディタ本文・タイトル）を caret-only にする

### Status
Proposed

### Context
P12 は「フォームの集合」ではなく「1枚の原稿（document canvas）」のメタファーで設計されている。ボーダーレスな書く面要素にグローバルの箱型フォーカスリング（`--shadow-focus`）が当たると、480px の編集領域全体やボーダーレスのタイトルが「巨大な input」に見え、原稿メタファーが崩れる。選択肢:

- (A) 書く面に角丸を足してリングを綺麗な箱に揃える
- (B) 書く面には箱リングを当てず caret + 選択色でフォーカスを示す（caret-only）

内側 ProseMirror は既に `caret-accent` + `selection:bg-accent-surface` + `focus-visible:shadow-none` を持ち、caret-only の基盤が揃っている。外側 wrapper の `focus-within:shadow-focus` がそれを上書きしている構図。

### Decision
(B) caret-only を採用する。

- WysiwygEditor / InlineEditor wrapper から `focus-within:shadow-focus` / `focus-within:border-accent` を削除。
- `titleInput` はグローバル箱リングを `focus-visible:shadow-none` で打ち消し、`caret-accent` で本文と一貫させる。
- 内側のフォーカス表現（caret + 選択色）を唯一の表現とする。

InlineEditor を対象に含める根拠（Issue 本文は WysiwygEditor のみ明示）: `NoteEditor.tsx` が wysiwyg / html / inline の3モードを切り替え、InlineEditor は同一 P12 画面の inline モード本体で wrapper 構造（`focus-within:border-accent focus-within:shadow-focus` + 内側 caret-only）も同じ `focus-within:*` を持つ。**InlineEditor を除外すると「P12 のモード間でフォーカス挙動が不一致」という新たな乖離を生む**ため、含める方が一貫性を保つ。

**caret-only 成立機序は WysiwygEditor と「同一」ではない**（結論は同じだが機序が異なる）:
- WysiwygEditor: wrapper(div) は非編集、内側 `.ProseMirror` が contenteditable 本体で `[&_.ProseMirror]:focus-visible:shadow-none` を持つ。`focus-within:shadow-focus` を削れば箱リングが消え、内側の caret-only が唯一の表現になる。
- InlineEditor: host(`<section ref={hostRef}>`) 自身は contenteditable にならない（`applyEditable` が `if (el === host) continue;` で host を除外し、allow-list された子孫ブロックのみ editable）。host は tabindex/contenteditable を持たず**フォーカス不能**。`focus-within:shadow-focus` 削除後、host にはグローバル `:focus-visible` の箱リングが付かず（host が focus を受けない）、子孫の `:focus-visible` は子孫セレクタ `[&_:focus-visible]:shadow-none` が打ち消す。

どちらも「wrapper の `focus-within:*` 削除だけで caret-only が成立」する点は共通だが、InlineEditor 側は「host 非フォーカス + 子孫セレクタ打ち消し」という別経路で成立するため、実検証時は host にも子孫にも箱リングが出ないことを両方確認する。

### Consequences
- 良い点: 原稿キャンバスのメタファーと一致。モック（静的な `.editor` は箱リングを持たない）とも整合。二重表現（外側リングが内側 caret を打ち消す）の解消。
- トレードオフ: 書く面のフォーカスは caret/選択色のみになり、箱リングほど目立たない。ただし通常のテキスト編集領域では caret が標準的なフォーカス表現であり、WCAG 上も text input の caret は受容される。input 系（後述）は引き続き可視リングを保持するため、フォーカス可視性の全体方針は維持される。

---

## ADR-002: `--shadow-focus` の細線化値（4px→2px）と WCAG 充足

### Status
Proposed

### Context
`--shadow-focus` はアプリ全体の input（`fieldControl` 等）に効くグローバルトークンで、現状 `0 0 0 4px oklch(37.1% 0 0 / 0.28)`。4px は太くデザインと噛み合わないため 2px へ細線化したい。一方 WCAG 2.4.7（Focus Visible）/ 2.4.11（Focus Appearance, AAA だが指針として採用）は、フォーカス指標に十分な領域とコントラストを求める。

現状値の問題: `oklch(37.1% 0 0)` は L=37.1% の中暗灰だが、alpha 0.28 で白背景（`#fff`）に合成すると実効色は L≈85%（おおよそ `#cfcfcf` 相当）。隣接背景（白）とのコントラストは約 1.6:1 で、**既に 2.4.11 の 3:1 を満たしていない**。ここで太さだけ 2px に減らすと面積も減り、可視性がさらに悪化する。

検討した値:
- (A) `0 0 0 2px oklch(37.1% 0 0 / 0.28)` — 単純な 2px 化。実効 ~1.6:1 のまま。**不可**（退行）。
- (B) `0 0 0 2px var(--color-accent)` — 不透明な accent（`oklch(37.1% 0 0)`、白に対し約 8.9:1）。2px でも 3:1 を大幅に満たす。
- (C) `0 0 0 2px oklch(37.1% 0 0 / 0.75)` 等、alpha を上げて 3:1 を狙う。合成計算が必要で値が脆い。

### Decision
確定値を着手前に1つに絞る。**第一候補 `--shadow-focus: 0 0 0 2px var(--color-accent)` を採用とし、フォールバックは `0 0 0 2px oklch(37.1% 0 0 / 0.85)` の1案のみ**とする（無限の選択肢を残さない。coverage S-002）。

- 太さ: 2px（Issue 指定の目安）。
- 色: 不透明 accent（`oklch(37.1% 0 0)`）。
- フォールバック条件: 目視で「Apple Calm の淡く控えめなトーンに対し強すぎる」と判断された場合**のみ**、alpha 0.85 版（`oklch(37.1% 0 0 / 0.85)`）に1段だけ落とす。それ以下には下げない（下げると 3:1 を割るため）。

WCAG コントラスト根拠（隣接色＝リング外側の地。本プロジェクトの input は white 地と surface カード内の2系統）:
- accent `oklch(37.1% 0 0)` ≒ L\* 約 39（相対輝度 ~0.105）。
- 対 白背景（`--color-bg`、相対輝度 ~1.0）: (1.0+0.05)/(0.105+0.05) ≈ **6.8:1**（≥3:1 を大幅充足）。
- 対 surface 背景（`#f5f5f7`、相対輝度 ~0.93）: (0.93+0.05)/(0.105+0.05) ≈ **6.3:1**（≥3:1 充足）。
  - （初稿に記した「白 8.9:1」は概算の上振れ。いずれにせよ両背景で 3:1 を十分上回る。）
- 2.4.11（Focus Appearance）の「フォーカス前後の変化」: 透過廃止で不透明 accent にするためフォーカス前（背景地のみ）↔フォーカス後（不透明 2px リング）のコントラスト差が明確に確保される。

実装時に各画面の背景（white / surface）上で潰れ・はみ出しが無いか目視確認する。

### Consequences
- 良い点: 細線化と WCAG 充足を両立。背景非依存で安定。確定値が1つ＋フォールバック1つに絞られ、実装着手時のデザイン判断の割れ（手戻り）を排除。
- トレードオフ: 不透明リングは透過版よりコントラストが強く出る。フォールバック（alpha 0.85）はそのための1段の逃げ道で、それ以上は許容しない。

### note: 詳細度の打ち消し（titleInput）
タイトル入力の `focus-visible:shadow-none`（`@layer utilities`、class&pseudo-class）はグローバル `:focus-visible`（`@layer base`、bare pseudo-class）にレイヤー順・詳細度とも勝つため打ち消しは効く見込み。万一勝てない場合は `[&:focus-visible]:shadow-none` → `focus-visible:!shadow-none` の順で対処する。`!important` は最終手段としてのみ許容する（ユーティリティファースト規約の例外的逃げ道だが、グローバル base ルールの局所打ち消しという限定用途に限る）。

---

## ADR-003: グローバルトークン変更の影響範囲と直値複製の追従

### Status
Proposed

### Context
`--shadow-focus` は SSOT（`tokens.css`）→ `@theme inline` ブリッジ → ① グローバル `:focus-visible`（全 input）② Tailwind `shadow-focus` ユーティリティ、の2経路で全画面に波及する。さらに `auth/styles.ts:40` が error+focus 時の影として `0_0_0_4px_oklch(37.1%_0_0_/_0.28)` を**直値で複製**しており、トークンを変えても追従しない。

### Decision
- **アプリ側**: トークン値は `tokens.css` の 1 箇所だけ変更し、`@theme inline` ブリッジ（`var()` 参照）とグローバル `:focus-visible` ルールは編集しない（自動波及）。
- **モックの直値複製の同期スコープ（本Issue内で完結させる）**: `spec/design/pages/**` の 105 ファイルが各 `:root` で `--shadow-focus` を直値複製しているため、**トークン直値の同期は全 105 モック + `spec/design/tokens.md`（226 / 535 行の値定義）を一括対象とする**（P12 のみでは残り 104 ページが乖離するため。coverage P-001）。内訳は **PC top-level 55 + `mobile/` 49 + `drafts/P10-header-refined.html` 1 = 105**（grep で define=consume=105 を確認）。
  - **drafts を含める判断**: 105 件のうち1件は探索用ドラフト `drafts/P10-header-refined.html`。同ディレクトリの他2件（`P10-header-options.html` / `P10-toolbar-options.html`）は `--shadow-focus` を持たず対象外。`P10-header-refined.html` は 29 行で `--shadow-focus` を直値定義し 35 行のグローバル `:focus-visible` で実際に消費しているため、**SSOT 一括同期の趣旨（乖離を残さない）に沿って同期対象に含める**。機械置換のコストが極小で除外する積極的理由がなく、除外すると当該ドラフトだけ旧 4px が残って乖離する。構造的上書き（`.editor`/`.title-input` の `:focus-visible` 打ち消し）は不要。
  - **置換単位**: 一括置換は**値文字列 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 単位のサブストリング置換**で行う（行頭・行末非依存）。105 件のうち 11 件（admin 系 P42〜P46 の PC/mobile）は `--shadow-md: …; --shadow-focus: 0 0 0 4px …;` と複数トークンを1行に連結しており、行単位置換だと同一行の他トークンを巻き込んで壊すため不可（arch-risk S-001 / coverage S-001）。残り 94 件は単独行。実装側 `auth/styles.ts` は `_` 区切り（別表記）なので一括対象を取り違えない。
  - 一括置換は機械的なのでフォローアップに切り出さず本Issueで実施する。caret-only の構造的上書きは書く面を持つ P12 のみで良い。
- **`tokens.md` prose の同期**: 値定義（226 / 535）に加え、section 10 の prose（311 行「すべてのインタラクティブ要素に共通適用」）に「書く面（エディタ本文・タイトル）はリング非適用＝caret-only の例外」を1行足す。値だけ同期して prose を放置すると「全要素にリング」という記述が P12 実態とズレて残るため（arch-risk S-003）。306 行（`box-shadow: var(--shadow-focus)` の消費例）は `var()` 参照なので値同期不要。
- **auth 直値複製の追従**: `auth/styles.ts:40` は error 枠（inset）と外側リングを1つの box-shadow shorthand で合成しており、`var(--shadow-focus)` を1レイヤーだけ差し込む連結は Tailwind 任意値の `_` 区切りでは破綻しやすい。よって **`var()` 連結は採用せず、最初から直値を手で揃える**。色は **error 文脈なので外側リングを error 色にする**（`0_0_0_2px_var(--color-error)`）— accent 不透明に揃えると error フィールドだけ accent リング＋error 枠という意味の混線が起きるため、error 色で統一する。太さは新トークンと同じ 2px。
- outline 方式（`focus-visible:outline-accent` を使う list/menu 系）は `--shadow-focus` 非依存のため対象外。

### Consequences
- 良い点: SSOT・ミラー・全モック（drafts 1件含む）を同値に保ち、トークン変更後の乖離を残さない。値定義に加え prose の例外も同期するためドキュメントと実装のズレも残らない。auth の追従で太さ・色の両方を整合させ「太さだけ追従」の取り残しを防ぐ。
- トレードオフ: 105 ファイル（PC 55 + mobile 49 + drafts 1）の一括置換が発生するが、値文字列単位のサブストリング置換で機械的。drafts は破棄され得る探索案だが、消費している以上残すと乖離するため含める方が一貫する。auth リング色を error にする判断はデザイン上の選択であり、強すぎれば accent に寄せる余地は残す（その場合本 ADR を更新）。

---

## ADR-004: #689（border 撤去）との連動方針

### Status
Proposed

### Context
#692（フォーカス）と #689（border 撤去）は WysiwygEditor / InlineEditor の同一 className を編集する。Issue 本文でも「実作業は連動させる」とされている。

### Decision
担当クラスを明確に分離する。

- #692: `focus-within:shadow-focus` / `focus-within:border-accent` の削除のみ。
- #689: `border-hairline` / `rounded-md` / `p-4`（および付随する transition）の削除。

互いの担当クラスには触れない。本Issueでは `transition-[border-color,box-shadow]` も残す（border 撤去側の領分。box-shadow トランジションが一時的に無害に残るのは許容）。マージ順序によるコンフリクトは後発側で手解決する。

### Consequences
- 良い点: 各Issueが独立に適用・レビュー可能。caret-only は border の有無と無関係に成立する。
- トレードオフ: 同一行を 2 Issue が触るため git コンフリクトの可能性。クラス担当が明確なので解決は機械的。

---

## ADR-005: `.note-detail-content` 例外との非干渉・ダークモード非該当の確認

### Status
Proposed

### Context
arch-risk レビューで2点の確認が求められた。(1) InlineEditor が併用する `.note-detail-content`（CLAUDE.md / .issue/70 ADR-002 で認められた handwritten CSS 例外）と caret-only 化が干渉しないか。(2) ダークモード／カラースキームへの影響。

### Decision
いずれも実コード確認の上、本Issueでは追加対応不要と判断する。

- **`.note-detail-content` 非干渉**: `app/styles/index.css:189-` の `@layer components .note-detail-content` ブロックには focus / caret / box-shadow / outline 指定が一切無い（grep 済み）。caret-only 化（wrapper の `focus-within:shadow-focus` 削除）は例外側と二重定義・打ち消し漏れを起こさない。`.note-detail-content` には手を付けない。
- **ダークモード非該当**: `app/styles/` に `prefers-color-scheme` / `.dark` / `data-theme` / `color-scheme` のテーマ分岐が存在しない（grep 済み）。accent も無彩（`oklch(37.1% 0 0)`）で配色は単一。ダークモード考慮は不要。

### Consequences
- 良い点: 例外 CSS とトークン変更の干渉リスクを着手前に否定。レビュー視点（ダークモード）の網羅を明示。
- トレードオフ: なし（確認結果の記録）。
