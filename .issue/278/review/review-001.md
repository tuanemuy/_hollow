# PR Review #001 — test(ingestion): IngestionQueue polling 専用テストの追加

**PR:** #410
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 6
- Verdict: **BLOCKED**（W-001 を修正して再レビュー）

---

## General Review

### Blockers
- なし

### Warnings

- **[W-001]** シナリオ5（inflight 抑止）の resolve 後アサートが、`inflightRef` 解放側（`finally` で false に戻す）の regression を拾えない
  - 場所: `app/components/ingestion/__tests__/IngestionQueue.test.tsx:299-308`
  - 理由: in-flight 中の二重 tick 抑止（ガード本体）は `inflightRef` を消すと赤くなるため検出できるが、resolve 後に timer を advance していないため「`finally` で `inflightRef` がクリアされ次の tick が正常に発火する」側の regression は検出できない。
  - 提案: resolve 後に `await advance(POLL_INTERVAL_MS)` を1段追加し、次の tick が発火して `toHaveBeenCalledTimes(2)` になることまで確認する。
  - **対応:** このPRで修正する（同一ファイル内・軽微）。

### Notes

- **[N-001]** Issue #278 の6シナリオを過不足なくカバー。シナリオ1を 1a(active 4s)/1b(idle 16s) の2 it に分割（計7テスト）、カバレッジ後退なし。各 assert が本体仕様と一致。
- **[N-002]** モック構成（`useServerFnRouter` / `serverFnChainStub` / `AppServerError` 直接構築 / `IngestionJobRow` スタブ）は既存テスト規約に完全準拠。`extractSerializedError` の `instanceof AppServerError` 経路で kind が確実に再現される。
- **[N-003]** fake timer / async flush は十分。3連続実行で 7/7 安定 PASS、flaky 兆候なし。typecheck・biome クリーン。
- **[N-004]** `afterEach` クリーンアップ（unmount → visibilityState 復元 → useRealTimers → mockReset）が後続テストを汚染しない。no-comments 原則も遵守。
- **[N-005]** scenario 3 の「再render で effect 再実行 → fatalRef で復活しない」検証は本体の useEffect 冒頭ガードを直接保護しており価値が高い。非vacuous。
- **[N-006]** 本体 `IngestionQueue.tsx` 無変更でテスト全 PASS。本体改修の必要は発見されず（スコープ外指摘なし）。

---

## Design Decisions

特になし（既存 ADR-001 / ADR-002 の範囲内）。
