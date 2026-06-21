# Frontend レビュー（Round 2 / フル再レビュー） — PR #769 / Issue #509（エクスポート画面 P15/P16 デザイン適用）

対象: `gh pr diff 769`（コミット `df8cc3be`）＋ **未コミットの修正作業ツリー**（`git diff`）。Round 1 の B-001/W-001/W-002 修正は作業ツリーに入っており、PR コミットにはまだ含まれていない点に注意（マージ前にコミットが要る）。

実装ファイル: `app/components/export/{styles.ts, ExportForm/*, ExportJobsList/*, ExportJobDetail/*}`, `app/components/common/{exportStatus.ts, styles.ts}`, `app/components/admin/Jobs/index.tsx`
検証: `pnpm typecheck`（緑） / `biome lint app/components/export app/components/common/exportStatus.ts`（13 files・No fixes）。

## 前ラウンド指摘の解消確認

- **[B-001 解消]** `SEGMENTED_BTN`（`styles.ts:57-58`）のフォーカス表現が `focus-visible:outline...` → `has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent` に変更済み。`<label>` が `sr-only` radio を包む構造で、`:has(:focus-visible)` が内側 radio（実フォーカス対象）のフォーカスを親 label に引き上げるため、キーボード巡回時にリングが出てマウスクリック時には出ない。ADR-007 が新設され WHY が JSDoc（`styles.ts:51-55`）にも残る。WCAG 2.4.7 充足。**適切に解消。**
- **[W-001 解消]** ローカル `PAGE_TITLE_CLASS`/`PAGE_SUBTITLE_CLASS` を削除し、`layout/styles.ts` の `PAGE_TITLE`/`PAGE_SUBTITLE` を import（`ExportForm/index.tsx:25`）。`<h2 className={PAGE_TITLE}>`（L188）/ `<p className={\`${PAGE_SUBTITLE} leading-snug\`}>`（L191）で見出しレベル維持と DRY を両立。3 画面（form/list/detail）すべて共通定数に統一。**適切に解消。**
- **[W-002 解消]** 成功メッセージの `aria-live="polite"` を bulk/single 両 footer から取り除き、`<section>` 末尾の単一箇所（`ExportForm/index.tsx:341-345`）へ集約。分岐に依らず常に 1 個・DOM 位置が安定し、Round 1 の「2 分岐への複製配置」状態より改善。意匠的にも footer 内には成功メッセージを置かない（モックの footer 左は実装に無い「推定サイズ」なので転記対象外）ため整合的。**適切に解消。**

ADR-004/006/P-001 の `exportStatusTag` 共通化も完遂を確認: `common/exportStatus.ts` に純関数が分離、`Tone` 型は `common/styles.ts:291` に `export type Tone = keyof typeof tagTone`、admin/Jobs はローカル `type Tone` を削除して共通 import に差し替え済み（`ingestionStatusTag` も共通 `Tone` を返す）。二重定義なし。

## Frontend

### Blockers

なし

### Warnings

- **[W-001]** 詳細ビューの meta グリッド先頭に「上に何もない」ハードレールが出る（`JOB_META` の dual-use 副作用）
  - 場所: `app/components/export/styles.ts:123-124`（`JOB_META` の `pt-3 mt-1 border-t border-hairline`）/ 使用 `ExportJobDetail/index.tsx:130`（`<dl className={JOB_META}>` が `<section>` 先頭）
  - 理由: `JOB_META` の `border-t` は**一覧カード**ではカード head/progress の**下に置かれる区切り線**としてモバイルモック `.job-meta { border-top }`（mobile/P16 L600）に忠実。しかし**詳細**では `<dl className={JOB_META}>` が `<section>` の最初の子（status 行が先頭 dt/dd）で、`<h1>エクスポートジョブ詳細`（Page.tsx）直下に「上に分割すべき要素が無い」ハードレールが描かれる。区切り線本来の意図（上のブロックと meta を分ける）が詳細では成立せず、見出し直下に宙に浮いた罫線が出る軽微な意匠崩れ。Round 1 N-003 が `JOB_META` の 2 用途共用には触れたが、この `border-t` の先頭出現は未指摘。
  - 影響: 機能影響なし。詳細ページ最上部にモック非準拠の罫線が 1 本増える純意匠の崩れ。
  - 提案: 詳細側では border-t を外すバリアントにする。例えば `JOB_META` から `border-t mt-1 pt-3` を分離し、一覧側でだけ付与（`<div className={\`${JOB_META} border-t border-hairline pt-3 mt-1\`}>`）、または詳細の `<dl>` に `border-t-0 pt-0 mt-0` を上書きで足す。前者（区切りを使用側へ）の方が dual-use の責務が明確。

### Notes

- **[N-001]** `FORM_NOTE`（成功メッセージ）が `formError` のエラーメッセージと縦並びで両立し得る順序になっている
  - 場所: `ExportForm/index.tsx:331-345`（`formError`×2 → `FORM_NOTE`）
  - 内容: 成功時は `setSuccess` 直前に `setError(null)`、失敗時は `success` を空に保つ実装なので、実運用で両メッセージが同時表示されることはない（排他）。DOM 上は 3 つの `<p>` が条件描画で並ぶが、live region（`aria-live="polite"`）と `role="alert"` が同時に喋ることはなく a11y 問題なし。記録のみ。

- **[N-002]** status dot 色のモック乖離（ADR-004 で意図的、Round 1 N-001 を踏襲）
  - 場所: `styles.ts:103-108`（`STATUS_DOT_COLOR`）/ `common/exportStatus.ts`
  - 内容: モック `.status` の dot 色（`queued`/`cancelled`=灰）と実装の Tone マッピング（`pending/processing`→accent、`cancelled/expired`→warning）が乖離するが、admin Jobs の `exportStatusTag` を正として二重定義を避ける ADR-004 の確定どおり。Blocker でなく承認済みトレードオフ。

- **[N-003]** スコープ・規約遵守は良好（再確認）
  - `data-*` ペア属性: 一覧の download/cancel/詳細に `data-primary`/`data-danger`/`data-ghost` + `data-sm`、詳細の download/cancel に `data-primary`/`data-danger` を漏れなく付与（ADR-003 / S-001 充足、沈黙バグなし）。
  - count `{processed}/{total}` を全 status で維持し、進捗バーは `processing && total>0` のみ別要素追加（S-002 充足）。`PROGRESS_BAR` の width のみ inline style（ADR-002 充足）。
  - P15 subtitle はモック転記＋`<code className="font-mono">` を装飾に留めリンク化せず（S-001 一線遵守）。P16 subtitle も verbatim。新規文言なし。
  - segmented active 影 `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`（ADR-005 充足）。リテラル px は `max-w-[720px]/[1100px]/[280px]`・`rounded-[7px]` のみで S-003 許容範囲。新規 CSS / `@apply` なし。
  - radio を sr-only 化しつつ `name`/`checked`/`onChange`/`disabled` 保持・`<fieldset>`+`<legend>` グルーピング、checkbox の DOM 順（FrontMatter→メディア）維持で `ExportForm.test.tsx` の `findMediaCheckbox()` 非破壊（S-004 充足）。
  - `STATUS_LABEL` の export 場所・名前を維持し `ExportJobDetail` の import 不変。

- **[N-004]** マージ前提として、Round 1 修正（B-001/W-001/W-002 + ADR-007）が**作業ツリーの未コミット差分**である点。レビューはこの差分込みで合格判断したが、コミット漏れのままだと修正が PR に乗らない。コミットを忘れないこと（指摘事項ではなく運用上の注意）。
