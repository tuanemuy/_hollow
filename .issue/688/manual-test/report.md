# ブラウザ検証レポート — Issue #688: ノート一覧→詳細→編集でメインコンテンツの幅が変わる

**実行日:** 2026-06-13
**テストソース:** .issue/688/testing.md
**サーバー:** http://localhost:3000（pnpm dev / vite）
**ブラウザ:** agent-browser 0.27.1
**総合判定:** ✅ PASS（全確認項目 + エッジケース合格）

## 測定方法

スクリーンショット目視ではなく、`eval` の `getBoundingClientRect()` で実 px を測定。外枠上限(1280px)を確認するため innerWidth=1600 のビューポートで計測。テスト用ノート `幅検証ノート`（本文3段落、過去版1件）を UI 上で作成して各画面を検証。

## 測定結果（innerWidth=1600, 単位 px）

| 画面 | 要素 | 幅 | left | right | 期待 | 判定 |
|------|------|----|------|-------|------|------|
| 一覧(/) | main | 1280 | 290 | 1570 | ≒1280 | ✅ |
| 詳細 | main | 1280 | — | — | ≒1280 | ✅ |
| 詳細 | article | 1232 | — | — | 外枠まで拡大(760撤廃) | ✅ |
| 詳細 | h1(タイトル) | 1232 | 314 | 1546 | 外枠まで拡大 | ✅ |
| 詳細 | .note-detail-content | 760 | 314 | — | ≒760 | ✅ |
| 編集 | titleInput | 1232 | 314 | 1546 | 詳細と一致 | ✅ |
| 編集 | .note-detail-content (inline) | 760 | 314 | — | ≒760 | ✅ |
| 履歴一覧 | article | 760 | — | — | ≒760 | ✅ |
| 過去版詳細 | article / content | 760 | 550 | 1310 | ≒760 | ✅ |
| 保存ビュー | main | 1280 | 290 | 1570 | ≒1280 | ✅ |

### 核心: 詳細→編集のガタつき解消

- 詳細タイトル `h1`: left=314, right=1546（幅 1232）
- 編集タイトル `titleInput`: left=314, right=1546（幅 1232）

→ **左右端が完全一致**。従来の「詳細 760px → 編集 1100px」の +340px ジャンプが消え、視覚的連続性が回復した。本文プローズは両画面とも 760px（`.note-detail-content`）で左端 314 が揃う。

## エッジケース

- 狭ビューポート(390px)で home / detail / edit / history / revision / savedviews を開き、いずれも `document.documentElement.scrollWidth == innerWidth(390)`。横スクロール発生なし（`max-w` は上限のため狭幅では `w-full` が効く）。

## 気づき・補足

- 重大なレイアウト崩れは無し。すべて期待通り。
- 新規作成エディタの初期モードは WYSIWYG(TipTap)。本文ホストは `.ProseMirror`(1198px) で `.note-detail-content` ではないため 760px に絞られないが、これは元から仕様通り（編集 inline モード / 詳細プローズが 760px の `.note-detail-content` を担保）。edit 画面は初期 inline モードで `.note-detail-content`=760px を確認。
- 検証環境上の注意（コードではなくツール制約）: エディタ系 URL への直接 `open` が CDP eval をブロックしてハングする事象があり、アプリ内リンクの `click`（SPA遷移）経由で到達・測定した。`set viewport` はページ再 open で初期値に戻るため都度 1600 を再設定して計測。

## 起票した Issue

なし（全項目 PASS）。
