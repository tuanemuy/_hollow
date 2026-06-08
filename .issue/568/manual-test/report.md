# ブラウザ検証レポート — Issue #568

**実行日:** 2026-06-09
**テストソース:** `.issue/568/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**シード:** `.issue/568/manual-test/seed-data.md`（user `seeduser` / 公開ノート7・非公開1・タグ5・内部リンク2）

## サマリー

| TC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| TC-001 | P31 公開バックリンク・関連ノート | PASS（コア） | エッジ「非公開ゲート」のみ既知の先行バグ #599 |
| TC-002 | P32 検索フィルタードロワー | PASS（全7ステップ） | combobox/期間facet/active-chip/URL同期/Esc閉じ |
| TC-003 | P30 公開トップ chip・表示モード・ソート | PASS（全7ステップ） | chip絞り込み/解除/タイル/カレンダー/ソート/空状態 |

**合計:** 3 件（実質 PASS: 3 / FAIL: 0 / 既知の先行バグ: 1 エッジケース）

## 詳細

### TC-001 — P31 公開バックリンク・関連ノート

- ✅ バックリンクセクションに公開参照元 A のみ表示（非公開参照元 C は除外）
- ✅ 関連ノートグリッドに同著者の他の公開ノートが当該除外・最大4枚、各カードに公開日+タグ
- ✅ バックリンクリンクのクリックで参照元ノートへ遷移
- ⚠️ エッジ「非公開ノートを `/notes/public/$noteId` で開く」: NotFound ページではなく汎用 500 が描画される
  - **これは #568 とは無関係の既知の先行バグ #599**（「公開ノート詳細ルートが NotFound を汎用500として描画する（RSC 内 notFound が notFoundComponent に届かない）」）。
  - 該当ルート `app/routes/notes/public/$noteId.tsx` は本ブランチで未変更（main と同一）。`PublicNoteDetail` の notFound 経路も main とバイト単位で同一。本 Issue が混入させた回帰ではない。スコープ外。

### TC-002 — P32 検索フィルタードロワー（全 PASS）

- ✅ 検索結果5件 + filter-bar（件数・フィルターボタン・「関連度順」ラベル）
- ✅ ドロワー（`role="dialog"` 右スライド）にユーザー/タグ combobox・期間 radio・footer「N件を表示」・期間 facet 件数
- ✅ タグ combobox サジェスト（`t` 入力で #tech/#travel 候補）→ 選択で `tags` を URL 反映
- ✅ 期間 radio で絞り込み（`period=30d`）・facet 件数が選択中フィルターを反映して動的再計算
- ✅ active-chip の×で条件解除・URL からパラメタ除去
- ✅ Esc / 閉じるボタンでドロワークローズ（閉時 `aria-hidden=true`）

### TC-003 — P30 公開トップ chip・表示モード・ソート（全 PASS）

- ✅ filter-row の chip 群（すべて/各タグ）・表示モードセグメント・ソートボタン表示
- ✅ タグ chip で絞り込み（`tags=["travel"]`）→「すべて」で解除・全件復帰
- ✅ タイル切替（`display=tile`）・カレンダー切替（`display=calendar`、日付グルーピング）
- ✅ ソートトグル（公開日順→作成日順、`sort=createdAt`、ラベルもトグル）
- ✅ 空状態ユーザー（公開0件）で filter UI が正常レンダリング・エラーなし

## agent-browser 上の制約（実装不具合ではない）

- ドロワー再レンダリングで snapshot 由来 ref が失効 → `find role ... --name` の取り直しで正常動作を確認
- ドロワーは閉時も DOM マウントしたまま `aria-hidden=true` で画面外へスライドアウトする実装。クローズ判定は trigger の `aria-expanded` 変化・snapshot のノード消失・スクショで確認

## 起票

- 新規起票なし（唯一の不一致は既知の先行バグ #599 で本 Issue スコープ外）。
