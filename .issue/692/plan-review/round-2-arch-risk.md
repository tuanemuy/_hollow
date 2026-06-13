# レビュー round-2 — アーキテクチャ整合性・実現可能性・リスク（Issue #692）

対象: `.issue/692/plan.md` / `.issue/692/adr.md`（1周目修正後）
視点: あるべきアーキテクチャ（CLAUDE.md Styling 規約）との整合・実現可能性・リスク・過剰スコープ
1周目: `.issue/692/plan-review/round-1-arch-risk.md`

---

## 総評

1周目の指摘（P-001〜003, S-001〜004）はすべて実コードで裏取りした上で適切に解消されている。

- **P-001（auth 直値複製）**: `auth/styles.ts:40` が `data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_4px_oklch(37.1%_0_0_/_0.28)]`（inset error 枠 + 4px 外側リングの単一 shorthand 合成）であることを再確認。ステップ5 / ADR-003 が `var()` 連結を不採用とし、外側リングを `0_0_0_2px_var(--color-error)`（error 文脈なので error 色）に手で揃える本線に格下げ済み。色の追従方針も明記された。解消。
- **P-002（caret-only 打ち消しの詳細度）**: グローバル `:focus-visible` が `@layer base`（`index.css:174-178`、`border-radius: inherit` 込み）、Tailwind 打ち消しが `@layer utilities`＋class&pseudo-class でレイヤー順・詳細度とも勝つこと、ステップ3 のブラウザ実検証＋代替手段（`[&:focus-visible]:shadow-none`→`!shadow-none`）が明記済み。解消。
- **P-003（note-detail-content 干渉）**: `index.css:190-` の `.note-detail-content` ブロックに focus/caret/box-shadow/outline 指定が無いことを再確認（grep）。解消。
- **S-001〜004**: 両背景 WCAG 計算・ダークモード非該当・モック機序差・ステップ順序（トークン先行）すべて反映済み。

新たな致命的問題は無い。AC-5 の「全105モック同期」は数値・スコープとも実態と整合する（後述で精査）。`@theme inline` ブリッジ理解も正しい。要修正1件は AC-5 のカウント内訳に関する軽微な精度問題。

---

## 問題点（要修正）

- **[P-001]** AC-5 / ADR-003 の「全 105 モック」に `drafts/` の HTML が暗黙に含まれており、同期対象として妥当か未判断
  - 理由: `spec/design/pages/**` で `--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)` を直値定義するファイルは厳密に 105 件で、そのカウントは正しい。ただしこの 105 件には **`spec/design/pages/drafts/P10-header-refined.html`（29 行で直値定義 + 35 行でグローバル `:focus-visible` 消費）が含まれる**。HTML 全体は 107 件（`drafts/` に3件：header-refined / header-options / toolbar-options）で、うち header-options・toolbar-options の2件は token を定義しないため 105 から除外され、結果として「107 − 2 = 105」となっている。つまり「全105」は『drafts のドラフト案も1件含めて一括置換する』という判断を無自覚に含んでいる。drafts はモック候補（採用前の検討用 HTML）であり、SSOT 同期の対象に含めるべきかは設計判断が要る（含めても害は小さいが、ドラフトを正規モックと同列に機械置換すると「未採用案まで本番トークンに追従させる」ことになり、スコープの線引きが曖昧になる）。
  - 提案: ADR-003 の同期スコープに「`drafts/` を含む/含まない」を1行明記する。含めない場合は対象を 104 件（`drafts/P10-header-refined.html` を除外）と訂正。含める場合は「ドラフトも token 直値の体裁を保つため一括対象に含める（構造的上書きは不要）」と理由を添える。どちらでも良いが、105 という数字を「全モック」と曖昧に呼ばず内訳（正規 104 + ドラフト1、または除外）を明示すること。

---

## 改善提案（検討推奨）

