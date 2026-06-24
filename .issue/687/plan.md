# 実装計画 — Issue #687: chore(ci): リリースフローを release-please に移行（pnpm version 直 push を廃止し自動バージョニング化）

**Issue:** #687
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

本番リリースを `pnpm version patch && git push --follow-tags`（main への直接 bump コミット + ローカル手作業タグ）から release-please に移行し、main push を契機に bot が常時1本のリリースPR（version bump + CHANGELOG）を作成・更新、そのマージで `vX.Y.Z` タグ + GitHub Release を生成して既存の tag-triggered `Deploy (production)` を自動連鎖させる。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | main にマージされた `feat:` / `fix:` コミットを起点に、release-please が常時1本のリリースPR（version bump + CHANGELOG）を自動作成・更新する（複数本にならない） | Issue 受け入れ条件1 / 方針 | S2, S3, S4 |
| AC-2 | リリースPRのマージで `vX.Y.Z` 形式（`v` プレフィックス、コンポーネント名なし）のタグ + GitHub Release が生成される | Issue 受け入れ条件2 / スコープ | S2, S4 |
| AC-3 | 生成タグが `deploy-production.yml` の `on.push.tags: ["v*.*.*"]` および production environment の deployment branch policy（`v*.*.*`）に一致し、`Deploy (production)` が自動起動する（PAT `RELEASE_PLEASE_TOKEN` でタグ push する前提。GITHUB_TOKEN ではタグ push が他ワークフローを起動しない確定仕様のため） | Issue 受け入れ条件2 / スコープ | S4, S6 |
| AC-4 | main へ bump 目的の直接コミットが発生しない（リリースPR経由のみ。ブランチ保護と両立） | Issue 受け入れ条件3 | S4 |
| AC-5 | Release / リリースノートの生成元が release-please に一本化され、二重作成・競合が起きない（`deploy-production.yml` の `Generate release notes` ステップ削除） | Issue 受け入れ条件4 / 統合上の注意 | S5 |
| AC-6 | `package.json` に `version: "0.1.0"` フィールドが存在し、`.release-please-manifest.json` の初期値と一致する | スコープ / 未決事項1（決定: 0.1.0） | S1, S3 |
| AC-7 | `docs/deployment_setup.md`（および README の Release flow 節）が release-please 運用に更新されている（README を含める根拠: S5 で `Generate release notes` を削除すると README の「creates a GitHub Release」記述が陳腐化し、条件5「新フローに更新」の趣旨と矛盾するため） | Issue 受け入れ条件5 / スコープ | S7 |
| AC-8 | リポジトリの merge button 設定を squash merge に統一する手順がドキュメント化されている（squash の "Default commit message" を "Pull request title" に設定する手順を含み、1 PR = 1 conventional commit を担保） | 未決事項2（決定: squash 統一） | S7 |

## スコープ

### 含まれないもの
- アプリのドメイン / ユースケース / アダプター / UI コード変更 — 本 Issue は CI/CD・設定・ドキュメントのみ。
- `workflow_dispatch` による手動リリース fallback — release-please.yml には追加しない（未決事項3で「残さない」と決定。リリースPRマージ＝リリースに一本化）。`deploy-production.yml` 既存の `workflow_dispatch`（緊急再デプロイ用）は本 Issue のスコープ外として温存する。
- `release-as` / `bootstrap-sha` による初回バージョン明示 — 0.1.0 始まりは manifest 初期値で表現でき、`release-as` は使わず 0.1.0 から自然に積み上げる（未決事項1の決定）。
- CHANGELOG.md の手書き初期化 — release-please が初回リリースPRで生成する。事前に空ファイルを置く必要はない。
- `deploy-staging.yml` / `ci.yml` の変更 — トリガーも挙動も無関係なので触らない。

## 調査結果

