# Manual Test Report — Issue #57

**実行日時:** 2026-05-21
**Issue:** #57 — queue consumer から runIngestionJob / runExportJob を呼ぶ配線
**テストソース:** `.issue/57/testing.md`
**サーバー:** http://localhost:3000 (`pnpm dev`)

## 実行範囲

Issue #57 は Cloudflare Queue consumer worker (`[env.consumer]`) の配線。queue consumer worker は `pnpm dev` / `pnpm start` のどちらでも起動しないため、ブラウザ越しに ingestion / export ジョブの dispatch・retry を観測することはできない。

したがって本検証は **UI 回帰チェック** に絞って実施し、queue dispatch の振る舞いは integration test (`app/worker/cloudflare/__tests__/handlers.integration.test.ts` + `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`) で 5 ケース + 多数の dispatch ルートを green で担保している。

## 結果サマリー

| 区分 | 件数 |
| --- | --- |
| PASS | 1 (TC-UI-001) |
| FAIL | 0 |
| SKIP_ENV | 5 (確認項目 1〜5) |
| TEST_COVERAGE | 3 (エッジケース 1〜3) |

詳細は `results/summary.md` を参照。

## 確認したUI

1. トップ画面 (`http://localhost:3000/` → `/?page=1&limit=20`) — ヘッダー / ヒーロー / 4 特徴カード / フッター
2. ログイン画面 — メール / パスワード / リメンバーミー / ログインボタン
3. サインアップ画面 (`/signup`) — ユーザー名 / メール / パスワード / 表示名 / 利用規約同意フィールド
4. 管理画面の認証ゲート — 未認証で `/admin/jobs` にアクセスすると `ForbiddenError: Admin access required` で正しく拒否

## 既知の制約

- queue consumer worker (`[env.consumer]`) が `pnpm dev` で起動しないため、本Issueで配線した dispatch 経路はブラウザ越しに観測不能
- 動作担保は integration test に委ねる
- 本 Issue のスコープには含まれないが、将来 dev で multi-worker をローカル実行できる仕組みを整えるか、専用の `wrangler dev --env consumer` を併走させる手順を docs に書く価値はある（別 Issue 化候補）

## 起票した Issue

なし（UI 回帰問題は検出されず、queue dispatch 観測の困難さは本Issueの責務範囲外）。

## 成果物

- `results/TC-UI-001.md` — UI 回帰チェック詳細
- `results/summary.md` — テスト実行サマリー
- `screenshots/tc-ui-001/step-NN-*.png` — スクリーンショット 5 枚
