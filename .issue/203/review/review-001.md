# PR Review #001 — feat(infra): harden deploy workflow secret bulk-push

**PR:** #244
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 10
- Notes: 多数
- Verdict: **BLOCKED**

---

## Infrastructure / CI

### Blockers
なし

### Warnings

- **[W-001]** secret injection ステップが `Deploy Workers` の **後** に走るため、checkSecrets が fail-loud に検出しても新コードは既に Cloudflare 上で稼働している
  - 場所: `.github/workflows/deploy-staging.yml:73-118` / `deploy-production.yml:76-121`
  - 理由: 順序が `Deploy Workers` → `Inject secrets` のため、check fail 時「新コード稼働 / 旧 secret」中間状態が発生し得る
  - 提案: 別 Issue で `Validate secrets` step を `Deploy Workers` の前に独立配置（**本 PR スコープ外**、plan.md「リスクと注意点」末項で明文化済み）
  - 対応方針: **スコープ外。フォローアップ Issue 候補として記録**

- **[W-002]** `mktemp` 直後の trap 設定タイミングに極小の漏れ窓
  - 場所: `.github/workflows/deploy-staging.yml:100-102` / `deploy-production.yml:103-105`
  - 理由: `DECRYPTED_RAW=$(mktemp)` 成功 → `DECRYPTED_FILTERED=$(mktemp)` 失敗 のパスで `$DECRYPTED_RAW` が残る
  - 提案: `trap 'rm -f "${DECRYPTED_RAW:-}" "${DECRYPTED_FILTERED:-}"' EXIT` を最初の `mktemp` の前に置く（`${var:-}` で空文字フォールバック）
  - 対応方針: **修正する** — 構文上の対称性として揃える

- **[W-003]** `pnpm install --frozen-lockfile` 前提が問題ないかの確認 → 既に対処済み（**Note 寄り**、対応不要）

### Notes
- 両 workflow が完全対称、`--env indexer` 6 entries 揃い、`jq` プリインストール済み、ADR-003 の filter 独立性が正しく実装、`.enc.json` 同期問題はフォローアップに記載済み

---

## TypeScript

### Blockers
なし

### Warnings

- **[W-001]** `--` セパレータの単純フィルタは「ファイル名が文字通り `--` の場合」に誤動作
  - 場所: `infra/scripts/checkSecrets.ts:42`
  - 理由: `filter((a) => a !== "--")` は位置引数中の `--` をすべて除去。実 CI 経路では問題ないが invariant が暗黙
  - 提案: JSDoc に「ファイルパスに `--` を含まないことを invariant とする」を明記
  - 対応方針: **修正する** — JSDoc 追記

- **[W-002]** `JSON.parse` は JSON 内重複キーを silent 後勝ちで握り潰す
  - 場所: `infra/scripts/checkSecrets.ts:89-93`
  - 理由: SOPS 編集で同名キー重複が発生してもこの check は気付かない
  - 提案: JSDoc に「重複キーは検出しない（JSON.parse の制約）」を明記
  - 対応方針: **修正する** — JSDoc 追記

- **[W-003]** 値の妥当性（空文字 / プレースホルダ等）は検証しない
  - 場所: `infra/scripts/checkSecrets.ts:81-93`
  - 理由: キー集合のみ検証する設計を明文化したい
  - 提案: JSDoc に「値の妥当性は検証しない（キー集合のみ）」を明記
  - 対応方針: **修正する** — JSDoc 追記

- **[W-004]** 巨大ファイル時の `readFileSync` メモリ → 信用境界内、現状維持 OK
  - 対応方針: **対応不要** — 必要なら JSDoc に「入力は信用境界内」を 1 行

- **[W-005]** `Deploy Workers` の indexer 漏れフォローアップ → PR description / plan で明示済み
  - 対応方針: **対応不要** — 既に PR description「Operator follow-ups」3 で明示

### Notes
- `Pick<Config, ...>` 絞り込みは CLAUDE.md 原則と整合、`renderWrangler.ts` のスタイル踏襲、9 ケース実動作検証済み、決定的順序、ESM パス解決正しい

---

## Documentation

### Blockers

