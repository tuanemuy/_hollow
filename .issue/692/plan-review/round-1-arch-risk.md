# レビュー round-1 — アーキテクチャ整合性・実現可能性・リスク（Issue #692）

対象: `.issue/692/plan.md` / `.issue/692/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

## 総評

計画・ADR ともに精度が高い。コードベースの実際の値・行番号・消費者一覧を実地調査済みで検証した結果、記載は概ね正確だった（`tokens.css:120` の 4px、`index.css:107` の `@theme inline` ブリッジ、`index.css:174-178` のグローバル `:focus-visible`、`WysiwygEditor.tsx:576` / `InlineEditor.tsx:863` の `focus-within:*`、`auth/styles.ts:40` の 4px 直値複製、shadow-focus 消費者の網羅）。特に「`tokens.css` を変えれば `@theme inline`（`var()` 参照）経由で `shadow-focus` ユーティリティとグローバル `:focus-visible` の両方に自動波及し、ブリッジは編集不要」という Styling 規約の理解は正しい。

ただし実現可能性・網羅性の観点で要修正の見落としが数点ある（特に P-001 の auth INPUT 直値複製の取りこぼし、P-002 の caret-only 上書きの実効性）。

---

## 問題点（要修正）

- **[P-001]** `auth/styles.ts` の 4px 直値複製の特定が「40 行の error-focus」だけになっており、`var(--shadow-focus)` 連結への寄せ案が成立しない構造を見落としている
  - 理由: 該当箇所は `INPUT`（40 行）の `data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_4px_oklch(37.1%_0_0_/_0.28)]` で、**error 枠（inset）と外側リング（4px）を1つの `box-shadow` で合成**している。ADR-003 / ステップ5 は「可能なら `var(--shadow-focus)` 連結に寄せて二重管理を解消」を第一案にしているが、shorthand 内に複数レイヤーがある以上 `var()` を1レイヤーだけ差し込む連結は Tailwind 任意値の `_` 区切り構文では破綻しやすい。さらに新トークン候補が透過なし `0 0 0 2px var(--color-accent)`（B案）になると、旧値の `0 0 0 4px oklch(.../0.28)` を機械的に「2px 化」するだけでは色も alpha も変わり、auth だけ accent 不透明・他は透過…という不整合の逆パターンが起きうる。
  - 提案: ステップ5 の第一案を「直値を新トークンと同一の値（太さ・色とも）に手で揃える」に格下げし、`var()` 連結は「可能なら」ではなく「不可なら直値、と最初から想定」と明記する。加えて、新トークンが B案（不透明 accent）に決まった場合に auth の error-focus も同じ accent 不透明リングにするのか、error 文脈なので error 色寄りにするのか（リング色を error にするか accent にするか）を ADR-003 で1行決めておく。現状は「太さだけ追従」しか書いておらず色の追従方針が欠落している。

- **[P-002]** タイトル入力／エディタ本文の caret-only 化で「グローバル `:focus-visible` を `focus-visible:shadow-none` で打ち消す」手段の CSS 詳細度・適用条件が未検証
  - 理由: グローバル `:focus-visible`（`index.css:176`）は `box-shadow` を直接当てている。Tailwind の `focus-visible:shadow-none` は `@layer utilities`（または素のクラス）で生成され、グローバルの `@layer base` ルールより詳細度・レイヤー順で**勝てる前提**だが、計画はこれを当然のものとして検証していない。`titleInput` は `<input>` なので `:focus-visible` が直接マッチし `shadow-none` で上書きできる見込みだが、WysiwygEditor は内側 `[&_.ProseMirror]:focus-visible:shadow-none` が**既にある**（=実際にフォーカスを受けるのは内側 ProseMirror、外側 wrapper は `focus-within` で着けている）。つまり本文側は「`focus-within:shadow-focus` を削除する」だけで完結し `focus-visible:shadow-none` の追加は不要。一方タイトルは「グローバル `:focus-visible` を打ち消す」追加が必須。両者の機序が違うのに、ステップ2 のタイトル対応が「打ち消し」、ステップ1 の本文対応が「削除」と分かれている点は正しいが、**打ち消し（shadow-none）がグローバル base ルールに詳細度で勝つことの確認**が手順に無い。
  - 提案: ステップ2 に「`focus-visible:shadow-none` がグローバル `:focus-visible` の `box-shadow` を実際に上書きできること（レイヤー順・詳細度）をブラウザで確認」を明記。勝てない場合の代替（`focus-visible:shadow-[none]` ではなく `[&:focus-visible]:shadow-none` 等の詳細度引き上げ、または `!shadow-none`）を1行用意する。`!important` は最終手段として ADR に許容根拠を残す。

- **[P-003]** InlineEditor が `note-detail-content`（handwritten CSS の例外クラス）を併用している事実への言及が無く、caret-only 化が CSS 例外側と干渉しないかが未確認
  - 理由: `InlineEditor.tsx:863` の className は `note-detail-content min-h-[480px] ... focus-within:shadow-focus [&_:focus-visible]:shadow-none ...`。`.note-detail-content` は CLAUDE.md / ADR-002（#70）で認められた `@layer components` の handwritten CSS 例外で、`dangerouslySetInnerHTML` 由来の子要素にスタイルを当てるためのもの。caret-only 化で `focus-within:shadow-focus` を外すこと自体は問題ないが、`.note-detail-content` 側に focus 関連の box-shadow や caret 指定が無いかを確認しないと、二重定義や打ち消し漏れが起きうる。計画・ADR ともに `note-detail-content` に一切触れていない。
  - 提案: ステップ1 に「`app/styles/index.css` の `.note-detail-content`（`@layer components`）に focus/caret 関連の指定が無いことを確認」を1行追加。あれば caret-only 方針との整合を取る。

---

## 改善提案（検討推奨）

- **[S-001]** WCAG コントラスト根拠（accent 白背景 8.9:1）の出所が暗黙。surface 上 input も明示計算を
  - 理由: ADR-002 は accent（`oklch(37.1% 0 0)`）が白背景に約 8.9:1 と述べるが、実際の input には `bg-surface`（`#f5f5f7`）や `bg-white` 上に乗るものが混在する（`public/styles.ts:202,346`、`tag/styles.ts:75,144` は `bg-surface`、`auth INPUT` は `bg-surface`→focus 時 `bg-bg`）。リングは要素**外側**に出るため隣接背景はページ地（多くは白系 `--color-bg`）だが、surface カード内に置かれた input ではリングが surface（`#f5f5f7`）に隣接する。accent(L37%) vs surface はコントラスト十分なはずだが、ADR が「白 8.9:1」しか書いていないと検証範囲が片手落ちに見える。
  - 理由（続き）: 2.4.11（Focus Appearance）は「フォーカス時とフォーカス前の色変化」も評価対象。透過廃止で不透明 accent にするとフォーカス前後のコントラスト差は十分確保できるが、ADR にその観点（隣接色＝地、対背景は white と surface の両方）を1行足すと根拠が完結する。

