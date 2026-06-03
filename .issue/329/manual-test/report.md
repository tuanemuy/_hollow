# ブラウザ検証レポート — Issue #329: 内部リンクバックフィル運用 usecase の起動口整備

**実行日時**: 2026-06-03
**サーバー**: http://localhost:3010（pnpm dev, Cloudflare ランタイム）
**テストソース**: .issue/329/testing.md

## 結果サマリー
2 件中 2 件 PASS（FAIL 0）。起票 Issue なし。

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | admin で `/admin/jobs` に「内部リンクのバックフィル」セクション（見出し＋「バックフィルを実行」ボタン＋全 owner 再解決の説明）が描画され、既存「検索インデックスの再構築」と併存 | PASS |
| TC-002 | 未認証セッションで `/admin/jobs` は本文を描画せず「アクセスできません」エラー画面 | PASS |

## スクリーンショット
- tc-001/step-01.png（全ページ）、tc-001/step-02.png（再構築＋バックフィルセクション）
- tc-002/step-01.png（アクセス拒否画面）

## ブラウザ検証の限界と補完
mutation（実行ボタン → server-function POST）は cross-origin 403 でブラウザ検証不可（hollow 既知の制約）。バックフィルの実行・集計・冪等性・認可は integration テスト（3件 PASS）で担保済み。詳細は results/summary.md。

## 環境
- admin 検証用に dev D1 へ admin ユーザー＋セッションを直接投入（検証後に削除済み）。本番データには影響なし。
