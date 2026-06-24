# ADR — Issue #687: chore(ci): リリースフローを release-please に移行

## ADR-001: GitHub Release / リリースノートの所有を release-please に一本化する

### Status
Proposed

### Context
`deploy-production.yml` 末尾に既に `Generate release notes`（`softprops/action-gh-release@v2`, `generate_release_notes: true`）ステップがあり、タグから GitHub Release を作成している。release-please も release PR マージ時に同じタグの Release を作成するため、同一タグへ二重に Release を作る／競合するおそれがある。どちらを Release の owner にするかを決める必要がある。

選択肢:
- (A) release-please を Release owner にし、deploy 側の `Generate release notes` を削除する。
- (B) deploy 側を owner にし、release-please は Release を作らない設定（`skip-github-release` 相当）にする。
- (C) 両方残す（二重作成を許容） — 却下。競合・重複が起きる。

加えて、release-please がタグを push したとき `deploy-production.yml`（tag トリガー）を起動させる必要がある。`GITHUB_TOKEN` で作成したタグ / Release は再帰防止のため他ワークフローのトリガーイベントを発火しないのが GitHub の確定仕様であり、token の選択も Release 所有と密接に絡む。

### Decision
(A) を採用。release-please を GitHub Release / リリースノートの唯一の所有者とし、`deploy-production.yml` の `Generate release notes` ステップを削除する。deploy ワークフローは「デプロイのみ」を責務とする。

理由:
- release-please は CHANGELOG とバージョンを一元管理するため、Release ノートも同じソース（conventional commits）から生成するのが一貫する。
- deploy は失敗・再実行があり得る（承認ゲート、Pulumi/Cloudflare 起因）。Release 作成を deploy に紐づけると「タグはあるが Release がない／deploy 失敗で Release も作られない」といった不整合が起きる。Release はタグ確定時点（release-please マージ時）に作るのが自然。

token については、PAT（リポジトリ secret 名 `RELEASE_PLEASE_TOKEN`）を release-please-action の `token:` に渡す。`GITHUB_TOKEN` では tag push が `deploy-production.yml` を起動しない確定仕様のため、tag→deploy-production 連鎖を成立させるには PAT が必須（条件付きではなく確定）。

### Consequences
- 良い点: Release の生成元が1つに固定され、二重作成・競合が消える。deploy の責務が「デプロイのみ」に純化する。Release ノートが CHANGELOG と完全に一致する。
- トレードオフ: タグ push が deploy をトリガーするために PAT（`RELEASE_PLEASE_TOKEN`）が必須であり、secret 管理が1つ増えるのは確定コスト。operator が PAT を発行・登録・更新（期限管理）する運用が発生する。

---

## ADR-002: タグ形式を `v*.*.*` に揃えるための release-please 設定

### Status
Proposed

### Context
既存の `deploy-production.yml` は `on.push.tags: ["v*.*.*"]`、production environment の deployment branch policy も `v*.*.*` を前提にしている。release-please が生成するタグがこのパターンに一致しないと、タグ→本番デプロイの自動連鎖が壊れる。

release-please はモノレポ用に component 名をタグに含める機能（`include-component-in-tag` / `tag-separator`）があり、構成次第で `hollow-v0.1.0` のような形になり `v*.*.*` にマッチしなくなる。

### Decision
マニフェスト型（`release-please-config.json` + `.release-please-manifest.json`）の単一パッケージ構成を採用し、root（`"."`）のみを `packages` に登録、`release-type: node` を適用する。`include-component-in-tag: false` をトップレベル（global = 全パッケージ既定）に指定してタグから component 名を排除し、`v` プレフィックスはデフォルト（`include-v-in-tag: true`）のまま使う。結果のタグは `vX.Y.Z`。

理由:
- 本リポは単一パッケージ（root の `package.json`）なので component 名は不要。
- マニフェスト型は単一パッケージでも将来のモノレポ化に拡張しやすく、release-please の推奨構成でもある。
- `include-component-in-tag: false` をトップレベル（global）に明示することで、デフォルト挙動に依存せずタグ形式 `v*.*.*` を保証する。release-please config ではトップレベル指定が全パッケージに適用されるため、単一 root パッケージでも確実に効く。

### Consequences
- 良い点: 生成タグが既存の `v*.*.*` トリガー / deployment branch policy に確実に一致し、ワークフロー側を一切変更せずに連鎖する。
- トレードオフ: 初回リリースPRマージ後に実タグ名を1度目視確認する手間がある（設定ミスの早期発見のため）。

---

## ADR-003: 初回バージョン 0.1.0 のブートストラップと squash merge 運用への統一

### Status
Proposed

### Context
- 初回バージョンを 1.0.0 / 0.1.0 のどちらにするか（`package.json` と `.release-please-manifest.json` の初期値）。タグ実績ゼロ（本番未デプロイ）の状態。
- マージ方式: 現状は merge commit 運用。release-please のコミット解析・CHANGELOG の綺麗さの観点では squash merge が望ましい。

両方ともユーザーにより決定済み（0.1.0 始まり / squash 統一）だが、技術的な実現方法にトレードオフがあるため記録する。

### Decision
- 初回バージョンは **0.1.0**。`.release-please-manifest.json` を `{ ".": "0.1.0" }`、`package.json` の `version` を `"0.1.0"` とする。`release-as` / `bootstrap-sha` は使わず、manifest 初期値を起点に conventional commits から自然に積み上げる。
- マージ方式は **squash merge に統一**。リポジトリの merge button 設定で squash のみ有効化し、squash の default commit message を "Pull request title" に設定する。1 PR = 1 conventional commit を運用ルールとする。

理由:
- 0.1.0 始まりは「まだ 1.0 の安定保証をしないプレリリース段階」を表現でき、初回基盤整備のタイミングに合う。`release-as` を使わないことで設定がシンプルになり、初回リリース以降の積み上げに余計な状態を残さない。
- squash 統一により、main に乗るコミットが PR タイトル（conventional 形式）1本になり、release-please のコミット解析と CHANGELOG が綺麗になる。merge commit 運用だと PR 内の中間コミットが解析対象に混ざる。

### Consequences
- 良い点: バージョニングと CHANGELOG が予測可能で綺麗になる。設定がシンプル。
- トレードオフ: squash 統一はリポジトリ設定変更（merge button / default commit message）を operator が手動で行う必要があり、コード変更だけでは完結しない。運用者が PR タイトルを必ず conventional 形式にする規律も要る。
- 逃げ道: 最後のリリースタグが無い初回は release-please がリポジトリ全履歴を走査するため初回 CHANGELOG が肥大化しうる。今回は全履歴許容で進めるが、もし肥大化が問題になれば `bootstrap-sha`（特定コミット以降のみ集計）を初回限定で指定して起点を限定できる（選択肢として記録、今回は不採用）。

---
