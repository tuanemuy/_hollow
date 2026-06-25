# PR #693 レビュー（3回目・収束確認）— ドキュメント整合性・運用手順

対象: PR #693 / 実装計画 `.issue/687/plan.md`（AC-7・AC-8）
観点: ドキュメント整合性・運用手順
前回: review-001-docs.md / review-002-docs.md
判定: **APPROVED（収束）** — Blocker 0 / Warning 0 / Note 5

## 差分の取得元に関する注意（レビュー前提）

`gh pr diff 693` のキャッシュは Round 2 時点の `docs/deployment_setup.md`（GITHUB_TOKEN workflow permissions 行が残っていた版）を返す。
実際には Round 2 指摘（W-001）の修正が working tree に適用済みで、`git diff HEAD -- docs/deployment_setup.md` に未コミットの追加修正が存在する。本レビューは **working tree の最新内容**（実ファイル `docs/deployment_setup.md` 現状）を正として検証した。

> 運用上の注意（Note ではなく手続き）: この working-tree 変更がまだ PR にコミット・push されていない。レビュー対象の内容自体は良好だが、**マージ前にこの修正をコミットして PR #693 に反映する**こと。push されないと Round 2 の W-001 が PR 上は未修正のまま残る。

## 受け入れ基準の検証

- **AC-7（ドキュメント更新）**: 充足。`docs/deployment_setup.md` production 節（L11-19）で `pnpm version` + タグ push の廃止を明記し、release-please フロー（squash merge → リリース PR → タグ → 承認 → デプロイ）を 5 ステップで記載。`README.md` Release flow 節（L139-146）も同期し、Release の主語が release-please に統一。`deploy-production.yml` から `Generate release notes` 削除済み（末尾が secret bulk ループ）と整合。
- **AC-8（squash 統一手順）**: 充足。`docs/deployment_setup.md` L26 に「squash merge のみ有効」「"Default commit message" を "Pull request title"」「1 PR = 1 conventional commit」を記載。

両 AC とも満たされている。

## Round 2 指摘（W-001）の修正確認

- **W-001（GITHUB_TOKEN workflow permissions 行のねじれ）**: 修正済み。旧 L29 の「`GITHUB_TOKEN` の workflow permissions が前提」という箇条書きが削除され、代わりに L30 へ「release-please は PAT 名義で動くため `GITHUB_TOKEN` の権限設定は release-please の動作に影響しない。`release-please.yml` の `permissions:` ブロックは慣例として最小権限を明示しているだけで operator が別途設定する必要はない」という整理に置換。PAT 一本化の本文（L25 の `repo` scope のみ / contents・pull-requests: write のみ）と矛盾しなくなり、「どちらのトークンに何の権限が要るのか」の混乱が解消。release-please.yml の実挙動（`token: ${{ secrets.RELEASE_PLEASE_TOKEN }}` で PAT 名義、冒頭 `permissions: contents/pull-requests: write`）とも一致。指摘を的確に反映。

## ドキュメント整合性

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** PAT scope 記述の技術的正確性を確認。L25「`.github/workflows/` 配下を改変しないため `workflow` / `workflows` 権限は不要」は正しい。release-please-action@v4 はリリース PR・タグ・Release のみを生成し workflow ファイルを書き換えないため、classic PAT の `workflow` scope / fine-grained の `workflows: write` は不要。最小権限（classic `repo` のみ、fine-grained contents+pull-requests: write のみ）の記載は妥当。
- **[N-002]** PAT 一本化の記述が全体で一貫。`docs/deployment_setup.md`（L25 PAT 必須・L30 GITHUB_TOKEN は無関係・L34 トラブルシュート）と `README.md` L146（`RELEASE_PLEASE_TOKEN` PAT を前提として列挙）が矛盾なく整合。README は GITHUB_TOKEN に一切言及せず、scope を deployment_setup.md に委譲しているため二重記述の齟齬リスクもなし。
- **[N-003]** タグ形式の前提が設定ファイルと一貫。`release-please-config.json`（`include-component-in-tag: false` + `packages: {".": {}}`）→ 生成タグ `vX.Y.Z` が、`deploy-production.yml` `on.push.tags: ["v*.*.*"]`、README 互換表「tag `v*.*.*`」（L125）、deployment_setup L28「deployment branch policy `v*.*.*`」と一致。`package.json` `version: "0.1.0"` と `.release-please-manifest.json` `{".": "0.1.0"}` も一致（AC-6）。
- **[N-004]** ロールバック節（L36-51）の Round 2 修正が反映され良好。優先順位付き（1. Cloudflare ダッシュボード → 2. revert PR を squash merge → 3. 手動タグ push が最終手段）に再構成され、`[!WARNING]` で「手動タグは release-please 管理外。manifest とズレ次回バージョン計算が狂う。打った場合は `.release-please-manifest.json` と `package.json` の version を整合させる」と明記。README L139「There is no manual `pnpm version` + tag push」とも論理的に両立（通常フローに手動タグは無い／緊急ロールバックの最終手段は別文脈）。
- **[N-005]** ロールバックのタグ例（L45-47 `git checkout v0.1.0` → `git tag v0.1.2`）は v0.1.1 を飛ばしているが、直前の WARNING で「manifest と齟齬が出るので手当てが必要」と明示されているため誤運用リスクは限定的。Round 2 の N-001 と同じ参考事項で、Blocker/Warning ではない。気になればプレースホルダである旨のコメント 1 行を添えると親切（必須ではない）。

## 結論

Round 2 の W-001（GITHUB_TOKEN 権限行のねじれ）は working tree で適切に修正され、ロールバック節の注記・PAT 最小権限化も整合済み。新たな矛盾・Blocker・Warning は検出されず、ドキュメント整合性は収束した。
唯一の手続き上の注意は「working-tree の修正を PR #693 にコミット・push すること」（マージ前必須）。内容面は APPROVED。
