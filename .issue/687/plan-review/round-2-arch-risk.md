# Plan Review — Issue #687 (Round 2)

**視点:** アーキテクチャ整合性・実現可能性・リスク
**対象:** `.issue/687/plan.md` / `.issue/687/adr.md`（1周目反映後）
**レビュー日:** 2026-06-13

---

## 1周目指摘の反映確認

1周目の全指摘について、plan / ADR への反映を実ファイル（`.github/workflows/deploy-production.yml`, `deploy-staging.yml`, `package.json`）と release-please の公式 schema / action README に照合して検証した。

- **P-001（PAT 必須化）**: 完全反映。AC-3（L19）、ステップ4 の YAML（`token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`, L190）、ステップ4 末尾の根拠説明（L198）、ステップ7 ドキュメント前提（L222）、リスク欄（L239）、ADR-001 Decision（L25）/ Consequences（L29）すべてで「PAT 必須・確定」に統一されている。「まず GITHUB_TOKEN、ダメなら PAT」という条件付き表現は全箇所から消えている。GitHub 公式仕様（GITHUB_TOKEN 起因のタグ push は他ワークフローを起動しない）も release-please-action README で確認でき、PAT 一択という結論は正しい。
- **P-002（Generate release notes 削除の workflow_dispatch 影響）**: 反映済み。ステップ5 に「workflow_dispatch 経路への影響」節（L205）が追加され、tag 経路・workflow_dispatch 経路の双方で Release 作成が消えること、手動デプロイはデプロイのみ行い Release を作らないのが正しい責務分離であることが明記された。実ファイルでも当該ステップは L153-160 に存在し、削除対象の特定（plan の行番号記載）が正確。
- **S-001（include-component-in-tag 記載のトップレベル統一）**: 反映済み。ADR-002 Decision（L44, L49）が「トップレベル（global = 全パッケージ既定）に指定」に統一され、plan ステップ2 の JSON（トップレベル指定）と表現が一致した。schema 上も `include-component-in-tag` はトップレベルで有効と確認済み。
- **S-003（deploy-staging 並走の明示）**: 反映済み。設計のトリガー連鎖図（L84）に deploy-staging を並走として描き、注記（L100）で「main push 1回につき deploy-staging と release-please が並走、互いに独立で干渉しない／リリースPRマージの push でも staging が起動するが無害」と明記。
- **S-004（bootstrap-sha 逃げ道）**: 反映済み。ADR-003 Consequences の「逃げ道」（L79）に bootstrap-sha を初回限定の選択肢（今回不採用）として記録。
- **coverage S-001/S-002**: AC-7 に README を対象に含める根拠（L23）、AC-8 に default commit message 設定手順（L24）が反映済み。

反映は plan / ADR / AC / ステップ / リスク / ドキュメント前提のすべてに一貫しており、1周目指摘に対する取りこぼし・部分反映はない。

---

## 技術的正確性の再確認

- **release-please-config.json の schema 実在キー**: 公式 schema（`schemas/config.json`）でトップレベルに `release-type` / `include-component-in-tag` / `include-v-in-tag` / `packages` がすべて定義されていることを確認。plan ステップ2 の JSON は schema 準拠で valid。
- **タグ形式**: `include-component-in-tag` のデフォルトは `true`（schema 明記）。root 単一パッケージで component 名が空のため実害は出ないが、plan が明示的に `false` を置くのは正しい保険。`include-v-in-tag` デフォルト `true` で `v` プレフィックスが付き、結果 `vX.Y.Z` が `deploy-production.yml` の `v*.*.*` および environment の deployment branch policy に一致する。整合確認（ステップ6）も妥当。
- **release-please-action@v4 の inputs**: `config-file` / `manifest-file` / `token` がすべて有効な input であることを README で確認。`token` 未指定時のデフォルトは `GITHUB_TOKEN` のため、plan が明示的に `RELEASE_PLEASE_TOKEN` を渡すのは P-001 の帰結として正しい。
- **PAT scope**: plan / ADR の記載「classic PAT なら `repo` + `workflow` / fine-grained PAT なら contents:write + pull-requests:write（+ workflows）」は release-please が必要とする操作（PR 作成、commit/tag push、Release 作成、ワークフローファイルに触れうる）に対して妥当。fine-grained で workflows 権限を挙げているのは、release-please がワークフローを変更しない限り厳密には不要だが、保守的な過剰付与であり害はない。
- **実ファイル整合**: `package.json` に `version` 欠落（確認済み）、`deploy-production.yml` の `on: push.tags + workflow_dispatch`・末尾 Generate release notes（softprops/action-gh-release@v2）・environment production の存在、`deploy-staging.yml` の main push トリガー、タグ実績ゼロ — plan の調査結果はすべて実ファイルと一致。

