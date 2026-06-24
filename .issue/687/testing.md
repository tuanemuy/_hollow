# 動作確認計画 — Issue #687: リリースフローを release-please に移行

**Issue:** #687
**作成日:** 2026-06-13

---

## 確認環境

本 Issue は CI/CD ワークフロー・設定ファイル・ドキュメントのみの変更で、アプリのドメイン/ユースケース/アダプター/UI には一切触れない。したがってアプリのローカルサーバー起動による画面確認は不要。確認はローカルの静的チェックと、マージ後の GitHub Actions 実運用検証の2段で行う。

### ローカル静的チェック（PR 作成前）

変更したファイル（`package.json` / `release-please-config.json` / `.release-please-manifest.json` / 各 `.github/workflows/*.yml` / `docs/deployment_setup.md` / `README.md`）が壊れていないことを確認する。

```bash
# JSON / 既存ファイルが Biome のフォーマット・lint を通ること
pnpm format:check
pnpm lint

# 既存コードへの型影響がないこと（設定変更のみだが念のため）
pnpm typecheck

# ワークフロー YAML の構文チェック（actionlint は未インストールのため npx で実行）
npx -y actionlint .github/workflows/release-please.yml .github/workflows/deploy-production.yml
```

> `npx actionlint` がネットワーク等で使えない場合は、GitHub に push 後の Actions 画面で構文エラーが出ないことで代替確認する。

### デプロイ方法（マージ後の実運用検証）

このIssueの「動作」はリリースフロー自体であり、検証は GitHub 上で行う。前提として operator が以下のリポジトリ設定を済ませていること（plan.md S7「リポジトリ設定の前提」参照）:

- `RELEASE_PLEASE_TOKEN`（PAT）をリポジトリ secret に登録（classic PAT なら `repo` + `workflow` scope、fine-grained PAT なら contents: write / pull-requests: write / workflows）
- merge button を squash merge のみ有効化し、"Default commit message" を "Pull request title" に設定
- production environment の deployment branch policy が `v*.*.*`

検証手順そのものは下記「確認項目」に記載。ローカルからの手動デプロイコマンド（`pnpm deploy:production` 等）は本 Issue の検証には使わない（リリースフロー移行が目的のため）。

## 確認項目

### 1. リリースPRが1本だけ自動作成・更新される

- **対応する受け入れ基準:** AC-1
- **目的:** main へ `feat:`/`fix:` コミットが乗ると release-please が常時1本のリリースPRを作成・更新することを確認する。
- **手順:**
  1. 本 PR を main に squash merge する（PR タイトルは conventional 形式）。
  2. GitHub Actions で `release-please` ワークフローが green で完了することを確認する。
  3. Pull requests 一覧に `chore(main): release x.y.z` のようなリリースPRが**1本だけ**作成されていることを確認する。
  4. 続けて別の `feat:` または `fix:` PR を main に squash merge する。
  5. リリースPRが**新規に増えず**、既存の1本が version/CHANGELOG 更新される（upsert される）ことを確認する。
- **期待結果:** リリースPRが常に1本で、main への変更ごとに内容が更新される。
- **確認ポイント:** リリースPRが複数本に増えていないこと。CHANGELOG に squash 後のコミット（PR タイトル）が反映されていること。

### 2. リリースPRマージで `vX.Y.Z` タグ + Release が生成される

- **対応する受け入れ基準:** AC-2
- **目的:** リリースPRのマージで `v` プレフィックス・component 名なしのタグと GitHub Release が1つ生成されることを確認する。
- **手順:**
  1. 確認項目1で作られたリリースPRをマージする。
  2. `release-please` ワークフローが green で完了することを確認する。
  3. Tags / Releases 画面でタグ名を確認する。
- **期待結果:** タグが `v0.1.0`（以降は `v0.1.1` 等）の形式で作られ、同名の GitHub Release が**1つだけ**生成される。
- **確認ポイント:** タグが `hollow-v0.1.0` のような component 名付きになっていないこと（`include-component-in-tag: false` が効いているか）。Release が重複していないこと。

### 3. タグ→本番デプロイが自動連鎖する

- **対応する受け入れ基準:** AC-3
- **目的:** 生成タグが `deploy-production.yml` の tag トリガーと environment の deployment branch policy に一致し、`Deploy (production)` が自動起動することを確認する。
- **手順:**
  1. 確認項目2でタグが生成された直後、Actions 画面で `Deploy (production)` ワークフローが起動していることを確認する。
  2. production environment の承認待ち（required reviewers）で停止していることを確認する。
