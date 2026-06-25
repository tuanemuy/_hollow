# PR #693 レビュー（2回目） — CI/CD・リリースフロー観点

**PR:** #693 `ci: リリースフローを release-please に移行（pnpm version 直 push を廃止）`
**base:** main / **head:** issue/687/release-please-migration
**レビュー日:** 2026-06-13（Round 2 / フルレビュー）
**レビュー対象差分:** `gh pr diff 693`（7ファイル: release-please.yml 新規 / release-please-config.json 新規 / .release-please-manifest.json 新規 / deploy-production.yml 修正 / package.json 修正 / README.md / docs/deployment_setup.md）
**前回:** review-001-cicd.md（Blocker 0 / Warning 2 / Note 12。Warning は運用留意点として見送り記録済み）

差分は前回レビューから変化なし（working tree と PR diff が一致することを各ファイル実体で確認）。本 Round はゼロベースで再検証し、新規 Blocker/Warning の有無を確認した。

---

## 受け入れ基準の検証（CI/CD 観点: AC-1〜AC-6）

| AC | 内容 | 判定 | 根拠 |
|----|------|------|------|
| AC-1 | main push 起点で release-please が常時1本のリリースPRを upsert（複数本にならない） | 満たす | `release-please.yml` `on.push.branches: [main]` + `concurrency.group: release-please` / `cancel-in-progress: false`。release-please-action@v4 はリリースPRをタイトルで識別し upsert する標準挙動。 |
| AC-2 | リリースPRマージで `vX.Y.Z` 形式タグ + GitHub Release 生成 | 満たす | `include-component-in-tag: false` + 単一 root パッケージ（component名なし）→ component 非付与。`include-v-in-tag` デフォルト true で `v` プレフィックス付与 → `v0.1.0`。 |
| AC-3 | 生成タグが `deploy-production.yml` の `on.push.tags: ["v*.*.*"]` にマッチし PAT 経由で deploy 起動 | 満たす（PAT 登録は operator 前提） | `v0.1.1` は `v*.*.*` にマッチ。`token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`（PAT）でタグ push し、GITHUB_TOKEN の「他ワークフロー非起動」確定仕様を回避。 |
| AC-4 | main へ bump 目的の直接コミットが発生しない | 満たす | release-please は bump をリリースPR経由のみで乗せる。ブランチ保護と両立。 |
| AC-5 | Release 生成元が release-please に一本化（`Generate release notes` 削除） | 満たす | `deploy-production.yml` から `softprops/action-gh-release@v2` ステップ全体が削除済み。`Inject secrets`（L122-151）が最終ステップになり YAML 構造健全。 |
| AC-6 | `package.json` の `version: "0.1.0"` が manifest 初期値と一致 | 満たす | `package.json` L3 `"version": "0.1.0"`、`.release-please-manifest.json` `{".": "0.1.0"}`。一致。 |

CI/CD 観点の全 AC を満たす。AC-7/AC-8（ドキュメント）も達成（README / deployment_setup.md ともに release-please フロー・squash 統一・"Default commit message"="Pull request title"・PAT 前提・deployment branch policy `v*.*.*`・トラブルシュートを記載）。

---

## CI/CD・リリースフロー

### Blockers

なし。

### Warnings

- **[W-001]** `RELEASE_PLEASE_TOKEN` 未登録時のサイレント失敗が依然として単一障害点 / `.github/workflows/release-please.yml:23` / secret 未登録だと `token:` が空文字に解決され、release-please-action は内部の GITHUB_TOKEN フォールバックを持たない構成のため「PR/タグが作られない」サイレント挙動になりうる。コードとしては正しく、PAT 登録は operator 前提として plan/docs/PR body に明記済みのため Blocker ではない（前回 W-001 と同一。修正不要の運用留意点として再掲）。 / 提案: 初回マージ後に Actions で release-please ジョブが green かつリリースPR 1本生成を目視確認する運用チェック（plan テスト方針 AC-1 に既述）。コード追加対応は不要。

### Notes

- **[N-001]** release-please-config.json のスキーマは実在キーのみで正しい。`release-type`（`node`）/ `include-component-in-tag`（boolean）/ `packages` はいずれも config schema のトップレベル正規キー。`packages: { ".": {} }` は root 単一パッケージのマニフェスト型として正しく、`.release-please-manifest.json` の `{".": "0.1.0"}` とキー（`"."`）が整合。`$schema` 付与でエディタ補完・検証が効く。JSON は Biome フォーマット済みの整形（2スペース・末尾改行）。

- **[N-002]** タグ形式 `vX.Y.Z` の担保が二重に堅い。`include-component-in-tag: false`（トップレベル=全パッケージ既定に明示）に加え、単一 root パッケージで component 名を与えていないため、デフォルト挙動が変わっても component が付与されない。`include-v-in-tag` デフォルト true で `v` プレフィックス。結果 `v0.1.0` が `on.push.tags: ["v*.*.*"]` と deployment branch policy `v*.*.*` の双方に一致。

