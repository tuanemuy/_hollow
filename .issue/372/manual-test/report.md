# ブラウザ検証レポート — Issue #372

**実行日**: 2026-05-31
**対象**: タグ note_count 死蔵列・索引・check・ドメイン API の撤去（#365 フォローアップ）
**サーバー**: `pnpm build` → `pnpm start --port 8787`（local D1 に migration 0013_drop_tags_note_count.sql 適用済み）

## 結論

列 DROP 後も、タグ件数表示は read-time 集計で正しく機能する。ブラウザ検証可能な read-path 2件（TagManager / FilterBar）が両方 PASS。mutation 系と人気順ソートは integration テストで担保済み。**実装バグの検出なし。Issue 起票なし。**

## テスト結果

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | `/tags` TagManager の件数表示（work3/idea2/memo1/archived-only0/unused0） | PASS |
| TC-002 | `/` FilterBar タグファセット件数 | PASS |

両 TC とも、active-only 集計（trashed のみの archived-only が 0）・note_tags 無しの unused が 0 を正しく表示。列に依存しない read-time 集計であることを実機で裏付けた。

## カバレッジの分担

| 観点 | 検証方法 |
|------|----------|
| 件数表示（read-path） | ブラウザ検証（本レポート、PASS） |
| マージ・作成・リネーム（mutation） | integration テスト（agent-browser は server-function POST を 403 で弾くため）。`pnpm test` の integration 509件 green |
| 人気順ソート（sort=noteCount） | UI 非露出のため usecase/DB レベル。integration の sort 回帰テストで担保 |
| migration 適用 | local D1 で `pnpm db:apply:local` 成功（8コマンド = table 再構築）。integration ハーネス（`readD1Migrations`）でも適用確認 |

## 成果物

- 結果サマリー: `.issue/372/manual-test/results/summary.md`
- シード記録: `.issue/372/manual-test/seed-data.md` / `seed.sql`
- スクリーンショット: `.issue/372/manual-test/screenshots/tc-001/`, `tc-002/`

## 軽微な修正

- testing.md のノート一覧パス `/notes` → `/`（実ルートに合わせて修正。実装バグではない）。
