# PR #651 レビュー — Frontend 観点（review-001）

対象: PR #651 `feat(ui): 高度なローディングUX — アップロード進捗・失敗リトライ導線・useFormStatus（#634 Phase 3）`
計画: `.issue/637/plan.md` / ADR: `.issue/637/adr.md`

## サマリー

- Blockers: 0 / Warnings: 2 / Notes: 6
- DoD 3 点（リトライ一貫化 / 進捗可視化 / `useFormStatus` 整理）はいずれも計画・ADR どおりに満たされている。
- React 19 プリミティブの使い方、状態機械の整合、a11y 二重読み上げ回避、規約5（汎用ラッパー禁止）の遵守は適切。`pnpm typecheck` / 対象テスト（54 件）/ biome check すべて green。

## Frontend

### Blockers

なし

### Warnings

- **[W-001]** ドキュメントが indeterminate アニメーションを「スライド」と記述しているが、実装は `animate-pulse` に変更済み（ADR-004 で決定）。
  場所: `docs/frontend_implementation_example.md:854`, `:861`（「`ProgressBar`（indeterminate＝スライド）」「スライドは `motion-safe:`」）
  理由: 実コード `app/components/common/ProgressBar.tsx:82` は `motion-safe:animate-pulse`（部分幅の固定バーをパルス）であり、スライド（`@keyframes` 移動）は ADR-004 で「諦める」と明記して廃止した。規約ドキュメントが実装・ADR と食い違うと、後続実装者が「スライドが正」と誤読して `@keyframes` 追加（#635 ADR-001 違反）に走るリスクがある。
  提案: 規約4b の「スライド」表記を「パルス（`Skeleton` と同じ motion 言語）」に修正し、ADR-004 を参照させる。`ProgressBar.tsx` の JSDoc 冒頭（L11「An accent segment slides left↔right across the track」）も同様にパルス表記へ揃える（L24-29 では既にパルスと正しく書かれており、同一ファイル内でも食い違っている）。

- **[W-002]** `ShareLinkGate` の `useFormStatus` 導入で prop drilling は「半分」しか解消されていない（`isPending` は依然 View へ drill されている）。
  場所: `app/components/public/ShareLinkGate/index.tsx:78-83`, `:99`, `:168-172`
  理由: ADR-003 は ShareLinkGate を「prop drilling 解消の典型ケース」と位置づけているが、送信ボタンを `SubmitButton`（`useFormStatus`）に切り出した後も `isPending` は `ShareLinkGateView` に渡され、`<input disabled={isPending || isLocked}>` / `aria-invalid` 周辺ではなく `disabled` のために消費され続けている。ボタンの pending 表示は `useFormStatus` 経由に移ったが、input の `disabled` 制御は drill された `isPending` のままで、ADR が謳う「prop drilling を解消できる」効果は限定的。これは ADR-003 の Consequences が「完全な prop 削減にはならない」と認めている範囲ではあるが、ADR 本文は ShareLinkGate を「典型ケース」と強調しているため、達成度に対する期待値ギャップがある。
  提案: 機能上の問題ではないので必須対応ではない。input の `disabled` は本来 `<form action>` 全体が pending の間も入力を止めたい意図なので、View 内をさらに子コンポーネント化して `useFormStatus` を二箇所で使う手もあるが、利が小さい。現状維持で良いが、ADR の「典型ケース」表現と実際の達成度（ボタンのみ移行）が一致しているかを記録上明確にしておくとよい。

### Notes

- **[N-001]** `ProgressBar` の a11y 設計が堅実。`decorative` モードで `role="progressbar"` を落とし `aria-hidden` にする分担が、`IngestionJobRow`（親が `aria-live="polite"`）・`UploadDialog`（常設 `role="status"` 領域）の二重読み上げを正しく回避している。determinate 時の `aria-busy` を `clamped !== 100` で落とす処理（`ProgressBar.tsx:62`）も正確で、テスト（`ProgressBar.test.tsx`「clamps out-of-range values and clears busy at 100」）でカバーされている。

- **[N-002]** `IngestionQueue` の手動 tick（「今すぐ再取得」）が既存ポーリング状態機械と競合しない設計になっている。`scheduleNowRef`（cleanup で null 化）経由で `schedule(0)` を再利用し、`inflightRef` ガードで in-flight 中の二重 fetch を抑止、`fatalRef` 時は `retryNow` 自体が早期 return かつ UI 側でも `pollFatal ? undefined` でボタン抑制。`IngestionQueue.test.tsx` のシナリオ3（fatal で永久停止・再レンダーでも復活しない）/ シナリオ5（in-flight 中の `schedule(0)` 抑止）が競合経路を網羅している。計画リスク「手動 tick と状態機械の競合」は解消済み。

- **[N-003]** `RetryableError` の `onRetry` / `error.retryable !== false` ガードが計画（ステップ4・S-002）どおり一箇所に集約され、各呼び出し側（`IngestionQueue` の fatal 時、`UploadForm`、`MediaUploader`、`IngestionJobRow`）が fatal 判定を再導出せずに済んでいる。`RetryableError.test.tsx` の forbidden（`retryable: false`）でボタン抑制するテストあり。二重送信は `isRetrying`→`disabled`+`aria-busy` で防止されている。

- **[N-004]** ルート `errorComponent` の統一が漏れなく実施されている。`grep` 上、`_app` 配下のベア実装はすべて `RouteErrorFallback` に置換され、残るは `_app/route.tsx`（`AppErrorFallback`＝シェル境界、`appShellInvalidate`）と `settings/route.tsx`（専用スタイル `SETTINGS_ERROR_*`）の 2 件のみで、いずれも ADR-002 で意図的に除外と明記された箇所。`RouteErrorFallback` のリトライが `routerInvalidate(router)`（`_app` 除外）を使い、シェル境界の `appShellInvalidate` と意味的に分離されている点も規約どおり。

- **[N-005]** `SubmitButton` の JSDoc が「`<form action>` 内でのみ使う／外では `pending` 常に false」「同一コンポーネントの `useActionState` pending には使うな」と適用範囲を明示しており、規約5・ADR-003 と整合。`disabled` を form-pending と OR 合成する設計で `ProfileForm` の保存ボタン（`avatarUpload.kind === "uploading"`）/ `ShareLinkGate`（`isLocked`）の複合条件を正しく扱えている。テストで idle ラベル・`disabled` prop・className override を確認済み。

- **[N-006]** `UploadDialog` の件数進捗（determinate）が `total === 1` ではスケルトン、複数件では `ProgressBar value={percent}` + 常設 live 領域での `done / total` 読み上げに分担され、ADR-001 の「件数のみ実数化」方針に正確に沿っている。`submitFiles` の逐次ループは `cancelledRef` ガードで dismiss 後の stale closure 書き込みを防止。`UploadDialog.test.tsx` が `2 件中 0 件 → 2 件` の進捗遷移と部分失敗（`1 件失敗`）を live 領域テキストで検証している。
