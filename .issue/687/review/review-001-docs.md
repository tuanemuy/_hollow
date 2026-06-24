# PR #693 レビュー — ドキュメント整合性・運用手順

対象: PR #693 / 実装計画 `.issue/687/plan.md`（AC-7・AC-8）
観点: ドキュメント整合性・運用手順

## 受け入れ基準の検証

- **AC-7（ドキュメント更新）**: 充足。`docs/deployment_setup.md` から `pnpm version patch && git push --follow-tags` が完全に消え（L11 で「廃止」と明記）、release-please フロー（squash merge → リリースPR → タグ → 承認 → デプロイ）が記載されている。`README.md` の Release flow 節も同様に更新され、Release の主語が release-please に変更されている（L139, L146）。`deploy-production.yml` の `Generate release notes` ステップ削除と整合。
- **AC-8（squash 統一手順）**: 充足。`docs/deployment_setup.md` L26 に「merge button は squash merge のみ有効」「"Default commit message" を "Pull request title" に設定」「1 PR = 1 conventional commit を担保」が記載されている。

両 AC とも満たされている。以下は厳密性・整合性の観点での指摘。

## ドキュメント整合性

### Blockers
- なし

### Warnings

- **[W-001]** ロールバック手順の手動タグ push が release-please の manifest と整合しない / `docs/deployment_setup.md:35-43` / 通常運用では release-please が `.release-please-manifest.json`（現状 `0.1.0`）を真実の源としてバージョンを積み上げる。しかしロールバック節は `git tag v0.1.2 && git push origin v0.1.2` という手動タグ push を「緊急時の deploy 起動手段」として案内している。この手動タグは manifest に反映されないため、(a) 次回 release-please リリースPR がバージョン番号を実態とズレた値で計算する（manifest の 0.1.0 起点のままになり、手動で打った v0.1.2 を知らない）、(b) 手動タグ push が `RELEASE_PLEASE_TOKEN`（PAT）ではなく operator のローカル認証で行われるため、PAT 名義タグと混在し「どのタグが deploy を起動するか」の前提（GITHUB_TOKEN 問題）とは別経路になる、という2点が運用上の落とし穴になる。「緊急時の手動タグ push はあくまで一時的なデプロイ起動であり、その後 release-please の manifest / 次回リリースPR と齟齬が出るため、復旧後は通常フローに戻す（または manifest を手当てする）」旨の注記が欲しい。/ 提案: ロールバック節に「手動タグは release-please の管理外。緊急デプロイ後は通常フロー（リリースPR）に復帰すること。Cloudflare ダッシュボードロールバックを第一手段とし、手動タグ push は最終手段」と1〜2行追記する。

- **[W-002]** classic PAT の `workflow` scope は release-please の動作に不要な可能性 / `docs/deployment_setup.md:25` および `README.md` 経由の前提記載 / release-please-action は「リリースPR の作成・更新（pull-requests: write）」と「タグ + Release の作成（contents: write）」のみを行い、`.github/workflows/` 配下のワークフローファイルを書き換えない。classic PAT の `workflow` scope は「ワークフローファイルの更新権限」を表すため、release-please の通常運用では本来不要。ドキュメントは classic PAT に `repo` + `workflow` を要求しているが、`workflow` を必須として書くと operator に過剰な権限を付与させることになる（最小権限原則に反する）。fine-grained 側の `workflows` 記載も同様。/ 理由: 記載 scope が実装（release-please.yml が要求する操作）より広い。誤った（過剰な）scope 記載。/ 提案: classic PAT は `repo` のみ必須とし、`workflow` は「不要（ワークフローファイルを書き換える運用を将来追加する場合のみ）」と注記する。fine-grained PAT は contents: write / pull-requests: write のみ必須とし、workflows 権限は外すか「任意」と明記する。

### Notes

- **[N-001]** Release ノートの主語の一本化が README・deployment_setup の双方で明確。「release-please is the sole owner of the GitHub Release; the deploy workflow only deploys and does not create a Release」（README L146）、「GitHub Release / リリースノートの生成元は release-please に一本化されている（deploy ワークフローは Release を作らない）」（deployment_setup L19）と、両ドキュメントで矛盾なく記載されている。`deploy-production.yml` から `Generate release notes` ステップが実際に削除されている（diff 確認済み）ことと整合。AC-5/AC-7 の趣旨を正確に反映。

- **[N-002]** タグ形式の前提が config と一致。`release-please-config.json` の `include-component-in-tag: false` + 単一 root パッケージ（`packages: { ".": {} }`）により生成タグは `vX.Y.Z`。これが `deploy-production.yml` の `on.push.tags: ["v*.*.*"]`（L4-6 確認済み）および README の互換表「tag `v*.*.*`」（L125）、deployment_setup の「deployment branch policy が `v*.*.*`」（L28）と一貫している。`package.json` `version: "0.1.0"` と `.release-please-manifest.json` の `"."`: `"0.1.0"` も一致（AC-6）。

- **[N-003]** PAT 必須の理由（GITHUB_TOKEN で作成したタグは他ワークフローを起動しない GitHub 確定仕様）が deployment_setup L25 に明記され、release-please.yml の `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`（L23 確認済み）と整合。トラブルシュート節（L31-33）で PAT 失効時の症状（リリースPR が作られない／タグが deploy を起動しない）まで案内しており、運用ドキュメントとして質が高い。

- **[N-004]** 軽微な表現差（指摘ではなく参考）: README step3 は「the GitHub Release with auto-generated notes」と auto-generated notes に言及するが、deployment_setup の step3（L15）は「`vX.Y.Z` タグ + GitHub Release を自動生成」とノート自動生成への言及がやや薄い。意味は一致しており矛盾はないため Blocker/Warning ではないが、両者の粒度を揃えるなら deployment_setup 側にも「（リリースノート自動生成）」を補ってもよい。