---

#### 問題点（要修正）

問題点ゼロ。

1周目指摘はすべて plan / ADR に正しく一貫反映されており、release-please の設定・PAT 要件・タグ形式・ワークフロー連鎖の技術的記述は公式 schema / action README と実ファイルに照合して正確。既存ワークフロー（deploy-staging / ci / deploy-production のデプロイ責務）を壊す要素は新たに発生していない。新たな矛盾・見落とし依存も検出されなかった。

#### 改善提案（検討推奨）

- **[S-001]** plan L106 の「`include-component-in-tag` は単一パッケージでは false が既定相当」という表現は、schema 上のデフォルトが `true` である事実とわずかにズレる（実害なし）。正確には「root 単一パッケージは component 名が空なのでデフォルト `true` でもタグに component は付かないが、念のため `false` を明示する」。文言レベルの精度向上であり機能には影響しない。修正は任意。

- **[S-002]** ステップ5 で `Generate release notes` を削除すると `deploy-production.yml` から `secrets.GITHUB_TOKEN` の唯一の利用箇所が消える。残ステップに GITHUB_TOKEN 依存は無いため動作上の問題はないが、削除後に未使用の env 参照や宙ぶらりんなコメントが残らないよう、ステップ全体（L153-160）をブロックごと除去することを実装時に確認するとよい（plan は「ステップ全体を削除」と明記済みなので方針は正しい。念のための注意喚起）。

- **[S-003]** PAT の有効期限切れは「タグは作られるが deploy-production が起動しない」または「リリースPR自体が作られない」という形でサイレントに顕在化しうる運用リスク。ADR-001 Consequences で「期限管理が発生する」と触れているのは良いが、ドキュメント（ステップ7 の前提節）に「PAT 失効時の症状（release-please ジョブの失敗 / タグが deploy を起こさない）」を1行添えると、初回以降の運用者がトラブルシュートしやすい。採用は任意。

#### 良い点

- 1周目の P-001/P-002/S-001〜S-004 がすべて取りこぼしなく、かつ plan・ADR・AC・実装ステップ・リスク欄・ドキュメント前提の全断面で一貫して反映されている。表現の食い違い（ADR-002 のトップレベル統一）まで解消されており、反映品質が高い。
- PAT 必須を「確定仕様」として AC-3 に組み込み、検証可能な受け入れ基準に落とし込んでいる。実装フェーズでの手戻り（GITHUB_TOKEN で進めて連鎖失敗）を構造的に排除できている。
- workflow_dispatch 経路への影響を両経路で確定させ、「手動デプロイは Release を作らない＝正しい責務分離」と結論づけた点が的確。緊急再デプロイ経路の挙動を曖昧に残していない。
- release-please の設定（マニフェスト型単一パッケージ、include-component-in-tag: false トップレベル）が公式 schema に準拠し、生成タグ `vX.Y.Z` が既存 `v*.*.*` トリガーに一致することを config レベルで保証している。ワークフロー側を一切改変せず連鎖させる最小侵襲設計を維持。
- スコープ外（deploy-staging / ci.yml）を明示し、既存挙動の温存を最優先。operator 作業（PAT 登録、squash 設定、deployment branch policy）を「コードで完結しない前提」として ADR / ドキュメントに切り出しており、CI/CD 変更の落とし穴を踏んでいない。
