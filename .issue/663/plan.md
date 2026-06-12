# 実装計画 — Issue #663: ローカル検証環境（pnpm start）でジョブ型エクスポートが完走しない

**複雑度:** 小規模
**作成日:** 2026-06-13

---

## 目的

`pnpm start`（= `wrangler dev`、Vite なし）で実行したとき、relay/consumer Worker が別エントリポイントのため起動せず、outbox に積まれたジョブ型エクスポートが処理されない問題を解決する。

## 現状分析

- `pnpm dev`（Vite + `@cloudflare/vite-plugin`）: `import.meta.env.DEV === true` → `InlineRelayTrigger` が使われる（Issue #66 で対応済み）
- `pnpm start`（`wrangler dev` 生実行）: `import.meta.env` が `undefined` → `isDev = false` → `InlineRelayTrigger` が使われない → relay/consumer なしでジョブ待機したまま

## 解決方針

`wrangler.toml`（ローカル dev 専用）の `[vars]` に `IS_LOCAL_DEV = "true"` を追加し、`server.cloudflare.ts` の `isDev` 判定に `env.IS_LOCAL_DEV === "true"` を OR する。

- staging/production toml には追記しない → デプロイ経路で `InlineRelayTrigger` が混入しない
- `ServerEnv` に `IS_LOCAL_DEV?: string` を追加して型を合わせる

## 受け入れ基準

| ID | 基準 |
|----|------|
| AC-001 | `pnpm start` 時（wrangler dev）にジョブ型エクスポートのキューが `InlineRelayTrigger` 経由で処理される |
| AC-002 | `pnpm dev`（Vite）の既存動作に変化がない |
| AC-003 | `wrangler.staging.toml` / `wrangler.production.toml` には `IS_LOCAL_DEV` が含まれず、デプロイ環境に影響しない |
| AC-004 | `typecheck` / `lint` / `format` が通る |

## 実装ステップ

1. `wrangler.toml` の `[vars]` に `IS_LOCAL_DEV = "true"` を追加する
2. `app/core/application/di/serverCloudflare.ts` の `ServerEnv` に `IS_LOCAL_DEV?: string` を追加する
3. `app/server.cloudflare.ts` の `isDev` 判定を `import.meta.env.DEV === true || env.IS_LOCAL_DEV === "true"` に変更し、コメントを更新する

## スコープ

**含む:**
- `wrangler.toml` への vars 追記
- `ServerEnv` 型への optional フィールド追加
- `server.cloudflare.ts` の `isDev` 判定の拡張

**含まない:**
- staging/production toml の変更
- relay/consumer worker 自体のロジック変更
- `pnpm dev` 経路の変更

## テスト方針

自動テストなし（設定値変更 + 1行の条件分岐）。動作確認は testing.md 参照。

## レビュー履歴

（なし — 小規模のためレビューループスキップ）
