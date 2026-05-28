# PR Review #002 — feat(issue/245): deploy workflow hardening — add --env indexer and gate behind Validate secrets

**PR:** #267
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 20
- Verdict: **APPROVED**

---

## CI Workflow / Operations

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** 前回 CI-W-001 (`actionlint` 未導入) は本 PR スコープ外として Phase 4 で別Issue起票予定。本 PR 差分に actionlint 関連変更なく、合意通り。
- **[N-002]** 前回 CI-W-002 (ADR-001 への secret snapshot 追記) は `.issue/245/adr.md` ADR-001 Consequences に「`secrets.SOPS_AGE_KEY` は job 開始時にスナップショットされ step 間で再評価されない」として追記済み。完全解決。
- **[N-003]** Step 順序 `Apply D1 migrations → Validate secrets → Deploy Workers → Inject secrets` が受け入れ条件 B を構造的に満たす。
- **[N-004]** `Deploy Workers` の indexer 挿入位置 (`--env dlq` の後、`--env consumer` の前) は ADR-002 (a) の決定どおり。
- **[N-005]** `Inject secrets` 内 bulk-push ループに変更なし。PR #244 の挙動を完全維持。
- **[N-006]** `timeout-minutes: 20`、`concurrency.group`、production `environment` の required reviewer 設定すべて無変更。
- **[N-007]** Step 名衝突なし。新たな CI/Operations 観点の問題は混入していない。

---

## Security / Secret Handling

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** SEC-W-001 (`umask 077`) は 4 箇所すべて（staging Validate / staging Inject / production Validate / production Inject）で解決。`set -euo pipefail` の直後・`mktemp` より前に配置されており順序も完璧。
- **[N-002]** SEC-W-002（前方参照コメント）も解決。Validate 側に `Inject secrets step below independently re-decrypts` の趣旨、Inject 側に `re-decrypts on purpose` の補足が双方向に明記され、step 単体抽出時の誤読リスクが消えた。
- **[N-003]** `umask 077` の有効範囲は step bash サブシェル限定で他 step / runner 全体へ漏れない。`pnpm exec wrangler` や `sops` が副次的に作成しうるファイルも owner-only になる defence-in-depth。
- **[N-004]** `umask 077` builtin は構文が正しい限り fail しないため、`set -e` 下でも step を不正に止めない。
- **[N-005]** env スコープ最小権限維持。Validate 側 `SOPS_AGE_KEY` のみ、Inject 側で初めて `CLOUDFLARE_*` が登場する非対称性が意図通り。
- **[N-006]** 平文 SOPS が step 跨ぎで共有されていない原則を維持。`$GITHUB_ENV` / `$GITHUB_OUTPUT` / artifact upload / cache 経由の secret-adjacent 漏出経路なし。
- **[N-007]** trap → mktemp の順序が両 step とも保たれている。`set -u` partial-failure 時の trap 動作は安全。
- **[N-008]** staging/production の bash 本体・コメント文面が secrets パスと stage suffix を除いて 1:1 対応。片側修正漏れリスクなし。
- **[N-009]** `jq filter` + `wrangler secret bulk` ループに変更なし。Issue #203 / PR #244 の挙動完全維持。
- **[N-010]** 本ラウンドで新たに混入した Security / Secret Handling 上の問題なし。APPROVED (clean)。

---

## Design Decisions

このラウンドで新たな設計判断はなし。
