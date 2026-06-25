# Plan Review — Issue #687 (Round 1)

**視点:** アーキテクチャ整合性・実現可能性・リスク
**対象:** `.issue/687/plan.md` / `.issue/687/adr.md`
**レビュー日:** 2026-06-13

---

#### 問題点（要修正）

- **[P-001]** GITHUB_TOKEN による tag push が `deploy-production.yml` を起動しないのは「可能性」ではなく GitHub の**確定仕様**であり、計画が「まず GITHUB_TOKEN、起動しなければ PAT」の条件付きにしているのは実装フェーズで確実に手戻りを生む。
  - 理由: GitHub Actions の公式仕様で「`GITHUB_TOKEN` を使って行った push / tag 作成は、再帰防止のため別ワークフローを起動しない」と明記されている（"When you use the repository's GITHUB_TOKEN to perform tasks, events triggered by the GITHUB_TOKEN ... will not create a new workflow run"）。これは release-please の最頻出の落とし穴であり、本リポの構成（release-please がタグを作る → tag-triggered deploy-production）はまさにこの制約を直撃する。計画通り GITHUB_TOKEN で進めると AC-3（タグ→デプロイ自動連鎖）が**必ず失敗**し、初回リリースで「タグはできたが Deploy (production) が起動しない」事象に陥る。「実装時に検証して切替」ではなく、検証結果は既に判明している。
  - 提案: 最初から PAT 前提で計画・ADR を確定する。具体的には (a) `secrets.RELEASE_PLEASE_TOKEN`（fine-grained PAT: contents write / pull-requests write、または classic `repo` + `workflow`）を前提とし、release-please-action の `token:` に渡す。(b) これにより release-please が PAT 名義でタグを push し、deploy-production が起動する。(c) PAT 不採用の代替として「deploy-production を tag push ではなく `release` イベント（`on.release.types: [published]`）で起動する」案も成立する（GITHUB_TOKEN が作る Release でも `release` published イベントは…実は同じ再帰防止対象なので不可）。よって**実質 PAT 一択**。secret 追加が「コードで完結しない operator 作業」である点も S7 のドキュメント前提節に明記すること。ADR-001 の token に関する記述（「まず GITHUB_TOKEN、ダメなら PAT」）を「PAT 必須」に書き換える。

- **[P-002]** `deploy-production.yml` の `Generate release notes`（`softprops/action-gh-release@v2`）削除に伴い、**`workflow_dispatch`（手動再デプロイ）経路で Release 作成がなくなる**点は問題ないが、計画はこのステップが「タグ push 以外でも実行されていた」事実に触れていない。現状このステップは tag コンテキストが無い `workflow_dispatch` 実行時にどう振る舞うかが未検証のまま削除判断がされている。
  - 理由: 現行 `deploy-production.yml` は `on: push.tags` と `workflow_dispatch` の両方で起動する。`softprops/action-gh-release` は tag ref が無い（`workflow_dispatch` を任意 ref で実行）と Release を作れず失敗 or no-op になる。削除自体は正しい方向だが、「削除しても他ステップに影響がない」という AC-5 / 計画の主張は、tag 経路のみを見ており workflow_dispatch 経路の現状挙動を確認していない。削除すれば両経路とも Release を作らなくなる（＝release-please に一本化）ので結論は変わらないが、レビュー観点として「現状 workflow_dispatch 時にこのステップが何をしていたか（おそらく失敗 or 直近タグに対する Release 化）」を1行確認しておくべき。
  - 提案: 計画の S5 に「このステップ削除により tag 経路・workflow_dispatch 経路の双方で deploy 側 Release 作成が消える。workflow_dispatch（緊急再デプロイ）はデプロイのみ行い Release を作らないのが正しい責務分離」と明記し、削除の影響範囲を両経路で確定させる。実害はないため修正は文言追記レベル。

#### 改善提案（検討推奨）

- **[S-001]** `release-please-config.json` の `include-component-in-tag: false` を**トップレベルと per-package の両方**で意図を確定させるべき。
  - 理由: release-please-action@v4 / manifest 構成では、`include-component-in-tag` はトップレベル（全パッケージ既定）でも `packages["."]` 内でも指定でき、per-package がトップレベルを上書きする。計画ステップ2の JSON はトップレベルに `include-component-in-tag: false`、`packages` は `"." : {}`（空）としており、これは「トップレベル既定が root に継承される」ので正しく動く。ただし ADR-002 本文は「`include-component-in-tag: false` を root パッケージに設定」と書いており、計画の JSON（トップレベル指定）と表現が食い違う。どちらでもタグは `vX.Y.Z` になるが、ドキュメント間の不一致は実装者の混乱要因。単一 root パッケージなら component 名はそもそも空なので、実は `include-component-in-tag` を指定しなくてもタグに component は付かない（保険として false 明示は妥当）。計画 JSON とおりトップレベル指定で統一し、ADR-002 の「root パッケージに設定」を「トップレベル（全パッケージ既定）に設定」へ表現統一すると齟齬が消える。

