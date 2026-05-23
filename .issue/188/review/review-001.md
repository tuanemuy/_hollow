# PR Review #001 — fix(deploy): route relay workerId through IdGenerator port

**PR:** #189
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 5
- Verdict: **BLOCKED**（Warning 全件をその場で修正）

---

## General Review

### Blockers
- なし

### Warnings
- **[W-001]** `workerId` のフォールバック経路（`idGenerator.next()` への切替）を直接カバーするテストが存在しない
  - 場所: `app/core/application/workers/__tests__/eventRelayWorker.integration.test.ts`
  - 理由: `inlineRelayTrigger.test.ts` は `workerId: "inline-dev"` を明示する経路しかカバーしておらず、integration テストは `workerId` / `claimed_by` を一切アサートしていない。つまり「フォールバックで container.idGenerator が呼ばれる」「`claimPending` に non-empty な workerId が渡る」という今回の挙動変更点そのものをガードするテストがない。今後 `container.idGenerator` 参照を消す/タイポする回帰を検出できない。
  - 提案: `processOutboxBatch` の単体テスト1本で十分。スタブ `idGenerator` を渡し、`outboxRepository.claimPending` が受け取った `workerId` がスタブの返値と一致することをアサートすれば、フォールバック経路と「ポート経由である」ことを同時に担保できる。

- **[W-002]** JSDoc の説明が「実装事情の説明」に寄り過ぎていてシグネチャ仕様が読みにくい
  - 場所: `app/core/application/workers/eventRelayWorker.ts:94-105`
  - 理由: 12行のうち約8行が「なぜポートを通すか（Cloudflare 10021 / テスト決定性）」の歴史的経緯で、`workerId?: string` という public option の **挙動**（指定時/未指定時に何が起きるか、診断専用であること、tick 単位であること）が相対的に埋もれる。CLAUDE.md の "Default to no comments. Add one only when the WHY is non-obvious" に対しては妥当だが、Cloudflare 制約の説明はモジュール冒頭か commit メッセージ側の責務で、option JSDoc の主役は仕様であるべき。
  - 提案: option JSDoc は「指定なし時は tick ごとに `container.idGenerator` から採番」「診断専用、ドメインキーではない」の2文に絞る。

### Notes
- **[N-001]** DI 設計は `clock` / `logger` / `outboxRepository` と完全に同形で `const { logger, clock, outboxRepository, idGenerator } = container;` に揃っており、CLAUDE.md の "cross-cutting concerns behind ports" 原則に正しく沿っている。`SharedDeps.idGenerator: IdGenerator` 経由なので `WorkerContainer` でも型整合。
- **[N-002]** トップレベル `crypto.randomUUID()` は本ファイル含めリポジトリ全体から消滅。Cloudflare validation 10021 への対処として必要十分。
- **[N-003]** 「isolate 単位 → tick 単位」の挙動変更は lease lifecycle（`leaseMs`、reclaim 可能性）と整合的。`claimed_by` はリース帰属の自己識別であって isolate 識別ではないため、tick ごとに新しい id でも `outboxRepository.claimPending` / `finalize` の契約は変わらない。同一 tick 内では `workerId` がローカル変数として安定しているので claim / finalize 間で齟齬は出ない。
- **[N-004]** plan.md / testing.md は実装内容と一致しており、PR description のチェックリストも埋まっている。コミットメッセージは Conventional Commits 準拠で簡潔・正確。
- **[N-005]** スコープは1ファイル変更に的確に絞られており、過剰なリファクタはない。

---

## Design Decisions

特になし
