# レビュー 001 — Frontend 層（PR #782 / Issue #580）

観点: React 19/RSC・コンポーネント・状態管理・ポーリング・UX・styling。
対象: `app/components/tag/{MergeTagDialog,TagList,TagActions,actions,styles,schema}` と
`spec/design/pages/P18-merge-tag-dialog.html`。規範 `app/components/export/ExportJobDetail/`、
`app/components/ingestion/IngestionQueue.tsx`、`app/components/common/{ProgressBar,routerInvalidate}`。
plan ステップ 9–12 / ADR-004・005・006・007(item4)・008 と照合。

総評: 設計（ADR-004/005/006/007/008）にほぼ忠実で、ポーリングのクリーンアップ・0除算ガード・
認可・楽観整合は正しい。Blocker は無い。離脱／一過性エラー時のレジリエンスと a11y/視覚の細部に
Warning / Note が数点。

---

## Frontend

### Blockers

なし。

主要な健全性は確認済み:

- **ポーリングのクリーンアップ正当**: `MergeTagDialog.tsx:89-136` の effect は
  `cancelled` フラグ + `inFlight` ガード + `clearTimeout(timer)` を備える。await 後は毎回
  `if (cancelled) return;` で unmount 後の setState を抑止。完了/失敗で `cancelled=true` にし
  `setTimeout` を再スケジュールしない（リーク・無限ポーリング無し）。`document.visibilityState`
  が hidden の間は fetch をスキップしつつ timer は再スケジュールしてポーリングを生かす（export と同形）。
- **effect deps が安全**: deps は `[jobId, poll]`。`poll = useServerFn(getTagMergeJobFn)` は
  `useCallback(fn, [router, serverFn])`（`node_modules/@tanstack/react-start/.../useServerFn.js`）で
  module 直下の関数 + 安定 router を包むため**参照安定**。`jobId` は `null → id` の一度きり遷移。
  毎レンダーで effect が張り直されてポーリングが暴発する懸念は無い。親コールバックは
  `onMergedRef/onCloseRef`（deps 無しの ref 同期 effect, line 60-65）に逃がしており、deps を
  最小に保つ良い設計。
- **determinate / 0除算**: `determinate = hasProgress && total > 0`（line 138）で `total===0` を
  除外し、`pct` は `total>0` の枝でのみ算出（line 139-141）。`Math.min(100, …)` で上限クランプ。
  total 未確定（pending）は indeterminate バー（`aria-busy`、`aria-valuenow` 無し）へフォールバックし、
  確定後に determinate へ切替（ProgressBar / mock と整合）。
- **determinate progressbar の a11y 基本形**: `role="progressbar"` + `aria-valuemin=0` +
  `aria-valuemax={total}` + `aria-valuenow={processed}`（line 162-169）。AC-4 の要求どおり。
- **認可（AC-8）**: `getTagMergeJobFn`（`actions.ts:74-90`）は `requireCurrentUser()` の
  `user.id` を `actorUserId` として usecase へ渡し、`getTagMergeJob` が `assertOwnedBy` を必須実行
  （`getTagMergeJob.ts`）。クライアント state の `jobId` を直接ポーリングしても他オーナーのジョブを
  id 推測で読めない（IDOR 防止、`getExportJob` 同形）。
- **入力検証**: `getTagMergeJobSchema = { jobId: string().min(1) }`（`schema.ts:19-21`）で transport
  境界を検証、`inputValidator(validateInput(...))` 経由（`actions.ts:76`）。`serverData` に外部入力を
  流す箇所なし。
- **楽観整合（ADR-005）**: enqueue 時の即時楽観削除を撤去。`TagList.onMerged`（`TagList.tsx:159-163`）
  は完了検知時のみ `routerInvalidate` を `startMutation` 内で呼ぶ。`useOptimistic` reducer
  （create/rename/delete）は無改変（line 154-158 のコメントどおり）。失敗時はタグが残り
  ダイアログ内にエラー（テスト `TagList.test.tsx` の 3 ケースで担保）。
- **GET ポーリングは確立パターン**: `IngestionQueue.tsx` / `IngestionQueueBadge.tsx` が
  `getIngestionJobsFn`(GET) を setTimeout + visibilityState で直接ポーリング済み。GET server fn を
  ポーリングする手法自体は前例ありで問題なし（→ N-003 で no-store 維持のみ確認推奨）。
- **ADR-007 item4 準拠**: `POLL_INTERVAL_MS = 1500`（export の 3000 とは別）+ 即時 `void tick()`
  （line 131）。ADR の意図どおり。

### Warnings

- **[W-001] 実行中に「閉じる」するとジョブ完了が一覧へ反映されず、ソースタグが残留**
  — `MergeTagDialog.tsx:228-230`（閉じるボタン）+ `TagList.tsx:159-163`（onMerged）。
  実行中の「閉じる」は `onClose → setIsMergeOpen(false) → MergeTagDialog unmount → effect cleanup`
  でポーリングを止める。ジョブはバックグラウンドで完走しソースタグはサーバ側で削除されるが、
  `onMerged`（= `routerInvalidate`）は完了ポーリングでしか呼ばれないため発火せず、一覧は
  次の navigation / 別の tag 操作まで**削除済みソースタグを表示し続ける**（ローダ baseline が古いまま）。
  ADR-005 は「完了駆動で反映」を前提にするが、その駆動点（開いたままのポーリング）を閉じる操作が外す。
  提案: 実行中に閉じたら `onClose` 側で `routerInvalidate` を一度呼んで baseline を更新する、
  あるいは「実行中は閉じても良いが完了反映は次回更新時」と割り切るなら plan/ADR に明記する。

