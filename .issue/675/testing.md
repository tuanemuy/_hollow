# 動作確認計画 — Issue #675: dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防ぐ

**Issue:** #675
**作成日:** 2026-07-11

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

| 経路 | コマンド | mode / エントリ | 用途 |
|---|---|---|---|
| dev サーバー | `pnpm dev`（:3000。使用中なら自動で番号増、実ポートはログで確認） | development / **dev エントリ** | AC-3（vite dev の inline relay） |
| ローカル本番相当（dev エントリ） | `pnpm build:local && pnpm start`（wrangler dev, :8787） | development ビルド → wrangler dev / **dev エントリ** | AC-4（inline relay ＋ dev R2 proxy） |
| ローカル本番相当（prod エントリ） | `pnpm build && pnpm start`（wrangler dev, :8787） | production ビルド → wrangler dev / **prod エントリ** | AC-9（prod スモーク）／ AC-3 の裏（inline relay が発火しないこと） |

補足: `pnpm start`（`wrangler dev`）は直前の `vite build` 出力を `.wrangler/deploy/config.json` 経由で workerd 上に起動する。`build:local`（`NODE_ENV=production vite build --mode development`）は dev エントリを、`build`（production）は prod エントリを選ぶ。`pnpm build:local && pnpm start` は prod スモークには使わない（dev エントリが選ばれるため）。

### デプロイ方法

本 Issue の確認はローカル検証のみで完結する。デプロイは不要。参考までに本番ビルド経路は `pnpm deploy:production`（内部で production mode の `vite build` → prod エントリ選択）だが、確認のために実行しない。

## 確認項目

### 1. dev サーバーで inline relay が機能する

- **対応する受け入れ基準:** AC-3, AC-7
- **目的:** `pnpm dev` で従来どおり `InlineRelayTrigger` による outbox の inline ドレインが働くこと。
- **前提:** ローカル D1 マイグレーション適用済み（`pnpm db:migrate`）。必要なら `pnpm seed:dev-admin` で管理者シード。
- **手順:**
  1. `pnpm db:migrate` を実行してローカル D1 を最新化する。
  2. `pnpm dev` を起動し、ログに出る実ポート（既定 :3000）でアプリを開く。
  3. ドメインイベントを発火する操作（例: ノート作成やエクスポート要求など、UoW コミット後に outbox にイベントが積まれる操作）を1つ実行する。
- **期待結果:** イベントが「待機中（pending）」で止まらず、inline relay により速やかにドレイン（consumer 相当が反応）する。#663 の「エクスポートが待機中のまま」症状が再発しない。
- **確認ポイント:** ゲート判定が `import.meta.env.DEV === true`（vite dev）で true になる経路。dev エントリが選択されていること（vite dev は development mode）。

### 2. ローカル本番相当（dev エントリ）で inline relay ＋ dev R2 proxy が機能する

- **対応する受け入れ基準:** AC-4, AC-7
- **目的:** `pnpm build:local && pnpm start` で inline relay と dev R2 proxy（presign→PUT→finalize→表示）が従来どおり E2E で完走すること。
- **前提:** ローカル D1 マイグレーション適用済み。`DEV_INLINE_RELAY` フラグが有効（build:local は `import.meta.env.DEV=false` のためフラグ単独でゲートが開く）。`R2_DEV_OBJECT_PROXY` が有効。
- **手順:**
  1. `pnpm build:local` でローカル本番相当ビルドを生成する。
  2. `pnpm start`（wrangler dev, :8787）で起動する。
  3. 画像/ファイルアップロードを伴う操作を実行し、presign URL 取得 → オブジェクト PUT → finalize → 表示 までを通す。
  4. 同操作でドメインイベントが発火する場合、inline relay がドレインすることも確認する。
- **期待結果:** dev R2 proxy 経由（`/dev/r2/` 相当のパス）でオブジェクトの PUT / GET が成立し、アップロードした内容が表示される。inline relay も待機中で止まらない。
- **確認ポイント:** dev エントリの `preRoute` hook 経由で R2 proxy が応答すること。`DEV_INLINE_RELAY` フラグ単独で inline relay ゲートが開くこと（build:local は DEV=false）。

### 3. ローカル本番相当（prod エントリ）で通常応答が成立し dev コードが動かない

- **対応する受け入れ基準:** AC-9, AC-3（裏）, AC-5
- **目的:** prod エントリ（hook なしの `createFetchHandler()`）が正常に fetch を処理し、かつ dev-only 機能（inline relay / dev R2 proxy）が発火しないこと。fetch フロー書き換えによる回帰が無いことのスモーク。
- **手順:**
  1. `pnpm build`（production mode）で prod エントリを含むビルドを生成する。
  2. `pnpm start`（wrangler dev, :8787）で起動する。
  3. 通常ルート（トップページ等）を開いて正常応答することを確認する。
  4. `/sitemap.xml` を開き、sitemap が正しく生成・応答されることを確認する（prod fetch フローの sitemap 分岐が hook 化後も機能すること）。
  5. `/dev/r2/` 相当の dev proxy パスにアクセスし、dev proxy が**応答しない**（通常ルーティングにフォールスルー／404 等）ことを確認する。
- **期待結果:** 通常ルートと `/sitemap.xml` は正常応答。dev R2 proxy パスは dev 挙動を示さない。inline relay 由来の dev ログが出ない。
- **確認ポイント:** prod エントリは dev-only モジュールを import しないため、実行時にも inline relay / dev proxy が存在しないこと。

## エッジケース・異常系

### 1. prod ビルド成果物に dev-only コードが構造的に含まれない（ワンタイム構造検証）

- **対応する受け入れ基準:** AC-1, AC-2
- **目的:** import グラフ分離が効いており、prod バンドルに dev-only シンボル/文字列が載っていないこと。
- **手順:**
  1. `pnpm build` を実行する。
  2. `grep -rn "InlineRelayTrigger\|inline-dev\|/dev/r2/\|resolveInlineRelayGate\|resolveDevObjectStorageGate\|buildDevObjectStorageResponse" dist/` を実行する。
- **期待結果:** ヒットゼロ（空）。識別子は minify で消え得るため、minify 耐性のある文字列リテラル `inline-dev` / `/dev/r2/` がヒットしないことを重視する。
- **確認ポイント:** これは恒常手順ではなく、構造分離が効いていることの一回限りの裏取り。PR 本文に結果を記載する。

### 2. vite の silent fallback が安全側に倒れる（設計確認）

- **対応する受け入れ基準:** AC-5
- **目的:** `server.entry` のパス誤指定時に「prod に dev 混入」ではなく「dev で機能停止」側へ倒れる設計であること。
- **手順:** 実機での破壊確認は不要。`vite.config.cloudflare.ts` の分岐が `mode === "production" ? prod : dev` であること、コメントで倒れ方が明記されていることをコードレビューで確認する。
- **期待結果:** production ビルドは常に prod エントリ（dev import ゼロ）を選ぶため、誤設定でも prod 混入は構造上起こり得ない。

## 既存機能への影響確認

- **worker エントリ（relay/consumer/pruner/dlq/indexer）:** 本 Issue は fetch エントリのみ分割。worker 側は無変更。`pnpm typecheck` と既存の統合テストで回帰が無いことを確認する。
- **既存単体テスト:** `inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` は純関数・クラス単体を対象で import 元に依存しないため、`pnpm test:unit` でそのまま pass すること（回帰ガード）。
- **sitemap 応答:** prod fetch フロー書き換えで sitemap 分岐が hook 化後も維持されること（確認項目3 の手順4）。