- **[S-002]** ダークモード／カラースキームの非該当を明示
  - 理由: 視点に「ダークモード／カラースキーム」が挙がっている。本リポジトリの `tokens.css` を確認した範囲では `prefers-color-scheme` / `.dark` 等のテーマ分岐は見当たらず、accent も無彩（`oklch(37.1% 0 0)`）。つまりダークモードは現状非該当だが、計画・ADR に「テーマ分岐が無いため配色は単一、ダークモード考慮は不要」と1行明記すると、レビュー視点の網羅を示せる。

- **[S-003]** モック `.editor` は contenteditable div、`.title-input` は `<input>` で機序が異なる点を明記
  - 理由: 実地確認の結果、モックでは `.editor`（1065 行）が `contenteditable`、`.title-input`（981 行）が `<input>` で、両者ともグローバル `:focus-visible` を直接受ける。ステップ4 の `.editor:focus-visible { box-shadow: none }` / `.title-input:focus-visible { box-shadow: none }` という上書きはどちらも正しく機能する。計画の方針は妥当だが、「`.editor` は focus-within ではなく要素自身が `:focus-visible` を受ける（実装の wrapper とは構造が違う）」点を補記すると、実装（外側 wrapper の `focus-within` 削除）とモック（要素自身の `:focus-visible` 上書き）で手段が違う理由が明確になる。