- 関連ファイル:
  - `package.json` — `name: "hollow"`, `private: true`。**`version` フィールドが欠落**（現状 `undefined`）。release-type: node は `package.json` の version を bump 対象とするため追加必須。
  - `.github/workflows/deploy-production.yml` — `on.push.tags: ["v*.*.*"]` + `workflow_dispatch`。`environment.name: production`（required reviewers で承認ゲート）。末尾に `Generate release notes`（`softprops/action-gh-release@v2`, `generate_release_notes: true`, `GITHUB_TOKEN`）が **タグから GitHub Release を作成**している → release-please と二重になる箇所。
  - `.github/workflows/deploy-staging.yml` — `on.push.branches: [main]`。release-please とは無関係（変更不要）。
  - `.github/workflows/ci.yml` — `on.pull_request.branches: [main]`。リリースPRに対しても CI が走る（lint/typecheck/test/build）。変更不要だが、squash 運用前提で「リリースPRも CI green が必要か」はブランチ保護設定依存。
  - `docs/deployment_setup.md` リリース節（L1-26）— `pnpm version patch && git push --follow-tags` 手順。要更新。
  - `README.md` Release flow 節（L137-145）— 同じく `pnpm version` 手順 + 「creates a GitHub Release with auto-generated notes」記述。要更新（Issue スコープには明記されていないが受け入れ条件5「新フローに更新」を満たすため対象に含める）。
  - 既存タグ: ゼロ（本番未デプロイ）。初回基盤整備として最適。
- あるべきアーキテクチャ:
  - 本 Issue はアプリのレイヤー（domain/application/adapter/presentation）に一切触れない CI/CD・設定変更。レイヤー設計の議論は不要。
  - 設計の核は「ワークフローのトリガー連鎖」と「GitHub Release の所有の一本化」。
  - トリガー連鎖: `main push → release-please.yml が release PR を upsert → PR を squash merge → release-please が vX.Y.Z タグ + Release 作成 → deploy-production.yml（tag トリガー）起動 → production environment で承認 → デプロイ`。
  - Release の唯一の所有者を release-please にする（deploy 側は Release を一切作らない）。
- 既存実装の状態:
  - tag-triggered の `Deploy (production)` 自体は維持すべき良い仕組み。直すのは「タグをどう生むか」だけ。
  - `Generate release notes` ステップが Release を作っているため、release-please 導入後はこれが二重作成源になる → 削除する。
  - `package.json` の version 欠落は release-please 導入の前提として埋める。
- 依存関係:
  - GitHub リポジトリ設定: ブランチ保護（PR必須）、production environment の deployment branch policy（`v*.*.*`）、merge button の squash 設定。
  - `GITHUB_TOKEN` の workflow permissions（`contents: write`, `pull-requests: write`）。デフォルトの read-only token では release-please が PR / タグを作れない。
  - conventional commits 規約（既に `feat:` / `fix:` / `chore:` 運用済み）。

## 設計

本変更はアプリのレイヤーに影響しない。ドメイン / ユースケース / アダプター / UI はすべて「なし」。代わりにワークフローのトリガー連鎖と Release 所有を設計する。

### ドメインモデルへの影響
なし（CI/CD・設定・ドキュメントのみの変更）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
なし。

### CI/CD・リリースフロー設計（本 Issue の主対象）

**トリガー連鎖（設計の正）**

```
main へ PR を squash merge
        │  (conventional commit が main に乗る)
        ├─────────────────────────────┐
        ▼                             ▼
release-please.yml  (on.push.branches: [main])   deploy-staging.yml  (on.push.branches: [main])
        │  既存リリースPRを upsert（version bump + CHANGELOG）。常時1本。  （並走。互いに独立で干渉しない）
        ▼
リリースPR を squash merge
        │  release-please が released を検知
        ▼
release-please が vX.Y.Z タグ + GitHub Release を作成   ← Release の唯一の所有者
        │  (タグ形式: v + semver、コンポーネント名なし)
        ▼
deploy-production.yml  (on.push.tags: ["v*.*.*"])
        │  production environment（required reviewers）で承認待ち
        ▼
Pulumi up → migrations → build → deploy Workers → inject secrets
（Generate release notes ステップは削除済み = Release を作らない）
```

