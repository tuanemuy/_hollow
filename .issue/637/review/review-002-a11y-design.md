# レビュー 002 — Accessibility・デザイン整合（PR #651 / Issue #637、Round 2）

Round 1（`review-001-a11y-design.md`）の修正後の再レビュー。観点: role / aria-* の正しさ、indeterminate での `aria-valuenow` 非付与、decorative の二重読み上げ回避、`alert` / `status` の使い分け、`aria-busy`、`motion-safe` / `motion-reduce` ガード、新規 keyframe / トークン非追加、P13 / P13a / P34 / 既存 `FORM_ERROR` / `ALERT` / `pillBtn` 言語との整合、utility-first。

## Accessibility・デザイン整合

### Blockers

なし。

### Warnings

なし。

### Notes

#### [N-001] Round 1 [W-001]（SubmitButton の `data-primary` 上書き問題）は適切に解消 — `app/components/common/SubmitButton.tsx:28-52`

Round 1 で指摘した「`className` を上書きしても `data-primary=""` を無条件出力する」問題に対し、`primary?: boolean`（既定 `true`）prop が追加され、`data-primary={primary ? "" : undefined}` で条件付与に変わった。`data-*` 規約（ADR-003: 静的 on は `data-x=""`、状態に応じて切り替えるものは `data-x={value || undefined}`）に整合する。JSDoc も「non-primary な `className` を渡すときは `primary={false}` を併せて渡し、`data-primary` が残って accent 配色を強制しないようにする」と override の正しい使い方を明記した。実呼び出し3箇所（`SecurityForm` の `BTN_PRIMARY` ×2、`ProfileForm` の `BTN_PRIMARY` ×2、`ShareLinkGate` の `GATE_SUBMIT`）はいずれも primary ピル（`pillBtnPrimary` = `data-[primary]:` 変種を含む）で `primary` 既定 `true` に依存しており、`data-primary=""` が正しく出力される。テスト（`SubmitButton.test.tsx`「emits data-primary by default and drops it when primary is false」）も追加され、両分岐を assert。妥当な修正。

#### [N-002] Round 1 frontend [W-001]（docs / JSDoc の「スライド」表記）も解消、ADR-004 と一貫 — `docs/frontend_implementation_example.md:854,861` / `ProgressBar.tsx:1-33`

ADR-004 は indeterminate 表現を「スライド」から Tailwind 標準 `animate-pulse` へ変更したが、Round 1 時点で docs / JSDoc 冒頭に「スライド」表記が残り食い違っていた。本 Round では docs が「`ProgressBar`（indeterminate＝部分幅バーのパルス）」「パルス（`Skeleton` と同じ motion 言語）は `motion-safe:`」へ、`ProgressBar.tsx` の JSDoc も全体がパルス表記（L11-12「Tailwind's built-in `animate-pulse` … not a custom slide keyframe」）に統一された。実コード `ProgressBar.tsx:85` の `w-2/5 motion-safe:animate-pulse` と一致し、後続実装者が「スライドが正」と誤読して `@keyframes` 追加（#635 ADR-001 違反）に走るリスクが解消されている。

#### [N-003] indeterminate / determinate の a11y 契約は引き続き正しい — `ProgressBar.tsx:56-87`

- indeterminate（既定）: `role="progressbar"` + `aria-busy="true"` で `aria-valuenow` を**付けない**。WAI-ARIA の不確定 progressbar として正しい。
- determinate: `aria-valuenow` / `aria-valuemin=0` / `aria-valuemax=100` を付与し、`aria-busy` を `clamped !== 100`（完了で false）に落とす。値は `Math.max(0, Math.min(100, value))` でクランプ。
- `decorative` モードは `role` を落とし `aria-hidden` にする。
新規 keyframe / トークン / `dangerouslySetInnerHTML` のいずれも無く、determinate fill の `transition-[width] duration-300 motion-reduce:transition-none` も reduce ガード済み。ADR-004・#635 ADR-001 を遵守。

#### [N-004] decorative ProgressBar の二重読み上げ回避は全利用箇所で正しい — `IngestionJobRow.tsx:195-205` / `UploadDialog.tsx:535,848-850` / `IngestionQueue.tsx:190`

- `IngestionJobRow` の processing / pending カードは `<ProgressBar decorative />`（`aria-hidden`）で、状態は隣接テキスト（「タイトルとメタデータを解析中...」/「処理を待っています...」）が担い、親 `IngestionQueue` の `<div aria-live="polite">`（L190）に内包される。バーは二重アナウンスしない。
- `UploadingView`（複数件）は `<ProgressBar value={percent} decorative />`（`aria-hidden`）で、件数進捗は常設の `<div role="status" aria-live="polite" className="sr-only">`（L535）が「N件中M件をアップロード」で読み上げる。determinate 値（件数）も live region 経由で SR に届き、視覚バーは装飾扱い。`total === 1` ではスケルトン、複数件のみ determinate バーという ADR-001 の「件数のみ実数化」方針に正確に沿う。
全経路で「進行状態を持つテキスト = アナウンス源」「バー = 装飾」の分担が一貫しており、plan.md / ADR のリスク「aria-live 二重読み上げ」への対応は維持されている。