- **期待結果:** タグ push を契機に `Deploy (production)` が自動起動し、承認ゲートで一時停止する。
- **確認ポイント:** `Deploy (production)` が起動しない場合、PAT（`RELEASE_PLEASE_TOKEN`）が未設定/失効の可能性が高い（GITHUB_TOKEN ではタグ push が他ワークフローを起動しないため）。

### 4. main へ bump 目的の直接コミットが発生しない

- **対応する受け入れ基準:** AC-4
- **目的:** version bump がリリースPR経由のみで行われ、ブランチ保護と両立することを確認する。
- **手順:**
  1. main のコミット履歴を確認する。
  2. version bump がリリースPRのマージコミットとして入っており、保護を迂回した直接 push が無いことを確認する。
- **期待結果:** main への直接 bump コミットが存在しない（すべて PR 経由）。

### 5. Release / リリースノートが release-please に一本化されている

- **対応する受け入れ基準:** AC-5
- **目的:** `Generate release notes` 削除により Release の二重作成・競合が起きないことを確認する。
- **手順:**
  1. 確認項目3で承認後に `Deploy (production)` を最後まで実行する。
  2. 実行ログに `Generate release notes` ステップが**存在しない**ことを確認する。
  3. 該当タグの Release が release-please 由来の1つだけであることを確認する。
- **期待結果:** deploy ワークフローは Release を作らず、Release は release-please の1つのみ。

### 6. バージョン値の整合

- **対応する受け入れ基準:** AC-6
- **目的:** `package.json` と `.release-please-manifest.json` の初期バージョンが一致することを確認する。
- **手順:**
  1. `package.json` の `version` が `"0.1.0"` であることを確認する。
  2. `.release-please-manifest.json` の `"."` が `"0.1.0"` であることを確認する。
- **期待結果:** 両者が `0.1.0` で一致。

### 7. ドキュメントが新フローに更新されている

- **対応する受け入れ基準:** AC-7, AC-8
- **目的:** `docs/deployment_setup.md` と `README.md` が release-please フロー・squash 統一手順に更新されていることを確認する。
- **手順:**
  1. `docs/deployment_setup.md` のリリース節に `pnpm version patch && git push --follow-tags` の記述が残っていないこと、release-please フローが記載されていることを確認する。
  2. squash merge 統一手順（"Default commit message" = "Pull request title"）と `RELEASE_PLEASE_TOKEN` 前提が記載されていることを確認する。
  3. `README.md` の Release flow 節が release-please フローに更新され、Release の主語が release-please になっていることを確認する。
- **期待結果:** 旧手順の記述が消え、新フローと前提設定が明記されている。

## エッジケース・異常系

### 1. PAT 未設定/失効時の挙動

- **目的:** `RELEASE_PLEASE_TOKEN` が無い場合に問題が早期に判明することを確認する。
- **手順:**
  1. （任意・検証用）PAT 未登録の状態で main に `feat:` を push する。
- **期待結果:** リリースPR が作られない、または作られてもタグ push が `Deploy (production)` を起動しない。plan.md のトラブルシュート記載どおり、PAT の有効期限と scope を確認する動線が機能する。

### 2. リリースPRマージ時の deploy-staging 並走

- **目的:** リリースPR（version bump + CHANGELOG のみ）を main にマージしても staging デプロイが壊れないことを確認する。
- **手順:**
  1. リリースPRをマージした際に `deploy-staging` が起動することを確認する。
- **期待結果:** staging 再デプロイは無害（version bump + CHANGELOG のみの冗長な再反映）で、エラーにならない。

## 既存機能への影響確認

- **`Deploy (production)` の他ステップ**: `Generate release notes` 削除後も、Pulumi up / migrations / build / Deploy Workers / Inject secrets の各ステップが従来どおり動作する（削除したのは末尾の Release 作成ステップのみ）。
- **`deploy-staging.yml` / `ci.yml`**: 変更していないため挙動不変。main push で staging が、PR で CI が従来どおり起動する。
- **production environment の承認ゲート**: release-please はデプロイを承認しない（タグを作るだけ）ため、required reviewers の承認ゲートは従来どおり機能する。
