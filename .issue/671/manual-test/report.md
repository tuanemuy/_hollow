# ブラウザ検証レポート — Issue #671: 公開検索(P32)フィルターUIの改善

**実行日時**: 2026-06-13
**テストソース**: .issue/671/testing.md
**サーバー**: http://localhost:3000（`pnpm db:migrate` + `pnpm dev`）
**検証ツール**: agent-browser 0.27.1

## 結果概要

全 10 テストケース **PASS**（FAIL: 0）。起票した Issue なし。

| グループ | テストケース | 結果 |
|---|---|---|
| A: 期間デフォルト化（デスクトップ） | TC-1, TC-2, TC-3, TC-edge | 全 PASS |
| B: モバイルモック追従 | TC-4, TC-5, TC-6 | 全 PASS |
| C: チップレイアウト修正 | TC-7a, TC-7b, TC-7c | 全 PASS |

## シードデータ

- 公開ノート10件（共通キーワード `hollow671` でヒット）、複数ユーザー（p671-alice/p671-bob/dev-admin）・複数タグ（p671-tech/p671-diary/p671-design）
- 期間バンド件数: 過去7日=3 / 過去30日=5 / 過去1年=8 / すべて=10
- search_documents は AFTER INSERT トリガーで FTS5 に自動同期
- 詳細: `.issue/671/manual-test/seed-data.md`

## 主要な確認結果

### 課題1: 期間「すべて」のデフォルト化（AC-1〜5）
- 「すべて」適用後 URL に `period` パラメータが載らない（`period=all` も無い）
- 期間チップ非表示・フィルターボタンのバッジに数えられない
- period 未指定時にラジオ「すべて」が `checked=true`、他は `false`
- 7d/30d/1y は従来どおりチップ・バッジ・ラジオ checked・件数（7日=3/1年=8）

### 課題3: モバイルモック追従（AC-6〜9, 14, 15）
- ドロワー: position=fixed, bottom=0, 幅=画面いっぱい(375px), 上角丸12px, max-height=88vh(714px)。下からせり上がり、閉じると下へスライド。backdrop（黒32%, z=90）あり
- footer: 適用ボタン height=48px/flex-grow=1/全幅占有、リセット height=44px
- チップ行: flex-wrap=nowrap, overflow-x=auto, scrollbar非表示, 実オーバーフロー(scrollWidth>clientWidth)。各チップ・「すべて解除」とも height=32px/shrink-0、remove(×)=22px

### 追加課題A/B: チップ崩れ（AC-10, 11）
- @ユーザーチップ内アバター=16x16px（28px化なし）。ドロワー内 token アバターも16px・はみ出しなし
- チップ行はフィルターバーの**直接の兄弟**（`filterBlock.contains(chip)=false`）。全幅(width=1216, left=32)の独立行で、フィルターバー直下に配置。3チップすべて同一 top/height で整列（上下ずれなし）

## 静的チェック（実装時）

- `pnpm typecheck`: PASS
- `pnpm lint:fix`: PASS
- `pnpm format`: PASS
- `pnpm test:unit`: PASS（SearchFilterDrawer 6/6 含む全テスト通過）

## 結論

Issue #671 の全受け入れ基準（AC-1〜AC-15）をブラウザ検証で確認。px 完全一致ではなく rem ベース慣習で評価（コメント合意）。修正前バグ（アバター28px化・チップがフィルターボタンと同一flex行に挟まる）はいずれも再現せず、解消を確認した。
