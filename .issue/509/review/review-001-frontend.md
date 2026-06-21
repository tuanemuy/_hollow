# Frontend レビュー — PR #769 / Issue #509（エクスポート画面 P15/P16 デザイン適用）

対象差分: `gh pr diff 769`
実装ファイル: `app/components/export/{styles.ts, ExportForm/*, ExportJobsList/*, ExportJobDetail/*}`, `app/components/common/{exportStatus.ts, styles.ts}`, `app/components/admin/Jobs/index.tsx`
検証コマンド: `pnpm typecheck`（緑） / `pnpm test:unit -- ExportForm`（4117 passed） / `biome lint app/components/export`（クリーン）

総評: スタイリングのみのスコープを概ね厳守し、ADR-001〜006 の設計判断（card-list・inline progress 幅・テキスト小ピル・`exportStatusTag` 共通化・`--shadow-xs` 合成・`Tone` 型の `common/styles.ts` 移設）は忠実に実装されている。`data-*` ペア属性も全ボタンに付与済み、count をバーに置換しない S-002 制約も守られている。ただし **segmented control のキーボードフォーカス可視化が機能しない a11y 欠陥**を 1 件検出した。

## Frontend

### Blockers

- **[B-001]** segmented control（形式 / 用紙サイズ）でキーボードフォーカスリングが出ない
  - 場所: `app/components/export/styles.ts:52`（`SEGMENTED_BTN`）/ 使用箇所 `ExportForm/index.tsx:206,255`
  - 理由: `SEGMENTED_BTN` のフォーカス表現が `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` で、これは class が当たっている `<label>` 要素に対する `:focus-visible`。しかし実際にキーボードフォーカスを受けるのは `<label>` でなく内側の `sr-only` な `<input type="radio">`（`sr-only` は `display:none` でなく可視外に飛ばすだけなのでフォーカス可能）。`<label>` 自身はタブ移動でフォーカスを受けないため、`focus-visible:outline` は発火せず、radio をキーボードで巡回したときにフォーカスリングがどこにも出ない。先例 `note/list` の `DISPLAY_SEGMENTED_BTN` は class を `<button>`（フォーカスを受ける要素そのもの）に当てているため成立しているが、本実装は label 包み + sr-only radio という別構造なので同じ書き方では成立しない。
  - 影響: 形式（HTML/Markdown/PDF）と用紙サイズ（A4/Letter）の選択がキーボードユーザーにとって現在位置不可視になる。WCAG 2.4.7 Focus Visible に抵触。
  - 補足: plan.md L199 は明確に「フォーカスリングは label 側で `focus-within:` 表現」と方式を確定していたが、実装は `focus-within:` でなく `focus-visible:` を採用しており、この plan 指示から逸脱した結果のバグ。
  - 提案: label に `focus-within:` を使う（`focus-within:outline focus-within:outline-2 focus-within:outline-accent`）か、`has-[:focus-visible]:` で内側 input のフォーカスを引き上げる（`has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent has-[input:focus-visible]:outline`）。後者の方がマウスクリック時に不要なリングが出ず望ましい。manual-test（TC-001 #5）は active/checked の追従までは確認したがフォーカス可視性は検証していないため見逃されている。

### Warnings

- **[W-001]** `PAGE_TITLE` / `PAGE_SUBTITLE` のローカル再定義（共通定数の hoisting 違反）
  - 場所: `app/components/export/ExportForm/index.tsx:41-43`（`PAGE_TITLE_CLASS` / `PAGE_SUBTITLE_CLASS`）
  - 理由: `PAGE_TITLE_CLASS` は `layout/styles.ts:127` の共通 `PAGE_TITLE` と**1 文字も違わない完全重複**。`PAGE_SUBTITLE_CLASS` も共通 `PAGE_SUBTITLE`（L130）＋ ` leading-snug` の差分のみ。一方で同 PR の `ExportJobsList/Page.tsx` と `ExportJobDetail/Page.tsx` は共通 `PAGE_TITLE`/`PAGE_SUBTITLE` を import して使っており、3 画面で扱いが割れている。CLAUDE.md Styling「反復するユーティリティ列は module-scoped 定数に集約」/ AC-8「共通 `styles.ts` 流用」に反する。
  - 補足: 見出しレベルを `<h2>` に保つ（S-002）こと自体は class 定数とは無関係（`PAGE_TITLE` は純粋なスタイル文字列で heading-level 意味を持たない）。`<h2 className={PAGE_TITLE}>` でレベル維持と DRY を両立できる。
  - 提案: ローカル 2 定数を削除し、`layout/styles.ts` の `PAGE_TITLE`/`PAGE_SUBTITLE` を import して `<h2>`/`<p>` に適用。subtitle の `leading-snug` 差分だけ `${PAGE_SUBTITLE} leading-snug` で足す（あるいは共通側 `PAGE_SUBTITLE` に寄せる）。