- **[S-001]** ステップ1の「一括置換」が `_`/スペース表記ゆれと多トークン1行に強いか手段を1行明記
  - 理由: 同期対象 105 件のうち **11 件（admin 系 P42〜P46 の PC/mobile）は `--shadow-none: none; --shadow-xs: …; … --shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28);` と複数トークンを1行に連結**している。置換が「`--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)` という部分文字列 → 新値」のサブストリング置換なら 11 件でも問題なく効く。だが「行単位置換」や「行頭〜行末を新値で差し替え」だと、同じ行の `--shadow-none`/`--shadow-xs`/… を巻き込んで破壊する。残り 94 件は token が単独行。なお実装側の値は spec のスペース区切り（`0 0 0 4px …`）だが auth は `_` 区切り（`0_0_0_4px_…`）で、両者は別表記なので一括 grep/replace の対象を取り違えない注意も要る。
  - 提案: ステップ1に「置換はトークン値のサブストリング指定で行い（行単位置換は admin 系 11 件の多トークン1行を壊すため不可）」を1行追記すると安全。

- **[S-002]** InlineEditor の caret-only 成立機序が WysiwygEditor と「同一」と要約されているが、実際は別機序（host 非フォーカス + 子孫打ち消し）
  - 理由: 実コード確認の結果、両者は構造が異なる。WysiwygEditor は `<EditorContent>` wrapper が非編集の div で、内側 `.ProseMirror` が contenteditable 本体（`[&_.ProseMirror]:focus-visible:shadow-none` を持つ）。一方 InlineEditor の `<section>` は host 自身（`ref={hostRef}`）で、`applyEditable` は **`if (el === host) continue;` で host 自身は contenteditable にせず、allow-list された子孫ブロックのみ editable にする**。よって InlineEditor のフォーカス対象は常に子孫であり、host 自身は contenteditable も tabindex も持たず**フォーカス不能**。`focus-within:shadow-focus` を削除すると、host にグローバル `:focus-visible` の箱リングは付かず（host が focus を受けないため）、子孫の `:focus-visible` は子孫セレクタ `[&_:focus-visible]:shadow-none` が打ち消す。結果として caret-only は **成立する**（plan の結論は正しい）。ただし ADR-001 / ステップ2 は「内側要素が既に `focus-visible:shadow-none` を持つので削除だけで完結」と WysiwygEditor と同一機序のように記述しており、InlineEditor 固有の「host は非フォーカス・子孫セレクタが効く」点が暗黙。結論に影響はないが、実検証時に「host にも子孫にも箱リングが出ないこと」を両方見る根拠として1行残すと精度が上がる。
  - 提案: ステップ2 または ADR-001 に「InlineEditor は host(`<section>`) 自身が contenteditable でなく（`applyEditable` が host を除外）フォーカスを受けるのは子孫ブロックのみ。`[&_:focus-visible]:shadow-none`（子孫セレクタ）が子孫の箱リングを打ち消し、host には元々リングが付かないため削除だけで caret-only が成立」と機序を1行補記。

- **[S-003]** `tokens.md` 同期に section「10. フォーカスリング」の prose（リング挙動の説明）を含めるか触れていない
  - 理由: `tokens.md` には `--shadow-focus` が3箇所（226=トークン表の値 / 306=`box-shadow: var(--shadow-focus)` の消費例 / 535=mobile `:root` の値）。plan は値定義の 226・535 を正しく同期対象とし、306 は `var()` 参照なので値同期不要（正しい）。ただし section 10（302-311 行）は「すべてのインタラクティブ要素に共通適用」と説明する prose で、**P12 の書く面は caret-only で例外になる**ことがここに反映されない。tokens.md は SSOT ミラーなので、細線化値の同期に加えて「書く面（エディタ本文・タイトル）はリング非適用＝caret-only」の例外を section 10 に1行足すと、ドキュメントと実装の乖離（『すべてに共通適用』という記述と P12 の実態のズレ）が残らない。
  - 理由（続き）: これは過剰スコープにはあたらない（AC-5 が既に tokens.md 同期を範囲に含めている）。値だけ同期して prose の例外記述を落とすと、次に tokens.md を読む人が「全要素にリング」と誤解する。

