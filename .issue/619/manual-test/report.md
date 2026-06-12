# Browser Verify Report — Issue #619 (P30 ユーザー公開ページ)

**実行日時**: 2026-06-12
**テストソース**: .issue/619/testing.md
**サーバー**: http://localhost:3000（PORT=3000 pnpm dev / vite+workerd）
**修正ラウンド**: 0回（コア機能は初回で全PASS）

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 8 |
| PASS | 7 |
| FAIL | 1 |
| PASS率 | 87.5% |
| 起票/追記Issue数 | 2（#599 にコメント追記 + Popover 垂直ビューポート Issue 新規） |

---

## シードデータ

`test-public-user`（表示名「公開テストユーザー」、bio あり）。公開ノート8件、公開日を 2026-06-12（今日）/06-09/06-05/05-22/05-12/04-12/01-12/2025-09-12 に分散。タグ TypeScript/設計/日記。非公開コントロール1件。スクリプト `scripts/seed-public-user.mjs`（冪等）。

---

## テスト結果一覧

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | プロフィールヒーロー構造 | 正常系 | PASS | computedStyle 実測でモック一致を確認 |
| TC-002 | ソートのドロップダウン化 | 正常系 | PASS | 選択式・role・URL・キーボード・Esc 全PASS（off-viewport miss は別件 Issue） |
| TC-003 | 楽観的即時反映 | 正常系 | PASS | data-active/URL/display 即時 |
| TC-004 | 期間フィルター | 正常系 | PASS | 公開日基準・to inclusive・横断・空状態・クリア |
| TC-005 | ノート日付（公開日＋相対） | 正常系 | PASS | 「公開」・「今日」確認、「更新」皆無 |
| EDGE-2 | 期間ヒット0件 | 異常系 | PASS | 空状態・ページネーション健全 |
| EDGE-3 | 存在しないユーザー | 異常系 | FAIL | 500（既存バグ #599 同根本、#619非起因） |
| EDGE-4 | 不正 search param | 異常系 | PASS | `.catch(undefined)` で無視 |

---

## TC-001 詳細（プロフィールヒーロー）— PASS

- デスクトップ(1280px): `.profile-hero` = `flex-direction:column; gap:20px`、`.profile-head` = `flex-direction:row; align-items:center; gap:24px`、名前 `margin-bottom:4px`。アバター・名前は横並び中央揃え、bio/統計は heroLeft と同一左端(32px)から全幅（インデントなし）。
- モバイル(375px): hero gap:12px / head row gap:16px、avatarLeft=bioLeft=16px、横並び維持・全幅配置。
- いずれもモックと差異なし。

## TC-002 詳細（ソートドロップダウン）— PASS（堅牢性の別件あり）

- ソートボタン（chevron-down 付き）クリックで `menu "並び順"`(role=menu) が開き、`menuitemradio` ×4（公開日順 checked / 更新日順 / 作成日順 / タイトル順）。順送りサイクルではない。
- 選択でラベル更新・URL `?sort=` 反映・一覧並び替え。デフォルト（公開日順）で URL から `sort` 消去。Esc で閉じトリガーにフォーカス復帰。キーボード（Enter→↑↓→Enter）動作。
- **別件**: ソートボタンがページ下部に来る短いビューポート（高さ633px等）では、下方向に開くメニューの最終項目「タイトル順」が画面外にはみ出し、実マウスクリックが座標外に外れてメニューが閉じ選択が落ちる。headed 実ブラウザでも再現（高さ1000pxにすると成功）。共有 `usePopover` が水平クランプ（shiftX）のみで垂直ビューポート処理（フリップ/クランプ/スクロールイン）を持たないのが根本。auth 側メニューも同構造。→ 新規 Issue 起票。

## TC-003 詳細（楽観的即時反映）— PASS

- タグ chip クリックで `data-active=true`・URL `?tags=[...]` 反映・一覧絞り込み、再クリックで解除。
- 表示モード切替: tile→`?display=tile`、calendar→`?display=calendar`、list→消去。`role=tab` の `aria-selected` 追従、レイアウト即変化、再フェッチを起こさず即時（display は loaderDeps 除外）。巻き戻りなし。

## TC-004 詳細（期間フィルター）— PASS

- 「期間」chip → `dialog "期間フィルタ"`（プリセット: 今日/今週/今月/過去30日/過去90日/今年 ＋ 範囲入力 ＋ クリア）。
- from=2026-06-01,to=2026-06-12 で公開日が6月の3件（06-12/06-09/06-05）に絞り込み（更新日でなく**公開日**基準）。**to=06-12 で今日公開ノートが含まれる（inclusive）**。
- ソート軸を title に変えても期間維持。リロード/URL直接ロードで維持。ヒット0件で空状態・ページネーション健全。クリアで全8件復帰。

## TC-005 詳細（日付）— PASS

- メタ行「YYYY年M月D日 公開」（main全体で「公開」多数、「更新」0箇所）。右列相対表現: 今日公開→「今日」、他→「M月D日」、年跨ぎ→「YYYY年M月D日」。タイル・カレンダーも公開日基準。

---

## 失敗詳細

### EDGE-3: 存在しないユーザー（notFound 経路）

- **失敗ステップ**: `/u/nonexistent-user-xyz` を開く
- **期待**: 404 / notFound エラーページ
- **実際**: 「予期しないエラーが発生しました」＋ `Error code: 500 Internal Server Error`（system エラーページ）
- **分類**: 実装バグ（既存・#619 非起因）
- **原因分析**: `UserPublicTop.tsx:46` は不在時に `throw notFound()` するが、これは `renderUserPublicTop` サーバー関数内の RSC ストリーム（`renderServerComponent`）でレンダリングされており、RSC 内で投げた `notFound()` がルーターの notFound シグナルとして伝播せず、`notFoundComponent` ではなく `errorComponent`（system/500）に落ちる。**#599（公開ノート詳細ルートの同根本原因）と同一クラスのバグ**で、#619 では RSC/notFound 構造を変更していない（pre-existing）。
- **対応**: 新規起票せず #599 にコメント追記（P30 ユーザートップ route も同様に要対応）。

---

## 環境情報

- **OS**: Darwin 25.4.0
- **agent-browser**: 0.27.1（headed 切り分けに使用）
- **サーバーコマンド**: PORT=3000 pnpm dev
- **ポート**: 3000