- **[W-002]** 成功メッセージ（`aria-live` ライブリージョン）の DOM 位置移動
  - 場所: `app/components/export/ExportForm/index.tsx:308-312, 326-330`（移動元は旧 L271 の `<section>` 末尾単一配置）
  - 理由: 旧実装は `success` の `aria-live="polite"` を `<section>` 末尾に 1 箇所だけ持っていた。本 PR で form-footer 意匠化に伴い、bulk 分岐と single 分岐の**各 footer 内に複製配置**された。本 Issue は「スタイリングのみ・DOM/ロジックを変えない」スコープ（plan L11, L49）。同時に 2 分岐が描画されることはなくライブリージョンも常に 1 個なので機能的回帰は無いが、純スタイリングの境界を越えて live region の DOM 位置を動かしている。
  - 補足: form-footer のモック意匠（送信ボタン横にメッセージ）に寄せる意図は理解できるため、致命ではない。ただしスコープ厳守の観点で一応の逸脱として記録。
  - 提案: 受容してよいが、許容するなら「意匠上 footer 内にメッセージを置くため live region を移設した」旨を 1 行コメントで残すと、後続レビューでのスコープ判定が機械的になる。

### Notes

- **[N-001]** status dot 色がデスクトップ／モバイルモックの dot 定義と乖離（ただし ADR-004 で意図的）
  - 場所: `app/components/export/styles.ts:97-102`（`STATUS_DOT_COLOR`）/ `app/components/common/exportStatus.ts`
  - 内容: モック `.status` の dot 色は `queued`(=pending)→`ink-tertiary`、`cancelled`→`ink-tertiary`（いずれも灰）だが、実装は `exportStatusTag` 経由で `pending/processing→info(accent)`、`cancelled/expired→warning` にマップする。これは ADR-004 が「admin Jobs の Tone マッピングを正とし、モックの dot 色をそのまま 6 分岐 CSS にしない（`expired` 専用色が無い・上書き順リスク回避）」と明示的に決めた結果で、二重定義回避と admin/export の将来的整合を優先した妥当なトレードオフ。よって Blocker でなく Note。レビュー観点「6 status の色分けがモックに忠実か」に対しては「モックの dot 色には忠実でないが、設計判断として承認済み」が正確な評価。

- **[N-002]** エクスポートフォームページに `<h1>` が無く `<h2>` から始まる（見出し階層ギャップ）
  - 場所: `app/components/export/ExportForm/{index.tsx:190, Page.tsx}`
  - 内容: `ExportForm` の見出しは `<h2>`、`Page.tsx` は `<main>` ラップのみで `<h1>` 不在。一覧/詳細は `<h1>`。フォームページ単体では文書が `<h2>` から始まる階層ギャップになる。ただし plan S-002 / risk 節で「`<h1>` は AppShell 化 #502 で付与、本 Issue では見出しレベルを変えない」と明示済みの既定路線であり、本 PR の責務外。記録のみ。

- **[N-003]** `JOB_META` 定数が list（meta-item div）と detail（dt/dd ペア）の 2 用途で共用される
  - 場所: `app/components/export/styles.ts:117`（`JOB_META`）/ `ExportJobsList/index.tsx:151`（`<div>` + meta-item）/ `ExportJobDetail/index.tsx:130`（`<dl>` + dt/dd 直下子）
  - 内容: `grid grid-cols-2 ... lg:grid-cols-[auto_1fr]` は、list では「meta-item div を 2 列に並べる」、detail では「dt|dd の key/value 表」として両方とも破綻なく描画される（モバイル 2 列 grid に dt/dd 交互を流すと key|value の行になる）。意匠的には妥当だが、JSDoc が「2-column on mobile」とだけ書かれ 2 用途の差異に触れていないため、将来の改修で片方を壊しやすい。可読性向上のため doc に「list=meta-item / detail=dt-dd」の使い分けを 1 行追記推奨。機能上の問題なし。

- **[N-004]** スコープ・規約の遵守は良好
  - `data-*` ペア属性（`data-primary`/`data-danger`/`data-ghost`/`data-sm`）は list/detail/form の全ピルボタンと詳細 Link に漏れなく付与（S-001 / ADR-003 充足、沈黙バグなし）。
  - count `{processed}/{total}` を全 status で維持し、進捗バーは `processing && total>0` 時のみ別要素追加（S-002 充足、`styles.ts:113` PROGRESS_BAR の幅のみ inline style = ADR-002 充足）。
  - P15 subtitle はモック L671-674 を verbatim 転記、`<code>` は `font-mono` 装飾のみでリンク化していない（S-001 一線を遵守）。P16 subtitle も モック L780 verbatim。新規文言の創作なし。
  - `exportStatusTag` の `common/exportStatus.ts` 切り出し・`Tone` 型の `common/styles.ts` への移設・admin/Jobs ローカル定義削除と import 差し替え（ADR-004/006）はすべて計画どおり。`processing` の pulse は status 値で個別判定。
  - segmented active 影は `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`（ADR-005 充足、生 rgba ベタ書き回避）。
  - リテラル px は `max-w-[720px]/[1100px]/[280px]`・`rounded-[7px]`・`text-[15px]/[1...]` のみで、いずれも S-003 で許容された意匠固有値 or 既存先例（DISPLAY_SEGMENTED_BTN の rounded-[7px]）。新規 CSS ファイル・`@apply` なし。
  - radio を sr-only 化しても `name`/`checked`/`onChange`/`disabled` を保持し `<fieldset>`+`<legend>` でグルーピング（ネイティブ radio セマンティクス維持、`role="radiogroup"` 手書き不要）。checkbox は DOM 順（FrontMatter→メディア）維持で `ExportForm.test.tsx` の `findMediaCheckbox()` 非破壊（S-004 充足、テスト 4117 緑）。
