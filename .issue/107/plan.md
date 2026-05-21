# 実装計画 — Issue #107: infra(dev): ローカル開発で SECRET_BOX_MASTER_KEY を自動セットして admin 設定の save をテスト可能にする

**Issue:** #107
**作成日:** 2026-05-21
**複雑度:** 小規模

---

## 目的

ローカル開発で `cp .dev.vars.example .dev.vars` + README の手順だけで、`/admin/llm` フォームから LLM 設定の保存が成功する状態にする。Issue #60 のブラウザ検証で発覚した「`SECRET_BOX_MASTER_KEY` 未設定で暗号化失敗 (500)」をローカル開発者の初回セットアップ段階で解消する。

## スコープ

### 含まれるもの
- `.dev.vars.example` に `SECRET_BOX_MASTER_KEY` のサンプルと生成方法のコメントを追加
- README の Quick Start に「`openssl rand -base64 32` で値を生成して埋める」の説明を追記
- 既存 `.dev.vars.example` のフッターコメント（オプションキーの一覧）を更新

### 含まれないもの
- `infra/src/secrets.ts` (`workerSecretSpecs`) の更新 — Issue のスコープに「production / staging のシークレット運用方針には触らない」とあるため、`SECRET_BOX_MASTER_KEY` を本番デプロイの必須シークレットに昇格させる作業は対象外
- `pnpm dev` 起動時の未設定検知チェック — Issue 本文に「必要であれば」とあり、`.dev.vars.example` に有効なサンプル値を置けば初回コピーで動くため不要
- アプリ本体コードの変更 — Issue 明記の通り
- `CLAUDE.md` の更新 — CLAUDE.md にはセットアップ手順がなく Development Commands のみ。README に集約する

## 実装ステップ

### 1. `.dev.vars.example` に `SECRET_BOX_MASTER_KEY` セクションを追加

- **対象ファイル:** `.dev.vars.example`
- **変更内容:**
  - `# --- Google OAuth ---` セクションの後に `# --- SecretBox (at-rest encryption) ---` セクションを追加
  - 値は AES-256 用の 32 バイト鍵を base64 化したもの。`openssl rand -base64 32` で生成可能であることをコメントで明示
  - ローカル開発向けには「`cp` だけで `/admin/llm` の保存まで動く」を満たすため、有効な dev-only サンプル値（44文字 base64）を default として入れる。「production / staging で再利用しないこと」を強く警告
- **理由:** 受け入れ基準「`cp .dev.vars.example .dev.vars` + README の手順だけで保存できる」を満たすため

### 2. README の Quick Start を更新

- **対象ファイル:** `README.md`
- **変更内容:** Quick Start セクションの `cp .dev.vars.example .dev.vars` 行に補足を追加。`SECRET_BOX_MASTER_KEY` をローカル用に再生成する場合は `openssl rand -base64 32` で生成して値を置き換える、という1〜2行の説明を `.dev.vars` の取り扱いと合わせて記載
- **理由:** Issue やること「README の Quick Start でローカル開発時の必須シークレットの記載が不十分」を解消

## 設計判断

### 1. `.dev.vars.example` に有効な dev-only サンプル値を入れるか、placeholder にとどめるか

→ **有効なサンプル値を入れる**。`SECRET_BOX_MASTER_KEY` は AES-256 用に正確に 32 バイトの base64 でないとパース時に `KeyUnavailable` エラーで失敗する（`secretBox.ts:73-79`）。`BETTER_AUTH_SECRET` のような「dev-only-replace-me」型 placeholder では起動できないため、有効な base64 値をデフォルトで置く。ただし「本番では絶対に使わない」「ローカルでも上書き推奨」を強く警告するコメントを併記する。

### 2. `pnpm dev` 起動時の警告チェックの是非

→ **見送る**。Issue 本文では「必要であれば」と条件付き。`.dev.vars.example` に有効なサンプル値を入れることで「コピーだけで動く」が成立するため、警告チェックの便益は薄い。また、Issue スコープに「アプリ本体コードの変更は不要」とあり、検知ロジックを app/ 配下に追加するのはスコープ逸脱。

## リスクと注意点

- `.dev.vars.example` のサンプル値を「production で偶発的に流用」されるリスク。コメントで強く警告し、`README.md` でも「本番は wrangler secret で管理」のセクションを既存どおり残す
- 既存の `.dev.vars` を持つ開発者には影響なし（example が変わるだけ）
- `infra/src/secrets.ts` の `shared` 配列との非同期は本 Issue のスコープ外。`SECRET_BOX_MASTER_KEY` は現状 staging/production では未配信であり、本 Issue では触らない（別 Issue で運用方針を決める）

## テスト方針

- `.dev.vars.example` の値で `WebCryptoSecretBox.fromEnv` が正常に初期化されること（コードを読んで base64 + 32 バイトの条件を満たすことを確認）
- `pnpm dev` 後、`/admin/llm` の LLM 設定保存が成功すること（manual-test）
- 既存の `pnpm test` がパスすること（コード変更がないため影響なし）
