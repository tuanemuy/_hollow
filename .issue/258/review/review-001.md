# PR Review #001 — perf(#258): UploadDialog ポーリング effect の view 依存による re-mount を解消

**PR:** #322
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 6
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ）

---

## General Review

### Blockers
- なし

### Warnings

- **[W-001]** 追加テストが「regression guard」を名乗っているが、旧コードでもパスする（リグレッションを検知できない）
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx`（追加した transient テスト）
  - 理由: マージベースの旧実装をワーキングツリーに差し戻して本テストだけ実行したところ **PASS** した。旧コードの transient catch 分岐も `setView({...transientFailures})` 後の effect 再セットアップで `setTimeout(tick, POLL_INTERVAL_MS)` を再スケジュールするため、「2000ms 進めるごとに getJob がちょうど 1 回」という assert は旧コードでも成立する。Issue が問題視した re-mount は「同一ウィンドウ内の getJob バースト」ではなく **timer churn（clear+再スケジュール）** であり、`advanceTimersByTimeAsync` で同期的に時間を進める設計では観測できない。テスト/コメントの「view 全体依存に戻すと検知できる」という主張は実証上誤り。
  - 提案: (a) 表現を正直にする（transient 失敗後も editing に到達し間隔が縮まないことを確認する happy-path 回帰テストに格下げ、"burst を catch する guard" の主張を削除）。(b) 真に re-mount を検知したいなら effect mount 回数 / clearTimeout 回数を直接観測する手段に変える。実装そのものは正しいので、これはテストの妥当性に限定した指摘。

### Notes

- **[N-001]** 実装は計画・ADR と完全整合。`transientFailures` を View discriminant から ref に移し、依存を `[waitingJobId, waitingStartedAt, getJob, onClose]` に絞る方針どおり。typecheck / lint（useExhaustiveDependencies 含む）クリーン、unit 全 2739 件パス。
- **[N-002]** useRef カウンタのリセット位置は適切。`kind: "waiting"` の setView は `submitFiles` と `onRegenerated` の 2 箇所のみで、両方とも直前に `transientFailuresRef.current = 0;` がある。open effect は `select` にしか遷移しないため、リセット漏れによる持ち越しパスは存在しない。
- **[N-003]** cancelled フラグと再帰 setTimeout の整合は問題なし。transient catch も他分岐と同形に `pollTimerRef.current = setTimeout(...)` で代入し、cleanup の clearTimeout が常に最後のタイマーを掴む。await 後の `if (cancelled) return;` で in-flight tick が早期 return し二重発火・リークなし。
- **[N-004]** effect mount-once 前提が production でも成立。`onClose` は親で `useCallback`、`getJob` は `useServerFn`（内部 useCallback）。waiting セッション中の再レンダーで再 mount しない。万一再 mount してもカウンタは ref なので保持。
- **[N-005]** スカラー参照への置換は全分岐で正しい（previewing/failed/saved/discarded/timeout/fatal/transient cap）。`waiting` 以外のロジックは不変。
- **[N-006]** Perf-M1 をスコープ外とした判断は妥当。Issue の「やること」は polling effect 限定で audit でバックログ管理済み。

---

## Design Decisions

特になし（既存 ADR-001 / ADR-002 で網羅済み）。
