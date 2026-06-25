# レビュー 002 — Frontend 層（PR #782 / Issue #580）— Round 2（収束確認）

観点: Round 1 で入った修正（transient budget / give-up / handleClose / tabular-nums）が
正しく実装され、**ポーリングの cleanup（unmount・完了・失敗・give-up での interval 解除）を
壊していないか**、リーク・二重スケジュール・stale closure・fatal 判定・give-up 導線・determinate
バー・styling 規約を厳しく確認。
対象: `app/components/tag/{MergeTagDialog,TagList,TagActions,actions,styles,schema}` と
`app/components/tag/__tests__/TagList.test.tsx`、`spec/design/pages/P18-merge-tag-dialog.html`。
規範 `app/components/{export/ExportJobDetail,ingestion/IngestionQueue}`。
ADR-004/005/006/007/009/010 と照合。

総評: **Round 1 の W-001/W-002/W-003/N-002 は全て正しく解消され、ポーリングの cleanup・0除算・
visibilityState・useOptimistic 無改変・認可は維持されている。新規 Blocker / Warning は無い。**
収束。残りは将来の任意改善（Note）のみ。

---

## Frontend

### Blockers

なし。

### Warnings

なし。

Round 1 指摘の修正検証（いずれも正しく、リグレッション無し）:

- **[W-001 解消] 実行中クローズの best-effort 反映** — `MergeTagDialog.tsx:91-94, 192, 282`。
  `handleClose` は `isRunning` の時のみ `onMergedRef.current()`（= 親 `routerInvalidate`）を1回呼んで
  から `onClose()`。Dialog の `onClose`（overlay/Esc 含む）と「閉じる」ボタン双方に配線済み。
  非実行時（フォーム状態）は `onMerged` を呼ばず spurious invalidate 無し。テスト
  `TagList.test.tsx:621-652`（W-001）で `processing` 中クローズ → `routerInvalidate` 発火を担保。
  **完了経路は handleClose を経由せず** effect が `onMergedRef()` + `onCloseRef()`（raw onClose）を
  直接呼ぶため（line 145-147）、完了時の二重 invalidate は構造的に発生しない（正しい設計）。

- **[W-002 解消] transient budget / fatal 即停止** — `MergeTagDialog.tsx:154-172`。catch は
  `unauthorized`/`forbidden` を fatal として即 surface + 停止、それ以外は `failures` を加算し
  `MAX_TRANSIENT_FAILURES=3` 未満なら **return せず fall-through して再スケジュール**（成功で
  `failures=0` リセット, line 139）。規範 `IngestionQueue.tsx:108-123` と完全同形。fatal kind は
  `errorResponse.ts:37-47` の SerializedError union に実在し妥当。自ジョブ polling では
  owner mismatch は起きないため、fatal は実質「セッション失効 → unauthorized」を捕捉する正しい選択。
  `notFound`/`conflict`/`system` 等を transient 扱いするのも IngestionQueue と一致（3回で surface）。
  テスト `TagList.test.tsx:571-619`（単発 blip 非 surface / unauthorized 即 surface）で両分岐を担保。

- **[W-003 解消] give-up 上限（非エラー打ち切り）** — `MergeTagDialog.tsx:127-133, 200-210`。
  各 tick 冒頭で `Date.now() - startedAt >= POLL_GIVE_UP_MS(120s)` を判定し、超過で
  `cancelled=true` + `setGaveUp(true)` して **return（再スケジュールしない）**。`gaveUp` は
  `errorMessage` を立てないため `isRunning` を維持し、`fail` ではなく「時間がかかっています…
  閉じても問題ありません」の非エラー文 + バー非表示（`gaveUp ? null : …`）を表示。脱出は「閉じる」
  → `handleClose` で best-effort 反映。ADR-009 と一致。導線破綻無し。

- **[N-002 解消] tabular-nums** — `MergeTagDialog.tsx:213` の進捗カウントは
  `tabular-nums text-sm text-ink-secondary`。mock `.progress-live`
  （`P18-merge-tag-dialog.html:255`）の `font-variant-numeric: tabular-nums` と一致。
  Tailwind 組込 `tabular-nums` ユーティリティで utility-first 規約準拠。

**cleanup / リーク / 二重スケジュール / stale closure の健全性（重点確認・問題なし）**:

- effect deps は `[jobId, poll]`（line 184）。`jobId` は `null → id` の一度きり遷移、`poll` は
  `useServerFn` で参照安定。よって effect は再入せず、`cancelled`/`inFlight`/`timer`/`failures`/
  `startedAt` を **effect ローカル変数**で持つ設計が安全に成立（IngestionQueue の ref 方式とは
  異なるが、再入しない本ダイアログでは等価で正しい）。re-submit 時のみ新 jobId で effect 再走し
  全ローカルが再初期化される。
- cleanup（line 180-183）は `cancelled=true` + `clearTimeout(timer)`。完了/失敗/fatal/budget 超過/
  give-up の各終端は `cancelled=true` にして **return 前に再スケジュールしない**ため、interval は
  確実に止まる。await 後は毎回 `if (cancelled) return;`（line 138, 155, 174）で unmount 後の
  setState を抑止。
- 二重スケジュール無し: tick は初回 `void tick()`（line 179）+ 各 tick 末尾の単一 `setTimeout` 連鎖。
  `inFlight` ガード（line 134）で poll 重複も防止。
- TagActions は `isMergeOpen` の時だけ `MergeTagDialog` を mount（`TagActions.tsx:216-226`）するため、
  クローズ = unmount → cleanup が確実に走り、再オープンで state が自然リセット。

### Notes

- **[N-001] determinate 枝の `aria-busy` 欠如は mock 整合で許容（Round 1 N-001 の追認）**
  — `MergeTagDialog.tsx:216-223`。`common/ProgressBar` は `aria-busy={clamped!==100}` を出すが
  本実装の determinate 枝は持たない。ただし mock の determinate progressbar
  （`P18-merge-tag-dialog.html:400-407`）も `aria-busy` を持たないため、**実装は SSOT mock に
  整合**しており現状で妥当。再利用統一を狙うなら `aria-busy={pct!==100}` を足してもよいが必須でない。

- **[N-002] give-up クロックが hidden タブ時間も壁時計で計上**
  — `MergeTagDialog.tsx:124, 129`。`startedAt` は固定で、tab を 2 分以上バックグラウンドにすると
  正常進行中のジョブでも give-up 表示（「時間がかかっています」）へ落ちうる。非エラーで
  「完了は一覧に反映」と案内し、`handleClose`/次回 navigation で反映されるため実害は小さい。
  必要なら可視時のみ経過を積む方式もあるが、ADR-009 の許容範囲。

- **[N-003] determinate バーの transition timing-function が mock とわずかに不一致**
  — `styles.ts:33` は `transition-[width] duration-300`（Tailwind 既定 ease）。mock
  `.progress-bar-determinate` は `transition: width 300ms var(--ease-standard)`。duration は一致、
  easing 関数のみ差。視認上ほぼ無差で `motion-reduce:transition-none` も備える。気になれば
  `ease-[var(--ease-standard)]` 等で寄せられる（任意）。

- **[N-004] W-001 の構造的限界は ADR-009 で明文化済み（追認）**
  — close 後に着地する完了は次 navigation まで取りこぼす点は best-effort の限界として ADR-009
  「限界（許容）」に記録済み。新規対応不要。
</content>
</invoke>
