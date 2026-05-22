# PR Review #001 — refactor(infra): move WorkersRoute from Pulumi to wrangler.toml

**PR:** #155
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 9
- Verdict: **BLOCKED** (Warning fixes required per Phase 3 policy)

---

## Infrastructure

### Blockers
なし

### Warnings

- **[W-001]** テンプレートのコメントが「web Worker のみに routes が適用される」ことを明示していない
  - 場所: `infra/templates/wrangler.{staging,production}.toml.tmpl:14-18`
  - 理由: 他 env（relay/consumer/pruner/dlq）に routes を追加しないのは正しい設計だが、コメントだけでは将来の保守者が「他 env にも追加すべきか」を判断しづらい
  - 提案: 「Managed by wrangler … atomically」のコメントを「This route applies only to the web Worker (top level); relay/consumer/pruner/dlq have no public routes.」を追記する

### Notes
- [N-001] AAAA placeholder の comment 更新で誤削除が防げる
- [N-002] wrangler v4.90.1 で `zone_name` フィールドは型定義レベルでサポート (`ZoneNameRoute`)
- [N-003] `routePattern` export の下流影響なし（renderWrangler.ts の StackOutput 型に元々無い）
- [N-004] CI フロー（Pulumi up → render → wrangler deploy）と整合
- [N-005] 手動 state delete + リカバリー手順が ADR-004 / testing.md で整備されている

---

## Documentation + Operations

### Blockers
なし

### Warnings

- **[W-001]** Production の「low-traffic window」が抽象的
  - 場所: PR description の Pre-merge checklist
  - 理由: 具体的な時間帯が示されておらず、判断が属人化する
  - 提案: 「(production reflection) plan a low-traffic window (e.g. JST 02:00-04:00)」と例示するか、運用ノート（DEPLOYMENT.md 等）への参照を入れる

- **[W-002]** `state delete` の URN がハードコードで、確認手順が示されていない
  - 場所: PR description / `.issue/139/testing.md` / `.issue/139/plan.md`
  - 理由: 将来 Pulumi state の URN 形式が変わると参照だけ古くなる
  - 提案: `pulumi state list --stack <stage> 2>&1 | grep workersRoute` のような確認コマンドを併記する

- **[W-003]** AAAA を誤削除した場合のリカバリー手順が docs に無い
  - 場所: `docs/runtime_cloudflare.md` AAAA 注意書きの直後
  - 理由: 警告だけで復旧法が無いと、事故時の対応が遅れる
  - 提案: 「If the AAAA placeholder was accidentally deleted, run `pnpm infra:up:<stage>` to recreate it」を 1 行追加

### Notes
- [N-001] ADR 4本の品質が高い
- [N-002] testing.md がエッジケース（state delete 忘れ → 復旧）まで網羅
- [N-003] テンプレート同期コメントがレビュー時のチェックポイントとして機能
- [N-004] Pulumi.yaml description が責務再定義を正確に反映

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし。既存 ADR-001〜004 で対応範囲をカバーしている。