#### [N-005] `alert` / `status` の使い分けは適切 — `IngestionQueue.tsx:171-178` / `RetryableError.tsx:42` / `ShareLinkGate.tsx:134`

- ポーリング失敗は `RetryableError`（`role="alert"`、即時提示すべきエラー）で、`aria-live="polite"` のジョブリスト（L190）の**外側**に置かれているため polite 領域にネストせず独立してアナウンスされる。`pollFatal`（unauthorized / forbidden）時は `onRetry={undefined}` でリトライボタンを抑制し、`retryNow` 自身も `fatalRef` で早期 return する二重ガード。
- 進行中の状態（取り込み件数・処理中文言）は `role="status"` / `aria-live="polite"` 経由で、即時エラーは `role="alert"`、という spec/design「`role="alert"`（即時エラー）/ `role="status"`（進行）」の原則に一致。`ShareLinkGate` のロックアウト通知が `role="status"` + `ALERT_WARNING`（恒久的に文脈に残す警告）なのも従来通り妥当。

#### [N-006] `RetryableError` の `aria-busy` / fatal ガード / タップ床は維持 — `RetryableError.tsx:40-56`

ボタン表示条件は「`onRetry !== undefined` かつ `error.retryable !== false`」で fatal（forbidden / unauthorized 等が `retryable: false`）を一箇所で抑制（S-002）。`isRetrying` 時に `disabled` + `aria-busy={isRetrying}` で二重送信を防止。文言は `<p className={FORM_ERROR}>`（既存インラインエラー言語）、ボタンは `pillBtn + pillBtnSm`（`pillBtnSmDense` ではない）+ `data-sm=""` で base `pillBtn` のタップ床（`max-sm:min-h-[44px]`）を維持。`RefreshCw` アイコンは `Icon` の `label` 未指定＝装飾、accessible name はテキスト「再試行」/「今すぐ再取得」。Round 1 の評価から変化なく、引き続き適切。

#### [N-007] `IngestionJobRow` の owner「再試行」ボタンと `RetryableError` のラベル衝突は a11y 上の欠陥ではない — `IngestionJobRow.tsx:252-262,291-297`

failed カードの owner 再試行ボタン（L257）と、retry 失敗時に出る `RetryableError` の「再試行」ボタン（`onRetry={lastAction}`）が同一ラベルで併存し得る。両者は別の `<button>` 要素として独立し、`RetryableError` 側は `role="alert"` 内に置かれ近接文脈（エラー文言）を持つため、SR 利用者が両者を取り違える致命的問題は無い。Test 観点レビュー（review-001-test [W-003]）がテストでの区別不足を指摘済みで、a11y 設計そのものの欠陥ではないため本観点では Note 止まり。

#### [N-008] P13 / P34 / 既存スタイル言語との整合・utility-first は維持

- `ProgressBar` のトラック / フィルは `h-1.5 rounded-pill bg-surface` / `bg-accent` で P13 の `.progress` / `.progress-bar` 言語に視覚的に揃う。実数 % バー（P13 の静的モック 68%）との乖離は ADR-001 / 004 で合意済みのトレードオフ。
- `RouteErrorFallback` は内部アプリ用フォールバックで `_app/route.tsx` の `AppErrorFallback` とマークアップ・文言・トークンが逐語一致（`role="alert"` + `p-6` + `h1.text-xl font-semibold mb-3` + `pre.text-sm text-ink-secondary whitespace-pre-wrap mb-4` + `再読み込み`（`pillBtn pillBtnPrimary` + `data-primary=""` + `disabled` + `aria-busy`））。P34（公開エラーページ）は別言語で、内部用に準拠不要という判断は正しい。
- 全 className は `app/components/common/styles.ts` / 各 `styles.ts` のトークン化済み定数 or インライン utility のみで、新規手書き CSS / `@apply` の追加は無い。utility-first 規約を遵守。

## 結論

Round 1 の 2 件（a11y [W-001] SubmitButton の `data-primary`、frontend [W-001] docs / JSDoc の「スライド」表記）はいずれも妥当に解消され、テストも追補されている。再レビューで新規の a11y / デザイン整合上の Blocker / Warning は検出されなかった。`role` / `aria-*` の正しさ、indeterminate での `aria-valuenow` 非付与、decorative の二重読み上げ回避、`alert` / `status` 使い分け、`aria-busy`、motion ガード、新規トークン非追加、P13 / P34 / 既存スタイル言語との一貫性、utility-first はすべて維持されている。本観点では承認可能。
