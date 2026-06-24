# PR #693 レビュー — CI/CD・リリースフロー観点

**PR:** #693 `ci: リリースフローを release-please に移行（pnpm version 直 push を廃止）`
**base:** main / **head:** issue/687/release-please-migration
**レビュー日:** 2026-06-13
**レビュー対象差分:** `gh pr diff 693`（7ファイル: release-please.yml 新規 / release-please-config.json 新規 / .release-please-manifest.json 新規 / deploy-production.yml 修正 / package.json 修正 / README.md / docs/deployment_setup.md）

---

## 受け入れ基準の検証（CI/CD 観点: AC-1〜AC-6）

| AC | 内容 | 判定 | 根拠 |
|----|------|------|------|
| AC-1 | main push 起点で release-please が常時1本のリリースPRを upsert（複数本にならない） | ✅ 満たす | `release-please.yml` の `on.push.branches: [main]` + `concurrency.group: release-please` + `cancel-in-progress: false`。release-please-action@v4 はリリースPRを upsert（タイトルで識別し1本に集約）するのが標準挙動。 |
| AC-2 | リリースPRマージで `vX.Y.Z` 形式タグ + GitHub Release 生成 | ✅ 満たす | `include-component-in-tag: false` + 単一 root パッケージ（component名なし）→ タグに component が付かない。`include-v-in-tag` はデフォルト true のため `v` プレフィックスが付く。結果 `v0.1.0` 形式。 |
| AC-3 | 生成タグが `deploy-production.yml` の `on.push.tags: ["v*.*.*"]` にマッチし PAT 経由で deploy 起動 | ✅ 満たす（PAT 登録は operator 前提） | タグ `v0.1.1` は `v*.*.*` にマッチ。`token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`（PAT）でタグ push するため GITHUB_TOKEN の「他ワークフロー非起動」確定仕様を回避。 |
| AC-4 | main へ bump 目的の直接コミットが発生しない | ✅ 満たす | release-please はリリースPR経由のみで bump コミットを乗せる。ブランチ保護と両立。コード差分上の懸念なし。 |
| AC-5 | Release 生成元が release-please に一本化（`Generate release notes` 削除） | ✅ 満たす | `deploy-production.yml` から `softprops/action-gh-release@v2` ステップ全体が削除済み。`Inject secrets` が最終ステップになり YAML 構造は健全。 |
| AC-6 | `package.json` の `version: "0.1.0"` が manifest 初期値と一致 | ✅ 満たす | `package.json` L3 `"version": "0.1.0"`、`.release-please-manifest.json` `{".": "0.1.0"}`。一致。 |

CI/CD 観点の全 AC を満たしている。AC-7/AC-8（ドキュメント）も併せて達成（README / deployment_setup.md ともに release-please フロー・squash 統一・PAT 前提を明記）。

---

## CI/CD・リリースフロー

### Blockers

なし。

### Warnings

- **[W-001]** `RELEASE_PLEASE_TOKEN` 未登録時のサイレント失敗リスク / `.github/workflows/release-please.yml:23` / `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}` は、secret が未登録だと空文字に解決される。release-please-action@v4 は token 空でも即時 hard fail せず、内部の GITHUB_TOKEN フォールバックが無い構成では「PR が作られない」サイレント挙動になりうる。この PR はコードとしては正しく、PAT 登録は operator 前提と plan / docs に明記されているため Blocker ではないが、CI/CD の運用上の単一障害点である。 / 提案: docs/deployment_setup.md のトラブルシュート節（既に記載あり）に加え、初回マージ後に Actions で release-please ジョブが green かつリリースPRが1本作られたことを目視確認する受け入れ確認を運用チェックリスト化すること（plan のテスト方針 AC-1 に既述。実装側の追加対応は不要）。

- **[W-002]** release-please ジョブにブランチガードが無い / `.github/workflows/release-please.yml:3-5` / `on.push.branches: [main]` のみで `if:` ガードが無いため、fork や別経緯の main push でも起動する。本リポは単一リポ運用で実害はほぼ無いが、release-please-action は実行ごとに API を叩く。 / 提案: 必須ではないが、堅牢化するなら `jobs.release-please.if: github.repository == 'tuanemuy/hollow3'` を付けると fork での無駄起動を防げる。現状の単一リポ運用では対応不要（Note 級に近い）。

### Notes

- **[N-001]** `release-please-config.json` のスキーマは実在キーのみで正しい。`release-type` / `include-component-in-tag` / `packages` はいずれも config schema のトップレベル正規キー。`packages: { ".": {} }` は root 単一パッケージのマニフェスト型構成として正しく機能し、`.release-please-manifest.json` の `{".": "0.1.0"}` とキー（`"."`）が整合している。`$schema` 参照も付与されておりエディタ補完・検証が効く。

