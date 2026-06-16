# PR Review #001 — feat(admin): #595 P40 ダッシュボード 24h チャート + 最近のアクティビティ backend 新設

**PR:** #746
**Date:** 2026-06-17
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 8
- Notes: 24
- Verdict: **BLOCKED**（直すべき Warning が残るため要修正ラウンド）

## レイヤー別ファイル

- Domain: review-001-domain.md（B: 0 / W: 1）
- Use Case / Application: review-001-usecase.md（B: 0 / W: 2）
- Adapter / Infrastructure: review-001-adapter.md（B: 0 / W: 3）
- Frontend: review-001-frontend.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

### Blockers
- なし

### Warnings（このPRで直す）
- [domain W-001] actorId が生 string（UserId ブランド型未使用）— `app/core/domain/adminSettings/events.ts:24`
- [usecase W-001] runPruneTick の pruneActivityLog が try/catch 無防備（outbox prune をブロックしうる）— `app/worker/cloudflare/handlers.ts:91-101`
- [usecase W-002] emit/no-emit の回帰テストが 2 usecase のみ（6 settingKind + no-op ガード未網羅）
- [adapter W-001] hourly 集計が全表スキャン + docstring/ADR-002 の index 記述が事実誤り — `app/core/adapters/d1/repositories/usageMetricsProvider.ts:71-79`
- [adapter W-002] burst read-time 集約が固定タンブリング窓で sliding-window と乖離、境界跨ぎ取りこぼし — `activityLogRepository.ts`
- [adapter W-003] burst 読み出しの scan=limit*THRESHOLD バウンドが多 owner で qualifying 窓を取りこぼしうる — `activityLogRepository.ts`
- [test W-001] dispatcher fan-out ルーティングの検証テストが無い（計画の最重要リスク）— `dispatchDomainEvent.test.ts`
- [test W-002] frontend の null-vs-0 / 空状態+導線非表示のテストが無い（→ harness 有無を確認の上で対応）

### Notes（取り込む主なもの）
- [frontend N-002] severity がモックの tag バリアントと不一致（large_upload / settings_changed）
- [frontend N-004] sparkline の `<title>` と `aria-label` 同文重複
- [frontend N-005] アクティビティ行の React key がデータ合成で衝突しうる（安定 id を DTO に）
- [test N-004] handleIngestionCreatedEvent の owner 解決失敗 skip 分岐テスト無し
- [test N-005] pruneActivityLog の cutoff 計算（日/時）の pin テスト無し
- [frontend N-001/N-003] 単一チャートの全幅化 / バッジ二重定義の共通化（軽微・任意）