- **[S-002]** `release-please-action@v4` は内部実装が変わっており、**`token` 未指定時のデフォルトが `GITHUB_TOKEN`**である。計画ステップ4で `token: ${{ secrets.GITHUB_TOKEN }}` を明示しているが、P-001 を受けて PAT に変えるなら `${{ secrets.RELEASE_PLEASE_TOKEN }}` に直接書き換える。あわせて `concurrency.group: release-please` は妥当だが、deploy-staging も同じ main push で同時起動する点（後述 S-003）と group 名が衝突しないことを確認済みとして残す（別 group なので問題なし）。
  - 理由: 実装者がそのまま GITHUB_TOKEN で書くのを防ぐため、token 行を最初から PAT に確定しておくのが安全。

- **[S-003]** トリガー連鎖と `deploy-staging.yml`（main push 起動）の**並走**を計画に明示すべき。
  - 理由: main へ squash merge すると、同一 push で (a) `deploy-staging.yml`（main push）と (b) `release-please.yml`（main push）が**同時起動**する。これは設計上正しい（staging は常時最新、release-please は release PR を upsert するだけ）が、計画のトリガー連鎖図には deploy-staging が並走する旨が無い。さらに「release PR 自体を main へマージした push」でも deploy-staging が起動する（release PR の中身は version bump + CHANGELOG のみなので staging 再デプロイは無害だが冗長）。干渉・破壊はしないが、レビュー観点として「main push 1回につき staging デプロイ + release-please が両方走る」ことを明記し、想定挙動として確定させると運用時の混乱を防げる。CI（`ci.yml`）は release PR に対しても走る（pull_request）ので、release PR が CI green を要求されるかはブランチ保護依存——計画 L41 で言及済みなのは良い。

- **[S-004]** 初回リリース PR が全コミット履歴を拾う件（計画リスク欄に記載済み）について、`.release-please-manifest.json` の初期値だけでは「どのコミットから集計を始めるか」の基準が無く、release-please は**最後のリリースタグが無い場合リポジトリ全履歴を走査**する。0.1.0 始まりで許容とあるが、初回 CHANGELOG が巨大化する。これを抑えたい場合のみ `bootstrap-sha`（特定コミット以降のみ集計）を初回限定で使う選択肢がある旨を ADR-003 に1行残すと、実装時の判断材料になる（採用は任意、現方針＝全履歴許容でも可）。
  - 理由: 「許容範囲」の判断が後で覆ったときの逃げ道（bootstrap-sha）を明記しておくと手戻りが減る。

#### 良い点

- tag-triggered の `Deploy (production)` を維持し「タグの生成方法だけ」を差し替える、という最小侵襲の設計判断が的確。既存の承認ゲート（production environment / required reviewers）・Pulumi・SOPS 連鎖を一切壊さない。
- Release 所有を release-please に一本化し deploy 側 `Generate release notes` を削除する判断（ADR-001）は、「deploy 失敗時にタグはあるが Release が無い／二重作成」という不整合を構造的に排除しており妥当。責務分離が明確。
- 二重 Release 競合の発生源（`softprops/action-gh-release@v2` ステップ）を事前に特定し、削除を明示している点が正確。実装漏れ（削除忘れ）のリスクも検証項目（AC-5）に落とし込めている。
- squash 統一・deployment branch policy・workflow permissions など「コードだけで完結しない operator 設定変更」を ADR-003 / S7 で明記しており、CI/CD 変更の落とし穴を踏んでいない。
- `deploy-staging.yml` / `ci.yml` を「触らない」と明示的にスコープ外に置き、既存挙動の温存を最優先している。
- マニフェスト型単一パッケージ構成は release-please の推奨構成かつ将来のモノレポ化に拡張しやすく、`release-type: node` で `package.json` の version を bump 対象にする選択も正しい。`package.json` の version 欠落（現状 undefined）を前提整備として埋める点も的確。