> 注: main への push 1回につき `deploy-staging.yml`（on.push.branches: [main]）と `release-please.yml`（on.push.branches: [main]）が**並走**する。両者は互いに独立で干渉しない（staging は常時最新を反映、release-please は release PR を upsert するだけ）。リリースPR自体を main へマージした push でも deploy-staging が起動するが、中身が version bump + CHANGELOG のみのため staging 再デプロイは無害（冗長なだけ）。

**タグ形式を `v*.*.*` に揃える設定（重要）**

release-please の単一パッケージ（root）構成では、デフォルトでタグに component 名が付かず、`include-v-in-tag`（デフォルト true）により `v` プレフィックスが付く。本リポは root 単一パッケージなので:
- `release-please-config.json` の `packages` に `"."`（root）のみを定義し、component 名を与えない。
- `include-component-in-tag` の schema 上のデフォルトは `true` だが、単一 root パッケージで component 名を与えなければタグに付与する component が無いため実質 `vX.Y.Z` になる。デフォルト挙動に依存せず確実にするため `"include-component-in-tag": false` をトップレベル（global = 全パッケージ既定）に明示して保険をかける。
- `"tag-separator"` は component 名がないため無関係だが、念のため設定しない（デフォルト）。
- 結果のタグは `v0.1.0`, `v0.1.1`, ... となり `deploy-production.yml` の `v*.*.*` および environment の deployment branch policy `v*.*.*` に一致する。

**Release 所有の一本化（重要）**

- release-please が release PR マージ時に GitHub Release を作る（これが唯一の所有者）。
- `deploy-production.yml` の `Generate release notes`（`softprops/action-gh-release@v2`）ステップを **削除**する。これにより同一タグへの二重 Release 作成 / 競合を排除。
- deploy ワークフローは「デプロイのみ」を責務とし、Release / リリースノートには一切関与しない。

**squash merge 運用への統一**

- リポジトリの merge button 設定で "Allow squash merging" のみを有効化（merge commit / rebase を無効化）。
- 1 PR = 1 conventional commit に揃えることで、release-please のコミット解析と CHANGELOG が綺麗になる。
- squash merge 時の commit メッセージは PR タイトル（conventional 形式）が使われるよう設定（GitHub の "Default commit message" を "Pull request title" に設定する手順をドキュメント化）。

## 実装ステップ

依存方向（前提を満たす順）に並べる。アプリのレイヤーに触れないため、設定ファイル → ワークフロー → ドキュメントの順。

### 1. `package.json` に `version` フィールドを追加

- **対象ファイル:** `package.json`
- **変更内容:** トップレベルに `"version": "0.1.0"` を追加（`"name": "hollow"` の直後、`"private": true` の前後いずれか規約に沿う位置）。
- **理由:** release-type: node は `package.json` の `version` を bump 対象とする。欠落していると release-please が機能しない。初期値は決定済みの 0.1.0。AC-6。

### 2. `release-please-config.json` を追加

- **対象ファイル:** `release-please-config.json`（リポジトリルート）
- **変更内容:** マニフェスト型の単一パッケージ構成。
  ```json
  {
    "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "release-type": "node",
    "include-component-in-tag": false,
    "packages": {
      ".": {}
    }
  }
  ```
  - `release-type: node` を root（`"."`）に適用。
  - `include-component-in-tag: false` でタグを `vX.Y.Z` に固定（component 名を付けない）。
  - `v` プレフィックスはデフォルト（`include-v-in-tag: true`）で付与される。
  - changelog セクション（feat/fix 等）はデフォルトの conventional-commits 設定で十分なため明示しない。
- **理由:** タグ形式を deploy-production.yml の `v*.*.*` に一致させ、単一パッケージとしてバージョニングする。AC-1, AC-2, AC-3。

