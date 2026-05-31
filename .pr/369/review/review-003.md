# PR Review #003 — feat(security): SECRET_BOX_MASTER_KEY の production fail-fast 化と placeholder ガード

**PR:** #369
**Date:** 2026-05-31
**Round:** 3回目（最終確認 / 全観点横断）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**（Round 2 + Round 3 の2回連続クリーン → レビュー完了）

---

## Final Review（全観点横断）

### Blockers
なし

### Warnings
なし

### Notes
- Round 2 から退行・新規問題なし。fail-fast ロジック / DI threading（web・consumer 両経路）/ 二層防御（runtime + CI）/ trim 正規化対称性 / 3箇所複製のドリフト検知すべて確認。
- 型安全: `selectSecretBox` 入力は `{ readonly SECRET_BOX_MASTER_KEY?: string | undefined }` + `requireKey: boolean`、DI 側は `requireSecretBoxKey ?? false` で安全側に倒す。境界検証は `decodeMasterKey`（shape）と `readRequestServerConfig`（transport: `=== "true"`）の2点に集約。
- エラー処理: 全パス `SecretBoxError(KeyUnavailable)` 統一、`*ErrorCode` 命名規約準拠、broad-catch 追加なし。
- `WebCryptoSecretBox.fromEnv` 削除でリポジトリ全体に残参照ゼロ（dead code 撤去）。
- 配線網羅: relay/pruner/dlq/indexer は `createWorkerContainer`（secretBox 非保持）で影響なし。テンプレートは web `[vars]` と `[env.consumer.vars]` のみに var を置き、ドキュメント記述と一致。
- ドキュメント正確性: `.issue/96/adr.md` supersede note、`.issue/102/adr.md` ADR-001〜004、README/runtime doc の fail-fast 記述すべて実装と整合、記載コマンドは実在。
- CLAUDE.md 規約準拠（WHY コメント / exported JSDoc / 境界検証 / 型安全 / make illegal states unrepresentable）。

---

## Design Decisions

新規の設計判断なし。

---

## レビュー完了

- 全 3 ラウンド実施。
- 初回 Blocker: 0 / 初回 Warning: 4（W-001〜W-004）
- 修正済み: 4 / 後回し（別Issue）: 0
- 最終ステータス: APPROVED（Round 2・3 の2回連続クリーン）
- ADR 追加: なし（Warning はすべて既存方針の補強）
- レビューファイル: .pr/369/review/review-001.md 〜 review-003.md
