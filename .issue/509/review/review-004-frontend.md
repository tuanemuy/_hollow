# Frontend レビュー（Round 4 / フル再レビュー） — PR #769 / Issue #509（エクスポート画面 P15/P16 デザイン適用）

対象: `gh pr diff 769`（最新コミット push 済み）。
実装ファイル: `app/components/export/{styles.ts, ExportForm/*, ExportJobsList/*, ExportJobDetail/*}`, `app/components/common/{exportStatus.ts, styles.ts}`, `app/components/admin/Jobs/index.tsx`
検証: `pnpm typecheck`（緑） / `biome lint app/components/export app/components/common/exportStatus.ts`（13 files・No fixes applied）。

## 前ラウンド指摘（Round 3 W-001）の解消確認 — 厳密検証

Round 3 W-001（詳細ビューの action 行が `failed`/`cancelled`/`expired` で「空のまま border-t を描く」宙吊り罫線）は**適切に解消**された。

`ExportJobDetail/index.tsx:236` でラッパ div を条件描画化:

```
{canDownload || isActive || (isCompleted && isExpiredByClock) ? (
  <div className={JOB_ACTIONS}>
    {canDownload ? <button …>ダウンロード</button> : null}        // L238
    {isActive ? <button …>キャンセル</button> : null}              // L249
    {isCompleted && isExpiredByClock ? <p …>有効期限切れ…</p> : null} // L260
  </div>
) : null}
```

### ラッパ条件 ⇔ 3 子条件の完全一致を厳密に確認（取りこぼし・過剰抑止なし）

子要素の描画条件（部分集合）とラッパ条件（和集合）を論理的に突き合わせた:

- 子の和集合 = `canDownload ∪ isActive ∪ (isCompleted && isExpiredByClock)`
- ラッパ条件 = `canDownload || isActive || (isCompleted && isExpiredByClock)`
- **両者は字面・論理ともに完全一致**。ラッパが真 ⇔ 子が 1 つ以上描画される、で過不足ゼロ。

各定義（L55-61）を展開して網羅性も確認した:
- `isActive = pending || processing`
- `isCompleted = (status === "completed")`
- `isExpiredByClock = isCompleted && expiresAt!==null && parse(expiresAt)<=now`
- `canDownload = isCompleted && !isExpiredByClock`

ラッパを展開すると `(isCompleted && !isExpiredByClock) || isActive || (isCompleted && isExpiredByClock)`。第1項と第3項は `isCompleted` の `!isExpiredByClock` / `isExpiredByClock` で相補的に分割されており、和は `isCompleted`（期限切れか否かを問わず completed なら必ず真）に縮約される。よってラッパ = `isCompleted || isActive`。

これを 6 status × 期限切れ有無で全網羅検証:

| status | isActive | isCompleted | ラッパ | 描画される子 | 判定 |
|---|---|---|---|---|---|
| pending | ○ | × | **○** | キャンセル | 子あり＝ラッパ要・正 |
| processing | ○ | × | **○** | キャンセル | 子あり＝ラッパ要・正 |
| completed（未期限切れ） | × | ○ | **○** | ダウンロード | 子あり＝ラッパ要・正 |
| completed（期限切れ） | × | ○ | **○** | 期限切れメッセージ | 子あり＝ラッパ要・正 |
| failed | × | × | **×** | なし | 子なし＝ラッパ非描画・正 |
| cancelled | × | × | **×** | なし | 子なし＝ラッパ非描画・正 |
| expired | × | × | **×** | なし | 子なし＝ラッパ非描画・正 |

全 7 ケースで「ラッパ描画 ⇔ 子が 1 つ以上存在」が成立。**取りこぼし（子があるのに罫線が消える）も過剰抑止（子があるのに枠ごと消える）も無い**。

補足: `completed（期限切れ）` ケースは `canDownload=×` だが `isCompleted && isExpiredByClock=○` で第3子（期限切れメッセージ）が描かれ、ラッパも真。Round 3 で懸念された「3 子とも null になる failed/cancelled/expired」では確実にラッパごと消える。一覧側（`ExportJobsList`）は `JOB_ACTIONS` 内に常に「詳細」Link を持つため空にならず、修正対象は詳細側 1 箇所のみで完結（Round 3 N-003 の責務非対称性の通り）。

また `failed`/`cancelled`/`expired` の詳細ページは action 行が消えても `<dl>` 側に「ステータス」「形式 / スコープ」「作成日時」等の meta が必ず残り、`errorReason` があれば `FAIL_SUMMARY`（L205-212）も出るため、空ページにはならない（情報欠落なし）。