- **[W-002] ポーリング中の一過性エラーで即座に打ち切り＋誤エラー表示**
  — `MergeTagDialog.tsx:116-122`。`poll` の catch で**初回エラーでも** `cancelled=true` にして
  `setErrorMessage` する。規範の `IngestionQueue.tsx:108-123` は transient（非 fatal kind）を
  `failuresRef` で 3 回まで許容してから surface し、fatal（unauthorized/forbidden）のみ即停止する。
  本実装は単発のネットワーク瞬断でもポーリングを永久停止し「失敗」を表示する一方、バックグラウンドの
  ジョブは無事に完走しうる（結果矛盾）。`isRunning` が false に落ちてフォームが再表示され、
  ユーザーが再 submit すると ADR-006 のとおり冪等だが**二重ジョブが走り**、UX 上は不要なエラー体験。
  提案: 少なくとも transient エラーは数回リトライしてから surface する（IngestionQueue 同形）。
  完了/失敗ステータス受信時のみ確定的に停止する方が AC-6 の体感に合う。

- **[W-003] 進捗ポーリングに上限（give-up / タイムアウト）が無い**
  — `MergeTagDialog.tsx:89-136`。ジョブが `processing` で固着し再配信もされない（worker 異常）と、
  ダイアログは 1.5s 間隔で**無期限にポーリング**し続け「統合しています…」のまま。キャンセル UI は
  スコープ外（plan）なので唯一の脱出は「閉じる」だが、それは W-001 を誘発する。export には
  キャンセルがある。最低限、長時間 processing が続く場合に「時間がかかっています」等の停滞表示や
  give-up 上限を検討する価値がある（スコープ判断なら Note 化で可）。

### Notes

- **[N-001] progressbar を common/ProgressBar で再利用せず手書き、determinate 枝で `aria-busy` を欠く**
  — `MergeTagDialog.tsx:157-182`。`common/ProgressBar.tsx` は determinate 時 `aria-busy = clamped !== 100`
  を出すが、本実装の determinate 枝（line 162-169）は `aria-busy` を持たない。再利用しなかったのは
  mock 指定のトラック高 `h-1`(4px) と ProgressBar の `h-1.5`(6px) の差・indeterminate↔determinate
  切替の都合があり妥当だが、a11y ロジックが二重化している。`aria-busy={pct !== 100}` を足すか、
  ProgressBar 側に高さ可変を入れて寄せると重複が減る。

- **[N-002] 進捗カウントの数字書体が mock と不一致**
  — `MergeTagDialog.tsx:159` は `font-mono`、mock `.progress-live`
  （`P18-merge-tag-dialog.html:255`）は `font-variant-numeric: tabular-nums`（mono ではない）。
  export 詳細は `font-mono` なので統一感はあるが、SSOT の mock とは差異。どちらかへ寄せる。

- **[N-003] GET server fn のレスポンスが非キャッシュであることに依存**
  — `actions.ts:74`。同一 `jobId` への GET をポーリングするため、レスポンスがブラウザ/CDN に
  キャッシュされると進捗が更新されない理屈上のリスク。ただし `IngestionQueue` の GET ポーリングが
  既に実運用で成立しており、TanStack Start の server fn 応答が no-store である前提で問題は出ていない。
  動作確認（ADR-008 のブラウザ検証）でバーが完了まで進むことが確認できていれば実害なし。新規対応不要、
  no-store 維持の確認のみ。

- **[N-004] mock が indeterminate（受付直後 / total 未確定）状態を可視化していない**
  — `P18-merge-tag-dialog.html`。CSS（`.progress-bar` の pulse）は定義済みだが、サンプルは
  determinate（3/8）のみ。実装は `total===0` で indeterminate を描くため、mock にもその一瞬の状態見本を
  並べると SSOT がより忠実（任意）。determinate へ更新し D 先送りコメントを解消した点・aria 値・width%
  は実装と整合しており主旨は満たす。

- **[N-005] 進捗カウントが aria-live 領域外**
  — `MergeTagDialog.tsx:159`。`{processed}/{total}` のテキストは live region でないため、SR は
  `aria-valuenow` 更新に依存して進捗を知る。export も同様で一貫しており許容範囲。エラー文（line 221-225）は
  `role="alert" aria-live="polite"` で適切に通知される。

- **[N-006]（参考・良い点）** `TagActions.tsx:216-226` は `isMergeOpen` の時だけ `MergeTagDialog` を
  mount し、閉じれば unmount → effect cleanup が確実に走る。ポーリング state（jobId/processed/total）が
  ダイアログ再オープンで自然リセットされる構造で、状態の取り回しは素直。
</content>
</invoke>
