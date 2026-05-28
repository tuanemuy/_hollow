# PR Review #001 — feat(issue/245): deploy workflow hardening — add --env indexer and gate behind Validate secrets

**PR:** #267
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 15
- Verdict: **APPROVED (with hardening warnings)**

---

## CI Workflow / Operations

### Blockers
- なし

### Warnings
- **[W-001]** workflow YAML を PR 上で自動検証する仕掛けが存在せず、構文エラーが main マージ後の `push` 経由で初めて顕在化するリスクが残る
  - 場所: `.github/workflows/deploy-staging.yml` 全体 / `.issue/245/testing.md`
  - 理由: PR check に `actionlint` 等の lightweight な linter が無く、testing.md 自身も「ローカル目視」止まり。Issue #245 の意図はあくまで deploy step 順序の修正であり、CI lint 導入は別ドメインの作業。
  - 対応: **Phase 4 で別Issue起票**。本 PR のスコープ外。

- **[W-002]** `SOPS_AGE_KEY` のローテーション中に decrypt が 2 回走ることへの ADR-001 の説明不足
  - 場所: `.issue/245/adr.md` ADR-001
  - 理由: 実運用上ほぼ起きないが、ADR-001 で「各 step 自己完結」を謳う以上、`secrets.*` が job 開始時にスナップショットされる前提を明示しておくと将来の読み手に親切。
  - 対応: ADR-001 Consequences に 1 行追記する。

### Notes
- **[N-001]** indexer の挿入位置 (`dlq` と `consumer` の間) は wrangler 構成全部を grep した結果、indexer が service binding を持たず、誰も indexer を bind しないことが確認できており、Issue #188 の依存方向と整合。ADR-002 の (a) 選択は正当。
- **[N-002]** `Validate secrets` の失敗で後続 step が `skipped` になる挙動は GitHub Actions のデフォルト (`success()` 暗黙適用) で構造的に担保されており、受け入れ条件 3 を満たす。
- **[N-003]** `Inject secrets` 内の `jq filter + bulk push` ループは PR #244 の状態を完全に維持。
- **[N-004]** Staging / production 対称性が完全に保たれている（production 末尾の `Generate release notes` は既存仕様）。
- **[N-005]** trap → mktemp の順序が既存 `Inject secrets` パターンと一致。
- **[N-006]** `checkSecrets.ts` の semantics に変更なし。
- **[N-007]** PR #244 (secret bulk-push 側) + PR #267 (Deploy Workers 側) で indexer 関連 gap が二段階で完結する流れが追える。

---

## Security / Secret Handling

### Blockers
- なし

### Warnings
- **[W-001]** `Validate secrets` step が `umask` を明示していない（既存 `Inject secrets` も同様）
  - 場所: `.github/workflows/deploy-staging.yml` / `.github/workflows/deploy-production.yml` の Validate secrets と Inject secrets 両方
  - 理由: `mktemp` は通常 `0600` で作成されるため実害は低い。ただし ADR-001 が「平文 retention scope の最小化」を判断軸に据えているなら、`umask 077` 一行の defense-in-depth は整合性を高める。
  - 対応: 両 step に `umask 077` を `set -euo pipefail` 直後に追加する。

- **[W-002]** `Validate secrets` の comment が `Inject secrets below re-decrypts in its own step` と前方参照しており、step 単体抽出時に意味が読み取りづらい
  - 場所: `.github/workflows/deploy-staging.yml` Validate secrets コメント / `.github/workflows/deploy-production.yml` 同上
  - 理由: 軽微だが、`Inject secrets` 側だけ読む reviewer が ADR を辿らないと「Validate で decrypt したものを Inject 側で reuse しているのでは」と誤読しうる。
  - 対応: コメントを「`Inject secrets` step below independently re-decrypts (#245 ADR-001 — see also that step)」に書き換える。

### Notes
- **[N-001]** `set -euo pipefail` + `DECRYPTED_RAW=""` 初期化 → `trap` → `mktemp` の順序が完璧。`set -u` 下でも trap が安全。
- **[N-002]** `Validate secrets` の `env:` が `SOPS_AGE_KEY` のみで `CLOUDFLARE_*` を意図的に渡しておらず最小権限。
- **[N-003]** 平文 SOPS が step 跨ぎで一切共有されていない。`$GITHUB_ENV` / `$GITHUB_OUTPUT` 経由のパス受け渡しもなし。
- **[N-004]** `mktemp` パスがログに出る件は実害なし（パス自体は secret ではない）。
- **[N-005]** staging / production の差分は config ファイル名・secrets パス・stage サフィックスのみで完全対称。
- **[N-006]** ADR-001 の trade-off 評価は妥当。第3の選択肢「1 step に統合」は受け入れ条件 B を満たさないため自然に排除される。
- **[N-007]** `jq filter` + `bulk push` ループは無変更。
- **[N-008]** `checkSecrets.ts` の trust boundary 前提と呼び出し方が一致。

---

## Design Decisions

このラウンドで新たな設計判断はなし。既存 ADR-001 / ADR-002 を補強する追記が CI-W-002 で発生。
