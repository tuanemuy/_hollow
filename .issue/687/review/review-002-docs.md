# PR #693 レビュー（2回目）— ドキュメント整合性・運用手順

対象: PR #693 / 実装計画 `.issue/687/plan.md`（AC-7・AC-8）
観点: ドキュメント整合性・運用手順
前回: review-001-docs.md（W-001 ロールバック注記・W-002 PAT scope は今回修正済みとして確認）

## 受け入れ基準の検証

- **AC-7（ドキュメント更新）**: 充足。`docs/deployment_setup.md` L11 で `pnpm version` + タグ push の「廃止」を明記し、release-please フロー（squash merge → リリース PR → タグ → 承認 → デプロイ）を 5 ステップで記載。`README.md` Release flow 節（L139-146）も同期。Release の主語が release-please に統一されている。`deploy-production.yml` の `Generate release notes` ステップが実ファイルから削除済み（末尾が secret bulk ループ）であることと整合。
- **AC-8（squash 統一手順）**: 充足。`docs/deployment_setup.md` L26 に「squash merge のみ有効」「"Default commit message" を "Pull request title"」「1 PR = 1 conventional commit」を記載。

両 AC とも満たされている。

## 前回指摘の修正確認

- **W-001（ロールバックと manifest の齟齬）**: 修正済み。ロールバック節（L35-50）が優先順位付き（1. Cloudflare ダッシュボード → 2. revert PR を squash merge → 3. 手動タグ push が最終手段）に再構成され、`[!WARNING]` で「手動タグは release-please 管理外。manifest とズレ次回バージョン計算が狂う。打った場合は `.release-please-manifest.json` と `package.json` の version を手当てして整合させる」と明記。前回提案を的確に反映。
- **W-002（PAT scope 過剰）**: 修正済み。L25 が「classic PAT なら `repo` scope のみ、fine-grained PAT なら contents: write / pull-requests: write のみで十分」に変更され、「`.github/workflows/` 配下を改変しないため `workflow` / `workflows` 権限は不要」と理由付きで最小権限化。release-please.yml の実挙動（PR/タグ/Release のみ作成）と一致。

## ドキュメント整合性

### Blockers
- なし

### Warnings

- **[W-001]** `GITHUB_TOKEN` の workflow permissions 前提記載が実構成とねじれている / `docs/deployment_setup.md:29` / release-please.yml は action の `token:` に `RELEASE_PLEASE_TOKEN`（PAT）を渡しており、リリース PR / タグ / Release の作成はすべて PAT 名義で行われる。workflow 冒頭の `permissions: contents/pull-requests: write` も明示済み。したがって「`GITHUB_TOKEN` の workflow permissions（contents/pull-requests: write）がリポジトリ / Organization 設定で許可されていること」という前提は、本フローの成立条件としては実質不要かミスリーディング。W-002 修正で「PAT は最小権限で十分」「release-please は PAT 名義で動く」と整理した一方、この行だけ旧来の「GITHUB_TOKEN に write 権限が要る」前提が残っており、読み手に「結局どちらのトークンに何の権限が要るのか」を混乱させる。/ 理由: PAT 運用に一本化した本文と、GITHUB_TOKEN 権限前提の併記が整合しない（修正の取りこぼし）。/ 提案: この箇所を削除するか、「本フローは PAT 名義で動くため GITHUB_TOKEN の追加権限は不要。ただしリポジトリ / Org の Actions 設定が write を一律ブロックしていると workflow の `permissions` 宣言が効かない点のみ確認」と、PAT 一本化と矛盾しない注記に書き換える。

### Notes

- **[N-001]** ロールバックのタグ例にバージョンの飛びがある（指摘ではなく参考）/ `docs/deployment_setup.md:44-46`。`git checkout v0.1.0` の直後に `git tag v0.1.2` を打つ例で v0.1.1 を飛ばしている。WARNING で「manifest と齟齬が出る」旨は既述のため運用上の害は限定的だが、例として「直近正常版にロールバックするなら次の patch を振る」意図が読み取りにくい。プレースホルダ感を出すなら `vX.Y.Z`（次パッチ）等のコメントを 1 行添えるとより明確。
- **[N-002]** Release ノート所有の一本化が README・deployment_setup 双方で矛盾なく明記。README L146「release-please is the sole owner of the GitHub Release; the deploy workflow only deploys and does not create a Release」と deployment_setup L19「生成元は release-please に一本化（deploy ワークフローは Release を作らない）」が一致し、`deploy-production.yml` からの `Generate release notes` 削除（diff 確認済み）と整合。AC-5/AC-7 の趣旨を正確に反映。
- **[N-003]** タグ形式の前提が設定ファイルと一致。`release-please-config.json`（`include-component-in-tag: false` + `packages: {".": {}}`）→ 生成タグ `vX.Y.Z` が、`deploy-production.yml` `on.push.tags: ["v*.*.*"]`、README 互換表「tag `v*.*.*`」（L125）、deployment_setup「deployment branch policy `v*.*.*`」（L28）と一貫。`package.json` `version: "0.1.0"` と `.release-please-manifest.json` `"."`: `"0.1.0"` も一致（AC-6）。
- **[N-004]** ロールバック節と「手動タグ push を最終手段」の位置づけが、README の「There is no manual `pnpm version` + tag push」（L139）と論理的に両立。README の否定は「通常リリースフローに手動タグ push は無い」という意味であり、緊急ロールバックの最終手段としての手動タグとは別文脈。誤読リスクは低く矛盾なし。
- **[N-005]** トラブルシュート節（L31-33）が PAT 失効時の 2 症状（リリース PR が作られない／タグが deploy を起動しない）を案内し、release-please.yml の `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}` および PAT 必須の理由（GITHUB_TOKEN 確定仕様）と整合。運用ドキュメントとして質が高い。
