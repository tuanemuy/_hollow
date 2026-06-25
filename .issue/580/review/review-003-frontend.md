# レビュー 003 — Frontend 層（PR #782 / Issue #580）— Round 3（最終収束確認）

観点: Round 1/2 で入った全修正（transient budget / give-up / handleClose / tabular-nums）が
最新 push（3 コミット: `4f5f8d55` / `c4eddb3b` / `72e2f7cc`）に確実に残り、ポーリングの
cleanup を壊していないか。determinate progressbar の aria/width/0除算ガード・visibilityState・
`useOptimistic` 無改変・認可（actorUserId）が維持されているか。styling 規約準拠か。
新規 Blocker / Warning のみを挙げ、ADR-009/010 で見送り記録済みの限界は蒸し返さない。

対象: `app/components/tag/{MergeTagDialog,TagList,actions,styles}` ／ 現ブランチ
`issue/580/tag-merge-async-progress` は PR head と一致（3 コミット反映済み）。

総評: **Round 1/2 の全修正が最新差分に確実に残存し、リグレッションは無い。
新規 Blocker / Warning は無い。収束済み・APPROVE 可。**

---

## Frontend

### Blockers

なし。

### Warnings

なし。

最終収束の検証（いずれも確認済み・リグレッション無し）:

- **transient budget 残存** — `MergeTagDialog.tsx:45,121-123,160-169`。`MAX_TRANSIENT_FAILURES=3`。
  catch は `unauthorized`/`forbidden` を fatal として即停止、それ以外は `failures+=1` で budget 未満なら
  fall-through 再スケジュール、成功で `failures=0` リセット（line 139）。`IngestionQueue` と同形。
- **give-up 残存・cleanup 非破壊** — `MergeTagDialog.tsx:40,124-133,200-210`。各 tick 冒頭で
  `Date.now()-startedAt >= POLL_GIVE_UP_MS(120s)` を判定し、超過で `cancelled=true`+`setGaveUp(true)`
  して **再スケジュールせず return**。`gaveUp` は `errorMessage` を立てないため `isRunning` 維持＋非エラー
  文＋バー非表示（`gaveUp ? null : …`、line 211）。脱出は「閉じる」→ `handleClose` best-effort 反映。
- **handleClose 残存・全クローズ経路に配線** — `MergeTagDialog.tsx:91-94`。`isRunning` の時のみ
  `onMergedRef.current()` を 1 回呼んでから `onClose()`。Dialog の `onClose`（overlay/Esc 含む, line 192）と
  クローズボタン（line 282）双方に接続。完了経路は effect が `onMergedRef()`+`onCloseRef()` を直接呼び
  （line 145-146）handleClose を経由しないため二重 invalidate なし。
- **tabular-nums 残存** — `MergeTagDialog.tsx:213` `tabular-nums text-sm text-ink-secondary`。Tailwind 組込
  ユーティリティで utility-first 準拠、mock `.progress-live` と整合。
- **ポーリング cleanup 健全** — `MergeTagDialog.tsx:180-183` の cleanup は `cancelled=true`+`clearTimeout`。
  完了/失敗/fatal/budget 超過/give-up の各終端は return 前に `cancelled=true` を立て再スケジュールしない。
  await 後は毎回 `if (cancelled) return;`（line 138/155/174）。`inFlight` ガード（line 134）で重複 poll なし。
  effect deps `[jobId, poll]`（line 184）は再入しない（`jobId` は `null→id` 一度きり、`poll` は `useServerFn`
  で参照安定）ため effect ローカル変数方式が安全に成立。
- **determinate aria/width/0除算** — `MergeTagDialog.tsx:186-189`。`determinate = hasProgress && total>0` で
  0除算を排除、`pct = Math.min(100, …)` で上限クランプ。`role="progressbar"`+`aria-valuemin/max/now`（216-222）、
  width は inline `style`（line 224）で動的供給。total 未確定は indeterminate（`aria-busy`、line 228-235）へフォールバック。
- **visibilityState** — `MergeTagDialog.tsx:134` `document.visibilityState !== "hidden"` で hidden タブの fetch を抑止
  （timer は再スケジュールしポーリングを生かす）。
- **useOptimistic 無改変** — `TagList.tsx:153-162` `onMerged` は `startMutation` 内で `routerInvalidate` のみ。
  `useOptimistic` reducer（create/rename/delete）は無改変、enqueue 時楽観削除なし（ADR-005）。
- **認可（actorUserId）維持** — `actions.ts:74-90` `getTagMergeJobFn` は `requireCurrentUser()` の `user.id` を
  `actorUserId` として usecase へ渡し `assertOwnedBy` を必須実行（IDOR 防止、`getExportJob` 同形）。
- **styling 規約準拠** — `styles.ts:16-33` の `progressTrack`/`progressBar`/`progressBarIndeterminate` は
  module-scoped 文字列定数（utility-first）、トークン参照（`bg-accent`/`rounded-pill`/`bg-surface`）。新規 CSS なし。

### Notes

- 既出 Note（ADR-009/010 で見送り記録済み）は蒸し返さない。新規 Note なし。