- **[B-001]** `docs/deployment_setup.md` の "secret を削除する" 手順 Step 4 が引数欠落で実行不能
  - 場所: `docs/deployment_setup.md:58`（「secret を削除する」Step 4）
  - 理由: `pnpm infra:check-secrets:<stage>` が引数なしで提示されているが、`checkSecrets.ts` は `<decrypted-json-path>` を必須 positional として要求し、引数なしで `usage:` を stderr に出して exit 1
  - 提案: 追加フロー（Step 5）と同じ 3 行（`sops -d` → `pnpm infra:check-secrets:<stage> -- /tmp/d.json` → `rm`）に揃える
  - 対応方針: **必修**

- **[B-002]** `docs/runtime_cloudflare.md` の Deployment SOPS workflow が本 PR で導入した新フローを反映しておらず矛盾
  - 場所: `docs/runtime_cloudflare.md:131, 149-156`
  - 理由: plan.md Step 6 で「必要に応じて軽く更新」を約束しているが未対応。`pnpm infra:check-secrets:<stage>` の同期確認ステップ完全欠落、`^_` 規約の言及なし、L131 で `pnpm deploy:<stage>:all` が `wrangler secret bulk` を叩くと誤記述（実際は workflow 内 `Inject secrets` ステップ）
  - 提案: SSOT を README に集約しつつ、要点と新フロー（spec → enc.json → ローカル check → CI 再検証）に書き直す。L131 にも `^_` 除外 + pre-deploy check の挟まりを追記
  - 対応方針: **必修**

### Warnings

- **[W-001]** `infra/secrets/README.md` と `docs/deployment_setup.md` で `.dev.vars.example` 言及の非対称
  - 場所: `infra/secrets/README.md:51-72` vs `docs/deployment_setup.md:39-51, 55-66`
  - 理由: deployment_setup.md の追加フローには `.dev.vars.example` 追記があるが、README にはない。削除フローはどちらも `.dev.vars.example` 言及なし
  - 対応方針: **修正する** — README にも `.dev.vars.example` 追記 / 削除を明記して対称化

- **[W-002]** `sops` コマンド表記が文書間で不揃い
  - 場所: `infra/secrets/README.md:66-67` vs `docs/deployment_setup.md:47`
  - 理由: README は `SOPS_AGE_KEY_FILE=...` 形式、deployment_setup.md は素の `sops -d`
  - 対応方針: **修正する** — deployment_setup.md 側も README と同じ形式に揃える

- **[W-003]** 既存 `_*` secret の post-deploy cleanup が一般的 Removing-a-secret フローとしてしか書かれていない
  - 場所: `docs/deployment_setup.md:53-66` / `infra/secrets/README.md:85-101`
  - 理由: plan.md で「**本 PR merge 直後の運用作業として** key 名リテラル列挙で残す」と明言したが、generic な手順しかない
  - 対応方針: **修正する** — `docs/deployment_setup.md` に「PR #244 merge 後の post-deploy cleanup」ブロックを 1 つ追加し、`_comment` / `_dispatch_extras_comment` / `_resend_api_key_comment` をリテラル列挙

- **[W-004]** `.issue/203/testing.md` と `plan.md` 内の `_web_only_comment` 言及が現状の `.json.example` 構成と不一致
  - 場所: `.issue/203/testing.md:52, 121` / `.issue/203/plan.md:26, 163`
  - 理由: 実 template には `_resend_api_key_comment` がある（旧 `_web_only_comment` は既に削除済）。テスト実行者が verify できない
  - 対応方針: **修正する** — testing.md と plan.md の該当箇所を `_resend_api_key_comment` に修正

- **[W-005]** "Adding a secret" Step 1 の「`shared` / `dispatchExtras` 等」の「等」が誤誘導
  - 場所: `docs/deployment_setup.md:41`
  - 理由: 実 `infra/src/secrets.ts` には `shared` と `dispatchExtras` の 2 配列のみ。「等」は第三の配列を示唆して読者を混乱させる
  - 対応方針: **修正する** — 「等」を削除して限定列挙

### Notes
- README の Adding / Rotating / Removing 3 フローと `wrangler secret delete` env_flag リスト整合、`secrets.ts` JSDoc は plan 要件全て満たす、`checkSecrets.ts` usage コメント self-documenting、workflow YAML 両 stage 完全一致

---

## Design Decisions

特になし（修正対象は既存 ADR の範囲内、`Validate secrets` step の前倒しは別 Issue 候補）
