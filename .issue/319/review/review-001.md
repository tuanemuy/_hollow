# PR Review #001 — feat(ingestion): existing-job-origin waiting fatal はキュー誘導する (#319)

**PR:** #333
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

レビュー方式: 複雑度「小規模」のため General Review 1本（変更全体を多角的に）。

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 要件充足は完全。Issue #319 の意図（既存ジョブ起点の waiting fatal でキュー誘導し編集対象を見失わせない／初回アップロード起点は従来通り `select`）を満たす。`origin` を `waiting` view に持たせ、`submitFiles`（単一ファイル）で `"upload"`、`onRegenerated`（再生成・retry の単一入口）で `"existingJob"` を設定する設計が plan.md / ADR-001・002 と一致。
- **[N-002]** 起点伝播は両入口とも正しい。retry は `FailedView.onRetry → onRetried = onRegenerated` で再生成と同一ハンドラに合流するため、`onRegenerated` 1箇所に `origin: "existingJob"` を置くだけで再生成・retry 双方をカバー。ADR-002 通り fatal だけでなく transient 上限超過も `failWaiting` ヘルパー経由で起点別に出し分け、両 terminal 経路で一貫。
- **[N-003]** effect の scalar 依存維持。`waitingOrigin` はスカラー抽出され依存配列に追加。`origin` は waiting セッション内で不変なので 1セッション1マウントのポーリング挙動は不変。cleanup も無変更で整合。
- **[N-004]** アクセシビリティ・二重読み上げ回避が適切。`queueGuidance` の status 文言「ジョブはキューに残っています」を `role="status"` に、エラー本文を `QueueGuidanceView` 内 `role="alert"` に分離。`failWaiting` が `setError → setView` を同期で呼ぶため表示エラーが欠落しない。
- **[N-005]** styling 規約準拠。`QueueGuidanceView` は既存トークン・`pillBtn`・`Link to="/upload"` を流用し `TimedOutView`/`MultiResultView` と同一様式。ハンドコード CSS なし。
- **[N-006]** テスト品質が高い。新規2ケース（再生成起点 fatal=forbidden → queueGuidance、retry 起点 fatal=notFound → queueGuidance）が「ドロップゾーンに戻らない」「キュー誘導文言＋リンク」「status 文言」を pin。回帰ガードとして既存の upload 起点 fatal → select / transient cap → select テストが両側をカバー。
- **[N-007]** 検証: `pnpm typecheck` クリーン、`biome lint`/`format` 問題なし、ユニットテスト 2760 件全 PASS。`viewStatusText` の `default: throw` 網羅性チェックで新 view の case 漏れは型・実行時双方で検出される構造を維持。

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし（ADR-001・002 が既に計画段階で記録済み、実装と一致を確認）。