---

## 良い点

- 1周目の P-001〜003 を実コードで裏取りした上で本質的に解消している（auth shorthand 合成の構造理解、詳細度・レイヤー順の根拠、note-detail-content の非干渉確認）。指摘の「形だけ反映」でなく機序まで詰めている。
- AC-5 の「105」は `grep -rl` で厳密に再現でき、`box-shadow: var(--shadow-focus)` 消費も 105 件と一致。モック直値複製の網羅は正確（取りこぼし無し）。
- `tokens.md` の値定義（226/535）と消費例（306）を区別し、値同期対象を 226/535 に正しく限定。`@theme inline` ブリッジ（`index.css:107` の `var()` 自己参照）を編集不要と判断する Styling 規約理解も正しい。
- ステップ順序を「トークン細線化先行→個別 caret-only→確認」に最適化（S-004 反映）。横断トークンを先に確定させ確認の手戻りを減らす設計で実現可能性が高い。
- スコープ管理が適切。border 撤去（#689）を担当クラス分離で明確に切り離し（ADR-004）、選択色・角丸・hover を非対象と明示。過剰スコープは見当たらない（drafts の扱いだけ P-001 で要明確化）。
- WCAG: 既存 4px リングが透過合成で約 1.6:1 と「既に 2.4.11 未達」という弱点を発見し、不透明 accent で細線化と同時にコントラストを引き上げる判断。両背景（白/surface）で計算し直しており的確。

---

## 検証メモ（事実確認の裏取り）

- `spec/design/pages` 配下 HTML は計 107 件。`--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)` 直値を持つのは 105 件（`drafts/P10-header-refined.html` を含む）。token 非定義は `drafts/P10-header-options.html` / `drafts/P10-toolbar-options.html` の2件 → P-001 の根拠。
- 直値の値は 105 件すべて同一文字列。うち 11 件（admin P42-46 PC/mobile）は多トークン1行に連結 → S-001 の根拠。`box-shadow: var(--shadow-focus)` 消費も 105 件。
- `tokens.css:120` = 4px 実在。`index.css:107` ブリッジ（`--shadow-focus: var(--shadow-focus)`）・`174-178` グローバル `:focus-visible`（`border-radius: inherit` 込み）実在。
- `tokens.md`: 226（表の値）・306（`var()` 消費例）・535（mobile `:root` 値）。値定義は 226/535 のみ → S-003 の根拠（306 は同期不要で正しい）。section 10 prose は 302-311。
- `WysiwygEditor.tsx:576` = wrapper(div) に `focus-within:border-accent focus-within:shadow-focus`、内側 `[&_.ProseMirror]:focus-visible:shadow-none`+`caret-accent`+`selection:bg-accent-surface`。`.ProseMirror` が contenteditable 本体。
- `InlineEditor.tsx:858-864` = `<section ref={hostRef}>` 自身が host。`applyEditable`（274 行）に `if (el === host) continue;` あり → host 自身は contenteditable にならず、子孫ブロックのみ editable。host は tabindex/contenteditable 無しでフォーカス不能 → S-002 の根拠（caret-only は成立する）。
- `auth/styles.ts:40` = inset error 枠 + 4px 外側リングの単一 shorthand 合成。P-001（1周目）解消の裏取り。
- `styles.ts:12-13` JSDoc「focus は global に委譲」記述あり（ステップ3 で更新対象）。`titleInput` に `rounded-*`/`caret-accent` 無し（15 行）。
- `index.css:190-` `.note-detail-content` ブロックに focus/caret/box-shadow/outline 指定なし（P-003 解消の裏取り）。