- **[N-002]** タグ形式 `vX.Y.Z` の担保が二重に堅い。`include-component-in-tag: false`（明示）に加え、単一 root パッケージで component 名を与えていないため、仮にデフォルト挙動が変わっても component が付与されない。`include-v-in-tag` はデフォルト true のまま依存しており、`v` プレフィックスが付く。結果 `v0.1.0` で `on.push.tags: ["v*.*.*"]` および environment の deployment branch policy `v*.*.*` に一致する。設計通り。

- **[N-003]** PAT 採用の判断が妥当。GITHUB_TOKEN で作成したタグが他ワークフロー（tag-triggered deploy-production）を起動しないのは GitHub の確定仕様であり、release-please→deploy-production の連鎖を成立させるには PAT が必須。`token: RELEASE_PLEASE_TOKEN` は正しい対処。

- **[N-004]** `permissions: contents: write / pull-requests: write` は release-please-action@v4 に十分。PR 作成（pull-requests: write）、CHANGELOG コミット・タグ・Release 作成（contents: write）をカバーする。なお実際のタグ push は PAT 名義で行われ、この workflow `permissions` は GITHUB_TOKEN のスコープであり PAT のスコープとは別物（PAT 側スコープは docs に明記済み）。

- **[N-005]** `concurrency.group: release-please` + `cancel-in-progress: false` の設定が適切。複数 main push が連続しても直列化され、リリースPRが競合・重複しない。`cancel-in-progress: false` により実行中の release-please を後続が中断しない（PR upsert の取りこぼし防止）。AC-1 の補強として正しい。

- **[N-006]** `Generate release notes` 削除が YAML を壊していない。削除後 `Inject secrets`（L122-152）がジョブ最終ステップとなり、インデント・ステップ境界とも健全。削除されたのは末尾ステップのみで、Pulumi / migrations / Deploy Workers / Inject secrets 等の前段ステップに副作用なし。

- **[N-007]** GITHUB_TOKEN の唯一の利用箇所が消えても問題ない。削除前 deploy-production.yml で `secrets.GITHUB_TOKEN` を参照していたのは削除された `Generate release notes` のみ。他ステップは PULUMI / CLOUDFLARE / SOPS_AGE_KEY 系 secret を使い GITHUB_TOKEN に依存しない。削除によるデプロイ動作への影響なし。

- **[N-008]** `workflow_dispatch`（緊急手動デプロイ）経路への副作用なし。deploy-production.yml は `on.push.tags` と `workflow_dispatch` の両起動を持つが、削除された `Generate release notes` はタグ ref 前提のステップで、手動デプロイ経路では元々付随的だった。削除後も手動デプロイは Pulumi→build→migrate→deploy→secrets を完走する。docs にも緊急時の手動タグ push 手順が残されており運用上の逃げ道も確保。

- **[N-009]** `deploy-staging.yml`（main push トリガー）と release-please の並走に干渉なし。両者は `on.push.branches: [main]` で並走するが、concurrency group が別（`deploy-staging` vs `release-please`）で独立。staging は最新 main を反映、release-please は PR を upsert するだけ。リリースPRマージ（version bump + CHANGELOG のみ）で staging が再デプロイされるのは冗長だが無害。変更不要との plan 判断は正しい。

- **[N-010]** `ci.yml` は無変更で正しい。`on.pull_request.branches: [main]` のためリリースPRに対しても lint/typecheck/test/build が走る。リリースPRは version bump + CHANGELOG のみなので CI は green を維持する想定で、変更不要との判断は妥当。

- **[N-011]** `package.json` の `version` 追加位置・形式が正しい。`"name": "hollow"` の直後・`"private": true` の前（L3）に `"version": "0.1.0"` を配置。npm/node 規約に沿う位置で、release-type: node の bump 対象として認識される。

- **[N-012]** ドキュメント整合性が高い。README / docs/deployment_setup.md ともに旧 `pnpm version + git push --follow-tags` 手順を削除し、release-please フロー・squash merge 統一・"Default commit message" を "Pull request title" に設定する手順・PAT 前提・deployment branch policy `v*.*.*`・トラブルシュートを網羅。AC-7/AC-8 を満たす。README から「creates a GitHub Release」の主語が release-please に移っており二重 Release の誤解を排除。

---

## 総評

CI/CD・リリースフロー観点で **Blocker なし**。release-please の config / manifest / package.json version の整合、タグ形式 `v*.*.*` の二重担保、PAT 採用、Generate release notes 削除による Release 所有の一本化、deploy-staging / ci.yml との非干渉まで、設計（plan.md）通りに正しく実装されている。

残る2件の Warning はいずれもコード修正を要しない運用上の留意点（PAT 未登録時のサイレント失敗の運用確認、fork 起動ガードの任意強化）であり、PR としては承認可能な品質。
