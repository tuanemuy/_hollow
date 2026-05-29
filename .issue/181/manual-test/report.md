# ブラウザ検証レポート — Issue #181: directory deletion should mark SavedView broken

**実行日時:** 2026-05-29
**テストソース:** `.issue/181/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev` / vite + workerd）
**検証ツール:** agent-browser 0.27.0

---

## 総括

**結果: 部分検証（環境制約により中核フローはブラウザ単体では到達不能。実装バグは未検出）**

ブラウザ検証を実施したが、本 Issue の中核（ディレクトリ削除 → `directory.deleted` 発行 → worker 連鎖 → `directoryId` フィルタ SavedView の broken マーク）は、開発環境（`pnpm dev`）の構造的制約により**ブラウザ単体では観測できなかった**。検出された阻害要因はすべて環境仕様であり、実装バグは見つかっていない。本 Issue のイベント連鎖は自動テスト（unit / integration）で end-to-end に担保されている。

## テスト結果一覧

| TC | 内容 | 判定 | 備考 |
|----|------|------|------|
| TC-181-1 | サインアップ/ログイン | PARTIAL | サインアップ 200 成功 / ログインはメール認証必須で 401 ブロック（環境仕様） |
| TC-181-2 | ディレクトリ作成 | BLOCKED | ログイン不可のため未到達 |
| TC-181-3 | directoryId フィルタの SavedView 作成 | BLOCKED | 同上 |
| TC-181-4 | ディレクトリ削除 | BLOCKED | 同上 |

## 検証で判明した環境制約（いずれも実装バグではない）

### 1. ログインにメール認証が必須
- サインアップは `POST /_serverFn/...signUpFn` が 200 を返し「確認メールを送信しました」へ遷移（正常動作）。
- 未確認アカウントでのログインは `POST /_serverFn/...loginFn` が **401**、/login に「メールアドレスの確認が未完了です」を表示。
- → ブラウザ単体ではログイン後フロー（ディレクトリツリー・FilterBar・SavedView）に到達できない。
- テスト方針どおり、サブエージェントは DB 直接操作によるメール確認スキップを行っていない。

### 2. 開発環境の D1 が 2 系統に分かれている
- `pnpm dev`（@cloudflare/vite-plugin の miniflare）が使う D1: `node_modules/.mf/v3/d1`
- `pnpm db:migrate` / `wrangler d1 execute --local` が対象とする D1: `.wrangler/state/v3/d1`
- `db:migrate` は後者にのみマイグレーションを適用するため、vite 側 D1（`node_modules/.mf`）は **`users` テーブルすら存在しない未マイグレーション状態**。
- 加えて実行中の vite サーバーが D1 の WAL ロックを保持するため、外部プロセス（`wrangler d1 execute --persist-to node_modules/.mf`）からの確実な inspect ができない。

### 3. worker cron 連鎖が `pnpm dev` では自動発火しない
- 本 Issue の中核挙動（SavedView の broken マーク）は outbox → relay（cron）→ consumer（queue）→ `view.handleDirectoryDeletedEvent` という非同期連鎖に依存する。
- `pnpm dev`（workerd 単一プロセス）では cron トリガーが発火しないため、ブラウザ操作後に broken マークが立つ様子を観測できない。
- testing.md 記載の relay/consumer 単体起動（`wrangler dev --env relay/consumer`）は、上記 2 の D1 分離により vite サーバーの D1（`node_modules/.mf`）を共有できず、開発環境での再現が困難。

## 中核挙動の担保（自動テストでの end-to-end 検証）

ブラウザで観測できなかった本 Issue のイベント連鎖は、以下の通過済みテストで完全にカバーされている（実装フェーズおよび本検証時に再実行し全 PASS を確認）:

- `app/core/application/directory/__tests__/directory.integration.test.ts`（21 件 PASS）— 実 `DeleteDirectory` ユースケースが、空ディレクトリで `directory.deleted` を 1 件、サブツリーで削除ディレクトリ数分発行することを outbox に対してアサート。
- `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts` — `directory.deleted` が `view.handleDirectoryDeletedEvent` に routing され、空文字 directoryId で BusinessRuleError → handled、transient で retry になることをアサート。
- `app/core/application/directory/__tests__/eventDecoders.test.ts` — payload の VO 化と strict schema 違反の拒否をアサート。
- `app/core/application/view/__tests__/handlers.test.ts` — handler が `directoryId` 参照の SavedView を broken マークし、再配信で冪等 no-op になることをアサート。

## 起票した Issue

なし（環境制約に起因する阻害のみで、実装バグは未検出のため）。

## 成果物

- 本レポート: `.issue/181/manual-test/report.md`
- TC 結果: `.issue/181/manual-test/results/TC-181-1.md` 〜 `TC-181-4.md`
- スクリーンショット: `.issue/181/manual-test/screenshots/tc-181-1/`（step-01〜06）
- シード情報: `.issue/181/manual-test/seed-data.md`
- サーバー情報: `.issue/181/manual-test/server-info.md`