### 3. `.release-please-manifest.json` を追加

- **対象ファイル:** `.release-please-manifest.json`（リポジトリルート）
- **変更内容:**
  ```json
  {
    ".": "0.1.0"
  }
  ```
- **理由:** release-please に「現在のバージョンは 0.1.0」とブートストラップで伝える。`package.json` の version と一致させる。`release-as` は使わず、ここを起点に自然に積み上げる。AC-6。

### 4. `.github/workflows/release-please.yml` を追加

- **対象ファイル:** `.github/workflows/release-please.yml`
- **変更内容:**
  ```yaml
  name: release-please

  on:
    push:
      branches: [main]

  permissions:
    contents: write
    pull-requests: write

  concurrency:
    group: release-please
    cancel-in-progress: false

  jobs:
    release-please:
      runs-on: ubuntu-latest
      steps:
        - uses: googleapis/release-please-action@v4
          with:
            config-file: release-please-config.json
            manifest-file: .release-please-manifest.json
            token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
  ```
  - `on.push.branches: [main]` で main への push（= squash merge）ごとにリリースPRを upsert。
  - `permissions: contents: write / pull-requests: write` で PR・タグ・Release 作成を許可。
  - `workflow_dispatch` は **追加しない**（未決事項3の決定）。
  - `concurrency` で同時実行を直列化（リリースPR が複数本にならない保証の補強）。
- **理由:** main push を契機に常時1本のリリースPRを作成・更新し、マージで vX.Y.Z タグ + Release を生成する。AC-1, AC-2, AC-4。

  PAT を使う理由（確定）: `GITHUB_TOKEN` で作成したタグ / Release は、再帰防止のため他ワークフローのトリガーイベントを**発火しない**のが GitHub の確定仕様（"events triggered by the GITHUB_TOKEN ... will not create a new workflow run"）。本リポの構成（release-please がタグを作る → tag-triggered deploy-production）はこの制約を直撃するため、GITHUB_TOKEN では tag→deploy-production 連鎖が**必ず失敗**する。よって PAT（リポジトリ secret 名 `RELEASE_PLEASE_TOKEN`）が**必須**で、release-please-action の `token:` に渡す。これにより release-please が PAT 名義でタグを push し、deploy-production が起動する。`RELEASE_PLEASE_TOKEN` の登録は operator の前提作業（後述 S7「リポジトリ設定の前提」）。

### 5. `deploy-production.yml` の `Generate release notes` ステップを削除

- **対象ファイル:** `.github/workflows/deploy-production.yml`
- **変更内容:** 末尾の `Generate release notes`（`softprops/action-gh-release@v2`, L153-160）ステップ全体を削除。`Inject secrets` ステップがジョブの最終ステップになる。
- **理由:** Release の所有を release-please に一本化し、同一タグへの二重 Release 作成 / 競合を排除する。deploy は「デプロイのみ」を責務とする。AC-5。
- **workflow_dispatch 経路への影響:** deploy-production.yml は `on.push.tags` と `workflow_dispatch`（緊急手動デプロイ）の両方で起動する。`workflow_dispatch` 経路では元々タグ ref が無く、`Generate release notes`（`generate_release_notes`）は付随的（tag が無ければ no-op / 失敗扱い）だった。このステップ削除後も手動デプロイ自体は問題なく動作する（Release を作らなくなるだけ）。tag 経路・workflow_dispatch 経路の双方でデプロイ動作に影響しないことを確認済み。手動デプロイがデプロイのみ行い Release を作らないのは正しい責務分離。

### 6. タグ形式・deployment branch policy の整合を確認（検証ステップ）