- **[S-004]** 実装ステップの順序を「トークン先行→確認」に最適化
  - 理由: 現状ステップ1→2（エディタ/タイトル）→3（トークン細線化）→4（モック）→5（auth）→6（確認）。トークン細線化（ステップ3）はアプリ全 input に波及する根幹なので、3 を先頭に寄せて全 input 画面の見た目を確定させてから個別の caret-only（1,2）と直値追従（5）を当てる方が、確認（6）の手戻りが少ない。必須ではないが、横断トークンを先に決める順序の方がリスクが低い。

---

## 良い点

- グローバルトークンの波及経路（`tokens.css` SSOT → `@theme inline` `var()` ブリッジ → ① グローバル `:focus-visible` ② `shadow-focus` ユーティリティ）を正確に理解し、「ブリッジは `var()` 参照なので編集不要、変更点は `tokens.css` 1 箇所」と CLAUDE.md Styling 規約どおりに整理できている。
- `spec/design/tokens.md`（226 / 535 行）が SSOT のミラーで手動同期が必要、という規約上の盲点を AC-5 相当で拾えている（実地確認でも 226・535 行に 4px が存在）。
- 既存の 4px リングが透過合成で約 1.6:1 と「**既に** WCAG 2.4.11 未達」という現状の弱点を発見し、「薄くするだけは退行」と明言、不透明 accent で同時にコントラストを引き上げる方針にしている。細線化で退行させない設計判断として的確。
- caret-only 化を handwritten CSS や `@apply` に逃げず、wrapper の `focus-within:*` 削除＋ `focus-visible:shadow-none`（Tailwind ユーティリティ）で完結させており、ユーティリティファースト規約に沿う。
- `--shadow-focus` 消費者の網羅が正確（public search/TOKEN_INPUT/form、tag 入力 ×2、auth 直値、エディタ wrapper ×2）。`admin/Dashboard:94` の `0_0_0_4px` を「success ドットの装飾影で focus 無関係」と正しく除外。`focus-visible:outline-accent` の list/menu 系を `--shadow-focus` 非依存として正しくスコープ外にしている。
- #689（border 撤去）との同一 className 衝突を ADR-004 で担当クラス分離（#692=`focus-within:*`、#689=`border/rounded/p`）として明示し、`transition-[border-color,box-shadow]` を #689 側の領分として本Issueでは触らない判断も妥当。Issue 範囲を超えず、かつ漏らさない線引きができている。

---

## 検証メモ（事実確認の裏取り）

- `tokens.css:120` = `--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)` 実在。`index.css:107` ブリッジ・`174-178` グローバル `:focus-visible` 実在。
- `--color-accent: oklch(37.1% 0 0)`（`tokens.css:3`）。透過版の実効色が L≈85% という ADR の概算は方向として妥当。
- `WysiwygEditor.tsx:576` / `InlineEditor.tsx:863` に `focus-within:border-accent focus-within:shadow-focus` 実在。内側は WysiwygEditor=`[&_.ProseMirror]:focus-visible:shadow-none`、InlineEditor=`[&_:focus-visible]:shadow-none`。
- `auth/styles.ts:40` の 4px 直値は `INPUT` の `data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_4px_...]` 内（error 枠と合成）→ P-001 の根拠。
- `titleInput`（`styles.ts:15-16`）に `rounded-*` 無し・`caret-accent` 無し確認。JSDoc 12-13 行の「focus は global に委譲」記述あり（更新対象）。
- モック: `.editor`=contenteditable（1065 行）、`.title-input`=`<input>`（981 行）、`--shadow-focus` 117 行、`:focus-visible` 183-187 行、`.title-input` 467-487 行、`.editor` 706-710 行 すべて実在。
- `spec/design/tokens.md` 226・535 行に 4px 実在。
- ダークモード／テーマ分岐は `tokens.css` に見当たらず（S-002 の根拠）。