- **[N-003]** PAT 採用が妥当。GITHUB_TOKEN で作成したタグが tag-triggered の `deploy-production.yml` を起動しないのは GitHub の確定仕様であり、release-please→deploy-production 連鎖の成立に PAT が必須。`token: RELEASE_PLEASE_TOKEN` は正しい対処で、ADR-001 とも整合。

- **[N-004]** `permissions: contents: write / pull-requests: write` は release-please-action@v4 に十分かつ最小。PR 作成（pull-requests: write）、CHANGELOG コミット・タグ・Release 作成（contents: write）をカバー。これは GITHUB_TOKEN のスコープであり、実タグ push 名義となる PAT のスコープ（docs に classic `repo`+`workflow` / fine-grained contents/pull-requests/workflows と明記）とは別物。両者の役割分担が正しく整理されている。

- **[N-005]** `concurrency.group: release-please` + `cancel-in-progress: false` が適切。連続 main push を直列化し、リリースPRの競合・重複を防止。`cancel-in-progress: false` で実行中の release-please を後続が中断せず PR upsert の取りこぼしを防ぐ。deploy-staging（group: deploy-staging）/ deploy-production（group: deploy-production）/ ci（group: workflow-ref）とグループ名が全て独立しており、相互の直列化干渉が無いことも確認。

- **[N-006]** `Generate release notes` 削除が YAML を壊していない。実体確認の結果、削除後 `Inject secrets`（L122-151）がジョブ最終ステップとなりインデント・ステップ境界とも健全。削除されたのは末尾ステップのみで、Pulumi up / Render / Build / D1 migrations / Validate secrets / Deploy Workers / Inject secrets の前段に副作用なし。

- **[N-007]** GITHUB_TOKEN の唯一の参照が消えても問題ない。deploy-production.yml 全文を確認し、`secrets.GITHUB_TOKEN` を参照していたのは削除された `Generate release notes` のみ。残る全ステップは PULUMI / CLOUDFLARE / SOPS_AGE_KEY 系 secret を使い GITHUB_TOKEN に非依存。削除によるデプロイ動作への影響なし。

- **[N-008]** `workflow_dispatch`（緊急手動デプロイ）経路への副作用なし。deploy-production.yml は `on.push.tags` と `workflow_dispatch` の両起動を持つが、削除された `Generate release notes` はタグ ref 前提のステップで手動経路では元々付随的。削除後も手動デプロイは Pulumi→render→build→migrate→validate→deploy→inject を完走。docs にも緊急時の手動タグ push 手順（ロールバック節）が残り運用の逃げ道を確保。

- **[N-009]** `deploy-staging.yml`（main push トリガー）と release-please の並走に干渉なし。両者 `on.push.branches: [main]` で並走するが concurrency group が別で独立。staging は最新 main を反映、release-please は PR を upsert するだけ。リリースPRマージ（version bump + CHANGELOG のみ）での staging 再デプロイは冗長だが無害。staging を触らない plan 判断は正しい（deploy-staging.yml は差分ゼロを確認）。

- **[N-010]** `ci.yml` は無変更で正しい。`on.pull_request.branches: [main]` のためリリースPRに対しても lint/format/typecheck/unit/integration/build が走る。リリースPRは version bump + CHANGELOG のみで CI green 維持の想定。差分ゼロを確認。

- **[N-011]** `package.json` の `version` 追加位置・形式が正しい。`"name": "hollow"` 直後・`"private": true` 前（L3）に `"version": "0.1.0"`。node/npm 規約に沿う位置で release-type: node の bump 対象として認識される。`private: true` のままでも release-please の version 管理には影響しない（publish しないだけ）。

- **[N-012]** ドキュメント整合性が高い。README / docs/deployment_setup.md ともに旧 `pnpm version + git push --follow-tags` を削除し、release-please フロー・squash merge 統一・"Default commit message"="Pull request title"・PAT 前提・deployment branch policy `v*.*.*`・PAT 失効時のトラブルシュートを網羅。README の「creates a GitHub Release」の主語が release-please へ移り、二重 Release の誤解を排除。AC-7/AC-8 を満たす。

- **[N-013]**（Round 2 追記）前回 review-001-cicd.md の W-002（fork での無駄起動を防ぐ `if: github.repository == ...` ガード）は、単一リポ運用では実害がほぼ無く、見送り記録済みの任意強化。本 Round でも Blocker/Warning に昇格させる根拠は無く、現状維持で妥当と再確認した（Note 級）。

---

## 総評

CI/CD・リリースフロー観点で **Blocker なし / 新規 Warning なし**（W-001 は前回からの継続で修正不要の運用留意点）。

release-please の config/manifest/package.json version の整合、タグ形式 `v*.*.*` の二重担保、PAT 採用の妥当性、`Generate release notes` 削除による Release 所有の一本化（YAML 健全・GITHUB_TOKEN 参照の完全消失）、deploy-staging / ci.yml との非干渉まで、plan.md・ADR 通りに正しく実装されている。差分は前回 Round から変化がなく、ゼロベース再検証でも品質判断は不変。PR として承認可能。
