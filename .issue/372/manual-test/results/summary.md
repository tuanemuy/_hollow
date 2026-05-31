# テスト実行サマリー — Issue #372

**実行日時**: 2026-05-31
**テストソース**: .issue/372/testing.md
**サーバー**: http://localhost:8787（`pnpm build` → `pnpm start`、local D1 に migration 0013 適用済み）
**ログイン**: tag365@example.com / TestPassword123!

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | タグ件数表示（/tags TagManager） | 正常系 | PASS | work3/idea2/memo1/archived-only0/unused0 一致。active-only 集計を確認 |
| TC-002 | FilterBar タグファセット件数（`/`） | 正常系 | PASS | 同件数一致。エラー描画なし。`/notes` は 404 のため `/` で実施 |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## ブラウザ検証の対象範囲

- **検証した（read-path）**: 列 DROP 後も read-time 集計でタグ件数が正しく表示されるか。TagManager・FilterBar の両 DTO コンシューマで確認。
- **integration テストで担保（mutation）**: タグのマージ・作成・リネームは server-function POST。agent-browser からは 403 FORBIDDEN_CROSS_ORIGIN で弾かれるため（既知制約）、ブラウザ自動検証せず `pnpm test`（integration 509件 green）で担保。
- **UI 非露出**: 人気順ソート（sort=noteCount）は画面切替 UI が無く、usecase/DB レベルで検証（integration テストの sort 回帰で担保）。

## 検出した軽微な手順差異（その場修正）

- testing.md がノート一覧を `/notes` と記載していたが、実ルートは `/`。testing.md を修正済み（実装バグではなくドキュメント差異）。