- **対象:** `deploy-production.yml` の `on.push.tags: ["v*.*.*"]`、production environment の deployment branch policy（`v*.*.*`）。
- **変更内容:** ファイル変更なし。release-please が生成するタグが `vX.Y.Z` であることを config（ステップ2）で保証し、既存パターンと一致することを確認する。environment 設定はリポジトリ設定側なので、ドキュメントに「deployment branch policy が `v*.*.*` であること」を前提として明記。
- **理由:** タグ→本番デプロイの自動連鎖を担保。AC-3。

### 7. ドキュメント更新（`docs/deployment_setup.md` + `README.md`）

- **対象ファイル:** `docs/deployment_setup.md`（L1-26 リリース節）、`README.md`（L137-145 Release flow 節）
- **変更内容:**
  - `docs/deployment_setup.md` の production リリース節を release-please フローに書き換え:
    - 「`feat:` / `fix:` 等の conventional commit を含む PR を squash merge → release-please が1本のリリースPRを自動更新 → リリースPRをマージ → vX.Y.Z タグ + Release 自動生成 → Deploy (production) が承認待ちで起動 → 承認するとデプロイ」
    - `pnpm version patch && git push --follow-tags` の記述を削除。
    - ロールバック節は「手動でタグを打つ」手順なので、release-please 運用下での扱いを注記（緊急時は手動タグ push で deploy-production を起動できる旨を残すか、Cloudflare ダッシュボードロールバックを第一手段として案内）。
  - **リポジトリ設定の前提**を新たに明記する節を追加:
    - **`RELEASE_PLEASE_TOKEN` secret の登録が前提**（最重要）。GITHUB_TOKEN で作成したタグは deploy-production を起動しない確定仕様のため、release-please が PAT 名義でタグを push する必要がある。operator は `RELEASE_PLEASE_TOKEN` をリポジトリ secret に登録する（classic PAT なら `repo` + `workflow` scope、fine-grained PAT なら contents: write / pull-requests: write / workflows）。未登録だと release-please が PR / タグを作れない、またはタグが deploy-production を起動しない。
    - merge button は **squash merge のみ有効**（merge commit / rebase 無効）。squash の "Default commit message" を "Pull request title" に設定（1 PR = 1 conventional commit を担保。この設定がないと PR 内の中間コミット由来のメッセージが混ざり release-please の解析が乱れる）。
    - ブランチ保護（main は PR 必須）と release-please は両立する。
    - production environment の deployment branch policy が `v*.*.*` であること。
    - `GITHUB_TOKEN` の workflow permissions（contents: write / pull-requests: write）— workflow 内 `permissions` で付与済みだが、リポジトリ/Organization 設定で workflow の write が許可されていることが前提。
    - **トラブルシュート（PAT 失効時の症状）**: `RELEASE_PLEASE_TOKEN` が失効・未更新だと、症状として「リリースPR が作られない／更新されない」または「リリースPR はマージできるがタグ push が deploy-production を起動しない」が現れる。リリースが進まないときはまず PAT の有効期限と scope を確認する。
  - `README.md` の Release flow 節を同様に release-please フローへ更新し、「creates a GitHub Release with auto-generated notes」の主語を release-please に変更（deploy ワークフローは Release を作らない旨）。
- **理由:** 受け入れ条件5「新フローに更新」、squash 統一手順の明記。AC-7, AC-8。

## 設計判断

トレードオフのある技術判断は `adr.md` に記載:
- ADR-001: GitHub Release / リリースノートの所有を release-please に一本化し、deploy 側の `Generate release notes` を削除する判断。
- ADR-002: タグ形式を `v*.*.*` に揃えるための release-please 設定（マニフェスト型単一パッケージ、`include-component-in-tag: false`、`include-v-in-tag` デフォルト true）。
- ADR-003: squash merge への統一と初回バージョン 0.1.0 のブートストラップ方針（`release-as` 不使用）。

## リスクと注意点

