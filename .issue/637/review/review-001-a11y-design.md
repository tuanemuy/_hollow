# レビュー 001 — Accessibility・デザイン整合（PR #651 / Issue #637）

レビュー観点: a11y（role / aria-* の正しさ、aria-live 二重読み上げ回避、aria-busy、ボタンラベル、タップ領域）と、motion ガード（ADR-004）・デザイン整合（P13 / P34 / 既存 `FORM_ERROR` / `ALERT` / `pillBtn` 言語、utility-first、トークン使用）。

## Accessibility・デザイン整合

### Blockers

なし。

### Warnings

#### [W-001] `SubmitButton` が `className` を上書きしても `data-primary=""` を常に出力する — `app/components/common/SubmitButton.tsx:30-39`

`SubmitButton` の JSDoc は「Styling defaults to the primary pill; pass `className` to override.」とあるが、`<button>` には `data-primary=""` が無条件にハードコードされている（L37 付近）。`pillBtn` の primary 配色は `data-[primary]:` 変種で駆動されるため、将来 non-primary な `className`（例: surface / ghost ピル）を渡しても primary 配色が残り、「override」が部分的にしか効かない。

現状の 3 呼び出し（`SecurityForm` / `ProfileForm` の `BTN_PRIMARY`、`ShareLinkGate` の `GATE_SUBMIT`）はすべて primary ピルなので**実害は出ていない**が、`data-*` 規約（ADR-003: 静的 on は `data-x=""`、状態変化は `data-x={value || undefined}`）の観点でも、「primary でないと使えない」なら JSDoc の "override" 記述を削るか、`data-primary` を className 連動（例: primary を含むときだけ付与する prop）にするのが整合的。最小対応は JSDoc の "pass `className` to override" を「primary ピル前提」と明記すること。

#### [W-002] 進捗バーが indeterminate 状態で `aria-busy` を出すが、SR では `role="progressbar"` 経路を decorative で塞いでいる箇所との一貫性 — `app/components/common/ProgressBar.tsx:27-37`

`ProgressBar` 単体（非 decorative・indeterminate）は `role="progressbar"` + `aria-busy=true` + `aria-valuenow` 無しで、WAI-ARIA の indeterminate progressbar として**正しい**（テストも担保）。一方、実際の 2 つの利用箇所（`IngestionJobRow` / `UploadDialog`）はいずれも `decorative`（`aria-hidden`）で使い、状態は親の `aria-live` 領域のテキストに委ねている。つまり**本 PR では非 decorative な `role="progressbar"` 経路が実コードでは一度も使われていない**（テストのみ）。これは ADR-001 の「将来 determinate 拡張の口を残す」意図に沿った設計で問題はないが、`aria-busy` を出す経路が未使用デッドパスである点を将来の保守者が誤解しないよう、JSDoc に「現状の利用は全て decorative」と一文あると親切（任意）。a11y 上の欠陥ではないため Warning 止まり。

### Notes

#### [N-001] decorative ProgressBar の二重読み上げ回避は正しく機能している — `IngestionQueue.tsx:190` / `UploadDialog.tsx:535` / `IngestionJobRow.tsx:193-204`

plan.md / ADR のリスク「aria-live 二重読み上げ」への対応を実コードで確認した。
- `IngestionJobRow` の processing/pending カードの `<ProgressBar decorative />` は親 `IngestionQueue` の `<div aria-live="polite">`（L190）の内側にあり、状態は隣接テキスト（「タイトルとメタデータを解析中...」/「処理を待っています...」）が担う。バーは `aria-hidden` で二重アナウンスしない。
- `UploadDialog` の `UploadingView` は `<div role="status" aria-live="polite" className="sr-only">`（L535）が `viewStatusText`（「N件中M件をアップロード」）を読み上げ、視覚側の `<ProgressBar value={percent} decorative />` は `aria-hidden`。determinate 値（件数）も SR には live region 経由で届く。
意図通りで、ADR-001 の a11y 契約に合致している。

