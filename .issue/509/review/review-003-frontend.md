# Frontend レビュー（Round 3 / フル再レビュー） — PR #769 / Issue #509（エクスポート画面 P15/P16 デザイン適用）

対象: `gh pr diff 769`（最新コミット push 済み）。
実装ファイル: `app/components/export/{styles.ts, ExportForm/*, ExportJobsList/*, ExportJobDetail/*}`, `app/components/common/{exportStatus.ts, styles.ts}`, `app/components/admin/Jobs/index.tsx`
検証: `pnpm typecheck`（緑） / `biome lint app/components/export app/components/common/exportStatus.ts`（13 files・No fixes）。

## 前ラウンド指摘の解消確認

- **[Round 2 W-001 解消]** 詳細 meta グリッド先頭の「宙吊り border-t」を解消。`JOB_META`（`styles.ts:131-132`）から `pt-3 mt-1 border-t` を切り離し、新設 `JOB_META_DIVIDER`（`styles.ts:135`）として**一覧側でのみ**付与（`ExportJobsList/index.tsx:152` `${JOB_META} ${JOB_META_DIVIDER}`）。詳細側は素の `JOB_META`（`ExportJobDetail/index.tsx:130`）で、`<dl>` が `<section>` 先頭でも上罫線が出ない。`styles.ts:122-129` の JSDoc に dual-use の責務分離（一覧＝head/progress の下に区切り線、詳細＝先頭なので付けない）が WHY 付きで残る。**適切に解消。**

Round 1 の B-001（segmented focus ring を `has-[:focus-visible]:` へ）/ W-001（`PAGE_TITLE`/`PAGE_SUBTITLE` 共通化）/ W-002（成功メッセージの単一箇所集約）、ADR-004/006/007 の共通化（`common/exportStatus.ts` 純関数 + `Tone` 型の `common/styles.ts` 一元化 + admin ローカル削除）はいずれも維持され、退行なし。

## Frontend

### Blockers

なし

### Warnings

- **[W-001]** 詳細ビューの action 行が `failed`/`cancelled`/`expired` で「空のまま border-t を描く」（Round 2 W-001 と対称の宙吊り罫線）
  - 場所: `app/components/export/ExportJobDetail/index.tsx:236-264`（`<div className={JOB_ACTIONS}>`）/ `JOB_ACTIONS` の `pt-3 border-t border-hairline`（`styles.ts:145-146`）
  - 理由: 詳細の action 行は 3 子要素すべてが条件描画で、`canDownload`（completed のみ）/ `isActive`（pending|processing のみ）/ 期限切れメッセージ（`isCompleted && isExpiredByClock`）。`failed`・`cancelled`・`expired`（および非アクティブな未完了）では 3 子とも null になるが、`<div className={JOB_ACTIONS}>` 自体は常に描画されるため、`pt-3 border-t border-hairline` の**中身ゼロの罫線付き余白 div** が `<dl>` 直下に残る。これは Round 2 W-001 で詳細の `JOB_META` 先頭罫線を解消したのと**全く同じ class の意匠崩れ**（上下が逆なだけ）。一覧側は `JOB_ACTIONS` に常に「詳細」Link があるため空にならず、詳細側にだけ残った見落とし。Round 2 のブラウザ検証 TC-003 は failed（…113）／completed（…112）を見たが、failed の空 action 罫線は px レベルで未確認のため素通りした。
  - 影響: 機能影響なし。`failed`/`cancelled`/`expired` ジョブの詳細ページ末尾にモック非準拠の罫線 + 余白が 1 ブロック増える純意匠の崩れ（実運用で頻出する 3 status で出る）。
  - 提案: action 子要素が 1 つでもあるときだけ `<div className={JOB_ACTIONS}>` を描画する（`{(canDownload || isActive || (isCompleted && isExpiredByClock)) ? (<div className={JOB_ACTIONS}>…</div>) : null}`）。Round 2 W-001 を「区切りは使用側の責務」で解いたのと同じ筋で、空の区切りブロック自体を出さないのが整合的。

### Notes

- **[N-001]** スコープ・規約遵守は引き続き良好（再確認）
  - `data-*` ペア属性: 一覧の download/cancel/詳細に `data-primary`/`data-danger`/`data-ghost` + `data-sm`、詳細の download/cancel に `data-primary`/`data-danger` を漏れなく付与（ADR-003 / S-001 充足、色が出ない沈黙バグなし）。
  - count `{processed}/{total}` を全 status で維持し、進捗バーは `processing && total>0` のみ別要素追加（一覧 `index.tsx:135-144` / 詳細 `index.tsx:151-173`、S-002 充足）。`PROGRESS_BAR` の width のみ inline style（ADR-002 充足）。
  - status チップ/dot は `exportStatusTag(status): Tone` 経由の単一マッピングで描画、`STATUS_DOT_COLOR`（`styles.ts:103-108`）は 4 系統のみ・`data-status` 多分岐なし（ADR-004 充足）。`processing` の pulse のみ status 値判定（`motion-safe:animate-pulse`）。
  - P15 subtitle はモック L671-674 を verbatim 転記＋`<code className="font-mono">「エクスポートジョブ一覧」`を装飾に留めリンク化せず（S-001 一線遵守）。P16 subtitle も verbatim。新規文言なし。
  - segmented active 影 `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`（ADR-005 充足）。focus ring は `has-[:focus-visible]:`（ADR-007 充足）。リテラル px は `max-w-[720px]/[1100px]/[280px]`・`rounded-[7px]` のみで S-003 許容範囲。新規 CSS / `@apply` なし。
  - radio を `sr-only` 化しつつ `name`/`checked`/`onChange`/`disabled` 保持・`<fieldset>`+`<legend>` グルーピング、checkbox の DOM 順（FrontMatter→メディア）維持で `ExportForm.test.tsx` の `findMediaCheckbox()` 非破壊（S-004 充足）。
  - 見出し方針: フォーム=`<h2>`（`ExportForm/index.tsx:188`）／一覧=`<h1>エクスポートジョブ`（`Page.tsx:21`）／詳細=`<h1>エクスポートジョブ詳細`・`<h1>ジョブが見つかりません`（`Page.tsx:20,30`）の文言・レベルを維持（S-002 / AppShell #502 は別 Issue）。`STATUS_LABEL` の export 場所・名前を維持し `ExportJobDetail` の import 不変。

- **[N-002]** status dot 色のモック乖離は ADR-004 の承認済みトレードオフ（Round 1 N-001 / Round 2 N-002 を踏襲）。モック `.status` dot（`queued`/`cancelled`=灰）と Tone マッピング（`pending/processing`→accent、`cancelled/expired`→warning）の乖離は、admin Jobs の `exportStatusTag` を正として二重定義を避ける確定方針。Blocker でない。

- **[N-003]** W-001 を修正する場合、一覧側（`ExportJobsList`）の `JOB_ACTIONS` は常に「詳細」Link を持つため空にならず、変更不要。修正は詳細側 1 箇所で完結する（責務の非対称性を踏まえた最小修正）。