Round 2 W-001（`JOB_META` 先頭の宙吊り border-t を `JOB_META_DIVIDER` 分離で一覧専用化）/ Round 1 の B-001（segmented focus ring を `has-[:focus-visible]:` へ）/ W-001（`PAGE_TITLE`/`PAGE_SUBTITLE` 共通化）/ W-002（成功メッセージ集約）も維持され、退行なし。今回 Round 3 W-001 の修正が他の状態バリアント（progress 表示・error 表示・meta）に副作用を与えていないことも確認した。

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Round 3 W-001 修正の `JOB_ACTIONS` ラッパ条件は子 3 要素の和と論理完全一致で、6 status 全網羅で過不足ゼロ（上表）。`JOB_ACTIONS`（`styles.ts:145-146`）は `pt-3 border-t border-hairline` を持つため、空描画されると宙吊り罫線になるが、条件描画で完全に抑止されている。良好。

- **[N-002]** スコープ・規約遵守は引き続き良好（再確認）。
  - **`data-*` ペア属性（S-001 / ADR-003）**: 一覧 download=`data-primary`+`data-sm`、cancel=`data-danger`+`data-sm`、詳細 Link=`data-ghost`+`data-sm`（`ExportJobsList/index.tsx:170-200`）。詳細 download=`data-primary`、cancel=`data-danger`（`ExportJobDetail/index.tsx:242,254`）。色がバリアント側にあるボタンへペア属性を漏れなく付与（色が出ない沈黙バグなし）。
  - **count / progress 棲み分け（S-002 / ADR-002）**: 一覧は `COUNT_CELL` の `{processed}/{total}` を全 status で常時描画し、進捗バーは `processing && total>0` のみ別要素追加（`index.tsx:135-144`）。詳細は `showProgressBar`（processing && total>0）→ バー、`showProcessingPending`（processing && total===0）→「処理待ち」、それ以外 → count、の 3 分岐（`index.tsx:151-172`）で count をバーに置換せず。`PROGRESS_BAR` の width のみ inline style。
  - **status チップ/dot（ADR-004）**: `exportStatusTag(status): Tone` 経由の単一マッピングで描画。`STATUS_DOT_COLOR`（`styles.ts:103-108`）は info/success/warning/error の 4 系統のみで `data-status` 多分岐なし。`processing` の pulse のみ status 値判定（`motion-safe:animate-pulse`）。
  - **P15 segmented**: 形式（html/markdown/pdf）・用紙サイズ（A4/Letter, `format==="pdf"` 時のみ）を `<fieldset>`+`<legend>` でグルーピング、active を `data-active={format===v || undefined}`（falsy で属性消滅）。ネイティブ radio は `sr-only` で `name`/`value`/`checked`/`onChange`/`disabled` 保持。focus ring は `has-[:focus-visible]:`（ADR-007）。active 影は `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`（ADR-005, `--shadow-xs` トークン合成）。
  - **subtitle 転記（S-001/S-002）**: P15 は `<code className="font-mono">エクスポートジョブ一覧` を装飾に留めリンク化せず（`index.tsx:191-196`、一線遵守）。P16 は verbatim（`Page.tsx:22-25`）。新規文言なし。
  - **見出し方針（S-002）**: フォーム=`<h2>`（`ExportForm/index.tsx:188`、`エクスポート（一括）`/`エクスポート`）／一覧=`<h1>エクスポートジョブ`（`Page.tsx:21`）／詳細=`<h1>エクスポートジョブ詳細`・`<h1>ジョブが見つかりません`（`Page.tsx:20,30`）の文言・レベルを維持。`STATUS_LABEL` の export 場所・名前を維持し `ExportJobDetail` の import 不変。
  - **リテラル px / 新規 CSS**: `max-w-[720px]/[1100px]/[280px]`・`rounded-[7px]` のみで S-003 許容範囲。新規 CSS ファイル・`@apply` なし。max-width はトークン化されない意匠固有値（`--container-max=1280px` と不一致）で `styles.ts` に集約（`EXPORT_MAIN_FORM`/`_LIST`）。
  - **レスポンシブ（AC-7）**: form-footer は `max-sm:flex-col-reverse max-sm:items-stretch`、job-card は mobile カード＋`lg:grid-cols-[auto_1fr]` 横並び、job-actions は `max-sm:[&_>_*]:flex-1` で全幅化。overflow を誘発する固定幅なし。
  - **a11y**: progress バーに `role="progressbar"`+`aria-valuemin/max/now`（詳細 `index.tsx:156-164`）、status dot に `aria-hidden`、errorReason に `role="alert"`、success に `aria-live="polite"`、期限切れメッセージに `role="status"`。

- **[N-003]** status dot 色のモック乖離は ADR-004 の承認済みトレードオフ（Round 1〜3 N 系を踏襲）。モック `.status` dot（`queued`/`cancelled`=灰、`expired` 専用色なし）と Tone マッピング（`pending/processing`→accent、`cancelled/expired`→warning）の乖離は、admin Jobs の `exportStatusTag` を正として二重定義を避ける確定方針。Blocker でない。

- **[N-004]** AC-5（詳細は別ルート `/exports/$jobId` 維持）/ AC-6（P15 ページ型維持・モーダル化せず）は構造改変なしで満たされている。ページネーション導線がモック・実装双方に無い（offset は loader 処理）点も plan の通り対象外で、欠落ではない。