#### [N-002] RouteErrorFallback は AppErrorFallback とマークアップ・文言・トークンが逐語一致 — `app/components/layout/RouteErrorFallback.tsx`

`RouteErrorFallback`（子ルート用、`routerInvalidate`）と `_app/route.tsx` の `AppErrorFallback`（シェル用、`appShellInvalidate`）は、`role="alert"` + `p-6` + `h1.text-xl font-semibold mb-3` + `pre.text-sm text-ink-secondary whitespace-pre-wrap mb-4` + `再読み込み`（`pillBtn pillBtnPrimary` + `data-primary=""` + `disabled` + `aria-busy`）まで完全一致。ADR-002 の「見た目は統一、invalidate 経路だけ意味的に分離」が正しく実装され、置換対象 14 ルートのベア実装（`role="alert"` のみ・リトライ無し・余白バラバラ）が解消されている。文言は P34（公開エラーページ）ではなく内部アプリ用なので、P34 言語への準拠は不要で正しい判断。

#### [N-003] motion ガードは ADR-004 通り `motion-safe:animate-pulse` のみで新規 keyframe / トークン非追加 — `ProgressBar.tsx:619` 相当

indeterminate バーは `w-2/5 motion-safe:animate-pulse`（部分幅アクセントバーの opacity パルス）で、`tokens.css` / `index.css` への `@keyframes` 追加も `dangerouslySetInnerHTML` も無い。`prefers-reduced-motion: reduce` では静的な部分バーになる。#635 ADR-001（motion トークン非追加）と ADR-004 を遵守。determinate fill の `transition-[width] duration-300 motion-reduce:transition-none` も reduce ガード済み。テスト（`motion-safe:animate-pulse` を assert）も担保。

#### [N-004] RetryableError は既存 `FORM_ERROR` / `pillBtn` 言語に整合、retry ボタンはタップ床を維持 — `RetryableError.tsx`

エラー文言は `<p className={FORM_ERROR}>`（`text-error text-sm mt-2`）で既存インラインエラー言語に揃え、`role="alert"` を外側 div に付与。retry ボタンは `pillBtn + pillBtnSm`（`pillBtnSmDense` ではない）+ `data-sm=""` のため、base `pillBtn` の `TOUCH_TARGET`（`max-sm:min-h-[44px]`）が残り、モバイルのタップ床（§7.1 / §8）を満たす。`RefreshCw` アイコン + テキストの組合せで、アイコンは `Icon` の `label` 未指定＝装飾扱い（§7.1 a11y 契約準拠、accessible name はテキスト）。`error.retryable === false`（fatal）でボタン抑制、`isRetrying` 時 `disabled` + `aria-busy` も適切。

#### [N-005] MediaUploader の RetryableError 置換でアイコン+テキストの a11y 契約が改善 — `MediaUploader.tsx`

旧実装は `再試行` テキストのみのボタンだったが、`RetryableError` 化で `RefreshCw` アイコン併記となり、`IngestionJobRow` / `IngestionQueue` / `UploadForm` と見た目・操作・文言が一貫した。`state.lastFile !== null` のときだけ `onRetry` を渡す既存挙動も保持。DoD#4 の一貫化に資する。

#### [N-006] P13 モック（実数 % バー）との視覚乖離は ADR-001/004 で合意済みの範囲 — design 整合

P13-upload.html は `role="progressbar"` + `aria-valuenow=68` の実数バー（「OCR 中… 68%」）を描くが、バックエンドに進捗ソースが無く静的モック値である旨は調査・ADR で確定済み。実装は indeterminate パルス + 状態文言に倒しており、「進行中であることの可視化」という P13 の意図は満たす。スライド見た目の不一致は ADR-004 で明示的にトレードオフとして受容されており、的外れな指摘ではないが本 PR の責では無いため Note 止まり。