- **PAT 必須（確定・前提条件）**: `GITHUB_TOKEN` で作成したタグ / Release は他ワークフローのトリガーイベントを発火しないのが GitHub の確定仕様。よって release-please-action には PAT（リポジトリ secret 名 `RELEASE_PLEASE_TOKEN`）を渡すことが**必須**。operator は事前に `RELEASE_PLEASE_TOKEN`（classic PAT なら `repo` + `workflow` scope、fine-grained PAT なら contents: write / pull-requests: write / workflows）をリポジトリ secret に登録する必要がある（operator 作業、コードでは完結しない）。未登録だと release-please が PR / タグを作れない、またはタグが deploy-production を起動しない（AC-3 未達）。
- **タグに component 名が混入するリスク**: 設定を誤ると `hollow-v0.1.0` のようなタグになり `v*.*.*` にマッチしない。`include-component-in-tag: false` + 単一 root パッケージで防止。初回リリースPR マージ後に実際のタグ名を確認すること。
- **squash 未統一時の CHANGELOG 汚染**: merge commit 運用のままだと中間コミットが CHANGELOG に混ざる。リポジトリ設定で squash 統一を必須手順として明記（ドキュメント反映 = 設定変更を operator が実施する前提）。
- **初回リリースPRの内容**: 既存コミット履歴をすべて拾うため、初回 CHANGELOG が大きくなる可能性。0.1.0 始まりなので許容範囲だが、初回PR内容は目視確認する。
- **二重 Release の取り残し**: ステップ5の削除を忘れると二重作成が継続。AC-5 の検証で deploy ログに Release 作成ステップが無いことを確認。
- **production environment の承認ゲート維持**: deploy-production.yml の `environment: production`（required reviewers）はリリース後も維持される。release-please はデプロイを承認しない（タグを作るだけ）ので、承認ゲートは従来通り機能する。

## テスト方針

CI/CD・設定変更のため、ユニット/統合テストの対象外。検証は以下で行う:
- `pnpm typecheck && pnpm lint:fix && pnpm format` で JSON / 既存ファイル変更が壊れないことを確認（JSON は Biome のフォーマット対象）。
- ワークフロー YAML の構文を `actionlint`（あれば）または GitHub Actions 上の dry-run で確認。
- 受け入れ基準の実地検証（マージ後の実運用）:
  - AC-1: `feat:` コミットを含む PR を main に squash merge → release-please.yml が green で1本のリリースPRを作成することを Actions で確認。2本目のコミットで同じPRが更新される（複数本にならない）ことを確認。
  - AC-2/AC-3: リリースPRをマージ → タグが `v0.1.0` 形式で作られ、Release が1つだけ作られ、`Deploy (production)` が起動することを確認。
  - AC-4: main の履歴に bump 専用の直接コミットが無い（PR経由のみ）ことを確認。
  - AC-5: deploy-production の実行ログに Release 作成ステップが存在せず、Release が release-please の1つだけであることを確認。
  - AC-6: `package.json` と `.release-please-manifest.json` がともに `0.1.0` であることを確認。
  - AC-7/AC-8: ドキュメントに新フローと squash 統一手順が記載されていることを確認。

## レビュー履歴

### 1周目（2026-06-13）
- 反映した問題点: arch P-001（PAT必須に確定）, arch P-002（Generate release notes削除のworkflow_dispatch影響明記）
- 取り込んだ改善提案: arch S-001（include-component-in-tag記載統一）, arch S-003（deploy-staging並走明示）, arch S-004（bootstrap-sha逃げ道をADRに記録）, coverage S-001（AC-7根拠補強）, coverage S-002（AC-8にdefault commit message設定追加）
- 見送り: なし

### 2周目（2026-06-13）
- 両視点とも問題点ゼロで終了（収束）。
- 取り込んだ改善提案: arch S-001（include-component-in-tag のデフォルトは true である旨を文言精度として補正）, arch S-003（PAT 失効時の症状をドキュメント前提のトラブルシュートに1行追記）
- 見送り: arch S-002（Generate release notes ステップのブロック除去は実装時に確認する運用注記で、計画変更不要）
